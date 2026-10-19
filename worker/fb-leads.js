// fb-leads.js — Meta (Facebook/Instagram) Lead Ads → Sổ Khách.
//
// Nguyên tắc: KHÔNG MẤT LEAD.
//   1. Mọi leadgen_id nhận được (webhook / quét / kéo bù / Make) ghi vào `fb_lead_queue` TRƯỚC.
//   2. Webhook chỉ trả 200 sau khi ghi hàng chờ thành công; lỗi ghi → 503 để Meta gửi lại.
//   3. Cron 5 phút xử lý hàng chờ (≤ FB_BATCH_SIZE lead/lượt), lỗi tạm thời thì lùi giờ thử lại.
//   4. Khách trùng SĐT → gọi RPC `fb_attach_lead` (không PATCH bảng customers, không tạo trùng).
//
// Route: GET/POST /fb/webhook · POST /fb/manual · POST /fb/poll · POST /fb/backfill · GET /fb/health
// Secret: xem worker/README.md và docs/runbooks/meta-lead-ads.md.
import { createRun, makeQueueRow, runBackfill, runCron } from './meta/runs.js';
import { INTEGRATION_ID, runHealthCheck } from './meta/health.js';
import { parseFieldData } from './meta/mapping.js';
import { normalizePhoneVN } from './meta/phone.js';
import { finalizeRun, processQueueItem } from './meta/process.js';
import { validSignature } from './meta/signature.js';

export { normalizePhoneVN, parseFieldData };
export { runCron };

const TEXT = { 'Content-Type': 'text/plain; charset=utf-8' };

export async function handleFb(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/fb/webhook' && request.method === 'GET') return verifyWebhook(url, env);
  if (path === '/fb/webhook' && request.method === 'POST') return receiveWebhook(request, env, ctx);
  if (path === '/fb/manual' && request.method === 'POST') return receiveManual(request, env);

  if (path === '/fb/poll' && request.method === 'POST') {
    if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    return json(await runCron(env));
  }
  if (path === '/fb/backfill' && request.method === 'POST') {
    if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Bad JSON' }, 400);
    }
    const result = await runBackfill(env, body || {});
    return json(result.body, result.status);
  }
  if (path === '/fb/health' && request.method === 'GET') {
    if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    const run = createRun(env);
    return json(await runHealthCheck(env, run, { force: true }));
  }
  return null; // không phải route Facebook
}

function authorized(request, env) {
  return Boolean(env.FB_MANUAL_SECRET) && request.headers.get('X-Intake-Secret') === env.FB_MANUAL_SECRET;
}

// Facebook gọi GET 1 lần khi bấm "Verify and save" trong cài đặt Webhooks.
function verifyWebhook(url, env) {
  const ok =
    url.searchParams.get('hub.mode') === 'subscribe' &&
    Boolean(env.FB_VERIFY_TOKEN) &&
    url.searchParams.get('hub.verify_token') === env.FB_VERIFY_TOKEN;
  return ok
    ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200, headers: TEXT })
    : new Response('Forbidden', { status: 403, headers: TEXT });
}

function webhookEntries(body) {
  const entries = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen' || !change.value || !change.value.leadgen_id) continue;
      entries.push(change.value);
    }
  }
  return entries;
}

async function receiveWebhook(request, env, ctx) {
  // Phải đọc/đối chiếu trên chuỗi body gốc — không parse rồi stringify lại.
  const raw = await request.text();
  const signature = request.headers.get('X-Hub-Signature-256');
  if (!(await validSignature(raw, signature, env.FB_APP_SECRET))) {
    return new Response('Bad signature', { status: 401, headers: TEXT });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400, headers: TEXT });
  }

  const values = webhookEntries(body);
  const nowIso = new Date().toISOString();
  const rows = values.map((value) => ({
    lead_id: String(value.leadgen_id),
    page_id: value.page_id || env.FB_PAGE_ID || null,
    form_id: value.form_id || null,
    owner_id: env.FB_LEAD_OWNER_ID || null,
    via: 'webhook',
    payload: { ...value, form_name: null },
    attempts: 0,
    next_attempt_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const run = createRun(env);
  let inserted = [];
  if (rows.length) {
    try {
      inserted = await run.store.enqueue(rows);
    } catch (error) {
      // Chưa ghi được hàng chờ = chưa an toàn → Meta gửi lại.
      console.error(
        'fb webhook không ghi được hàng chờ',
        JSON.stringify({ error: (error && error.message) || 'unknown' }),
      );
      return new Response('Try again', { status: 503, headers: TEXT });
    }
  }

  // Mốc nhận webhook hợp lệ (không chặn phản hồi nếu ghi lỗi).
  try {
    await run.store.patchHealth({ last_webhook_at: nowIso });
  } catch {
    /* cron sẽ cập nhật lại */
  }

  const insertedIds = new Set(inserted.map((row) => String(row.lead_id)));
  const work = async () => {
    for (const row of rows) {
      if (!insertedIds.has(String(row.lead_id))) continue; // đã có trong hàng chờ → không xử lý lại
      if (run.budget.left() < 5) break;
      await processQueueItem(run, row);
    }
    await finalizeRun(run);
  };
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work());
  else await work();

  return new Response('EVENT_RECEIVED', { status: 200, headers: TEXT });
}

// Make / Zapier: { full_name, phone, email?, campaign?, form_name?, created_time?, answers?, lead_id? }
// Make không gửi lead_id → mã thay thế từ băm SĐT + giờ gửi (chống trùng khi Make gửi lại) — không để lộ SĐT trong mã/log.
async function manualLeadId(body) {
  if (body.lead_id) return String(body.lead_id);
  const seed = `${body.phone || ''}|${body.created_time || new Date().toISOString()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `manual-${hex.slice(0, 24)}`;
}

function manualLead(body, id) {
  const answers = Object.entries(body.answers && typeof body.answers === 'object' ? body.answers : {}).map(
    ([name, value]) => ({ name, values: [String(value)] }),
  );
  return {
    id,
    created_time: body.created_time || new Date().toISOString(),
    form_id: body.form_id || null,
    campaign_name: body.campaign || null,
    field_data: [
      { name: 'full_name', values: [body.full_name || ''] },
      { name: 'phone_number', values: [body.phone || ''] },
      ...(body.email ? [{ name: 'email', values: [body.email] }] : []),
      ...answers,
    ],
  };
}

async function receiveManual(request, env) {
  if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  const lead = manualLead(body || {}, await manualLeadId(body || {}));
  const run = createRun(env);
  const row = makeQueueRow({
    leadId: lead.id,
    pageId: env.FB_PAGE_ID,
    formId: lead.form_id,
    formName: body.form_name || null,
    via: 'manual',
    env,
    lead,
    nowIso: new Date().toISOString(),
  });

  let inserted;
  try {
    inserted = await run.store.enqueue([row]);
  } catch {
    return json({ error: 'Chưa ghi được hàng chờ — thử lại.' }, 503);
  }
  if (!inserted.length) return json({ status: 'duplicate', lead_id: lead.id });

  const result = await processQueueItem(run, row);
  await finalizeRun(run);
  return json(result, result.status === 'error' ? 500 : 200);
}

function json(object, status = 200) {
  return new Response(JSON.stringify(object), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Chỉ để tương thích với nơi từng import INTEGRATION_ID từ module này.
export { INTEGRATION_ID };
