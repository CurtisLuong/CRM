// fb-leads.js — NHẬN LEAD FACEBOOK LEAD ADS → ghi thẳng vào Supabase (bảng customers, lớp "Khách mới").
//
// 3 đường vào (cùng 1 hàm ghi saveLead, chống trùng theo mã lead Facebook ở bảng fb_leads):
//   1. WEBHOOK  GET/POST /fb/webhook — Facebook báo ngay khi có lead (cần app Meta ở chế độ Live).
//   2. QUÉT ĐỊNH KỲ (cron 5 phút, scheduled) — đọc lead mới của mọi form trên Page. Chạy được cả khi app
//      Meta còn ở chế độ Development → lưới an toàn nếu webhook chưa bật / bị lỡ.
//   3. POST /fb/manual — nhận lead dạng JSON đơn giản từ Make / Zapier (phương án dự phòng, có mật khẩu).
//
// Ghi khách: owner = FB_LEAD_OWNER_ID (trưởng nhóm, chia cho đồng nghiệp bằng "Giao khách" trong app),
// source ["facebook_ads"], intake_method 'api', campaign = tên chiến dịch (hoặc tên form), registered_at =
// giờ khách bấm gửi form, câu trả lời form → cột notes ("Thông tin đăng ký"). SĐT đã có (bất kỳ ai phụ
// trách) → KHÔNG tạo trùng: thêm kênh facebook_ads + 1 ghi chú "đăng ký lại" vào khách cũ.
//
// Secret cần đặt (wrangler secret put <TÊN>) — xem worker/README.md mục Facebook Lead Ads:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (BÍ MẬT — chỉ ở Worker), FB_LEAD_OWNER_ID,
//   FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET, FB_VERIFY_TOKEN, [FB_MANUAL_SECRET], [FB_GRAPH_VERSION]

const GRAPH_DEFAULT = 'v23.0';
const LEAD_FIELDS_FULL = 'id,created_time,field_data,form_id,ad_id,ad_name,adset_name,campaign_id,campaign_name,platform,is_organic';
const LEAD_FIELDS_MIN = 'id,created_time,field_data,form_id,ad_id,campaign_id,platform,is_organic';
const POLL_LOOKBACK_H = 48; // cron quét lead trong 48h gần nhất (trùng thì bỏ qua) — đủ bù webhook lỡ

// ─── Router ───────────────────────────────────────────────────────────────────
export async function handleFb(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/fb/webhook' && request.method === 'GET') return verifyWebhook(url, env);
  if (url.pathname === '/fb/webhook' && request.method === 'POST') return receiveWebhook(request, env, ctx);
  if (url.pathname === '/fb/manual' && request.method === 'POST') return receiveManual(request, env);
  if (url.pathname === '/fb/poll' && request.method === 'POST') { // chạy quét ngay (thử nghiệm), cần mật khẩu
    if (!env.FB_MANUAL_SECRET || request.headers.get('X-Intake-Secret') !== env.FB_MANUAL_SECRET) return json({ error: 'Unauthorized' }, 401);
    return json(await pollLeads(env));
  }
  return null; // không phải route Facebook
}

// Facebook gọi GET 1 lần khi bấm "Verify and save" trong cài đặt Webhooks.
function verifyWebhook(url, env) {
  const ok = url.searchParams.get('hub.mode') === 'subscribe' && env.FB_VERIFY_TOKEN
    && url.searchParams.get('hub.verify_token') === env.FB_VERIFY_TOKEN;
  return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Forbidden', { status: 403 });
}

async function receiveWebhook(request, env, ctx) {
  const raw = await request.text();
  if (!(await validSignature(raw, request.headers.get('X-Hub-Signature-256'), env.FB_APP_SECRET))) {
    return new Response('Bad signature', { status: 401 });
  }
  let body; try { body = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }
  const ids = [];
  for (const entry of body.entry || []) for (const ch of entry.changes || []) {
    if (ch.field === 'leadgen' && ch.value && ch.value.leadgen_id) ids.push(String(ch.value.leadgen_id));
  }
  // Trả 200 ngay cho Facebook (nó gửi lại nếu chậm/lỗi), xử lý ở nền.
  const work = (async () => { for (const id of ids) { try { await processLeadId(id, env); } catch (e) { console.error('lead', id, e.message); } } })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function validSignature(raw, header, secret) {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  const got = header.slice(7);
  if (got.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i); // so sánh thời gian cố định
  return diff === 0;
}

// Make / Zapier: { full_name, phone, email?, campaign?, form_name?, created_time?, answers?: {câu hỏi: trả lời}, lead_id? }
async function receiveManual(request, env) {
  if (!env.FB_MANUAL_SECRET || request.headers.get('X-Intake-Secret') !== env.FB_MANUAL_SECRET) return json({ error: 'Unauthorized' }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const answers = Object.entries(b.answers || {}).map(([name, v]) => ({ name, values: [String(v)] }));
  const lead = {
    id: String(b.lead_id || `manual-${b.phone || ''}-${b.created_time || Date.now()}`),
    created_time: b.created_time || new Date().toISOString(),
    field_data: [
      { name: 'full_name', values: [b.full_name || ''] },
      { name: 'phone_number', values: [b.phone || ''] },
      ...(b.email ? [{ name: 'email', values: [b.email] }] : []),
      ...answers,
    ],
    campaign_name: b.campaign || null,
  };
  const r = await saveLead(lead, b.form_name || null, env, 'manual');
  return json(r, r.status === 'error' ? 500 : 200);
}

// ─── Đọc lead từ Graph API ──────────────────────────────────────────────────
function graph(env, path, params = {}) {
  const v = env.FB_GRAPH_VERSION || GRAPH_DEFAULT;
  const qs = new URLSearchParams({ ...params, access_token: env.FB_PAGE_ACCESS_TOKEN });
  return fetch(`https://graph.facebook.com/${v}/${path}?${qs}`).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const e = new Error((data.error && data.error.message) || `Graph ${res.status}`);
      e.code = data.error && data.error.code; throw e;
    }
    return data;
  });
}
// Trường tên chiến dịch / quảng cáo cần thêm quyền ads_read — thiếu thì đọc bản tối thiểu.
async function fetchLead(id, env) {
  try { return await graph(env, id, { fields: LEAD_FIELDS_FULL }); }
  catch { return graph(env, id, { fields: LEAD_FIELDS_MIN }); }
}
const _formNames = new Map();
async function formName(formId, env) {
  if (!formId) return null;
  if (_formNames.has(formId)) return _formNames.get(formId);
  let name = null; try { name = (await graph(env, formId, { fields: 'name' })).name || null; } catch { /* bỏ qua */ }
  _formNames.set(formId, name);
  return name;
}

async function processLeadId(id, env) {
  if (await alreadyLogged(id, env)) return { status: 'duplicate', lead_id: id };
  const lead = await fetchLead(id, env);
  return saveLead(lead, await formName(lead.form_id, env), env, 'webhook');
}

// Cron: quét lead mới của mọi form trên Page (lead đã ghi thì bỏ qua).
export async function pollLeads(env) {
  if (!env.FB_PAGE_ID || !env.FB_PAGE_ACCESS_TOKEN) return { skipped: 'Chưa cấu hình FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN' };
  const since = Math.floor(Date.now() / 1000) - POLL_LOOKBACK_H * 3600;
  const out = { forms: 0, created: 0, merged: 0, duplicate: 0, error: 0 };
  const forms = await graph(env, `${env.FB_PAGE_ID}/leadgen_forms`, { fields: 'id,name,status', limit: '100' });
  for (const f of forms.data || []) {
    out.forms++;
    _formNames.set(f.id, f.name || null);
    let page = await graph(env, `${f.id}/leads`, {
      fields: LEAD_FIELDS_MIN, limit: '100',
      filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]),
    });
    for (let guard = 0; guard < 20 && page; guard++) {
      for (const lead of page.data || []) {
        if (await alreadyLogged(lead.id, env)) { out.duplicate++; continue; }
        let full = lead; try { full = await fetchLead(lead.id, env); } catch { /* dùng bản tối thiểu */ }
        const r = await saveLead(full, f.name || null, env, 'poll');
        out[r.status] = (out[r.status] || 0) + 1;
      }
      const next = page.paging && page.paging.next;
      page = next ? await fetch(next).then((r) => r.json()) : null;
    }
  }
  return out;
}

// ─── Ghi vào Supabase (service role — bỏ qua RLS, chỉ chạy ở Worker) ─────────────
function sb(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  }).then(async (res) => {
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) { const e = new Error((data && (data.message || data.hint)) || `Supabase ${res.status}`); e.code = data && data.code; throw e; }
    return data;
  });
}
async function alreadyLogged(leadId, env) {
  const rows = await sb(env, `fb_leads?lead_id=eq.${encodeURIComponent(leadId)}&select=lead_id&status=neq.error`);
  return Array.isArray(rows) && rows.length > 0;
}

// Chuẩn hoá SĐT VN — GIỐNG normalizePhoneVN trong js/app.js (để khớp chống trùng).
export function normalizePhoneVN(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  p = p.replace(/\D/g, '');
  if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
  if (p && !p.startsWith('0') && p.length < 10) p = '0' + p;
  return p;
}

const LABELS = { full_name: 'Họ tên', first_name: 'Tên', last_name: 'Họ', phone_number: 'SĐT', email: 'Email', city: 'Thành phố', job_title: 'Nghề nghiệp', date_of_birth: 'Ngày sinh' };
// field_data của Facebook → { full_name, phone, email, apt_type, lines[] (mọi câu hỏi/trả lời, để ghi chú) }
export function parseFieldData(fieldData) {
  const get = (n) => { const f = (fieldData || []).find((x) => x.name === n); return f && f.values && f.values[0] ? String(f.values[0]).trim() : ''; };
  const full = get('full_name') || [get('last_name'), get('first_name')].filter(Boolean).join(' ');
  let apt = '';
  const lines = [];
  for (const f of fieldData || []) {
    const v = (f.values || []).join(', ').trim(); if (!v) continue;
    const label = LABELS[f.name] || String(f.name).replace(/_/g, ' ');
    lines.push(`${label}: ${v}`);
    // Câu hỏi tuỳ chỉnh về loại căn (vd "bạn_quan_tâm_loại_căn_nào?") → cột apt_type.
    if (!apt && /lo[aạ]i.?c[aă]n|c[aă]n.?h[oộ]|ph[oò]ng.?ng[uủ]|apartment/i.test(f.name)) apt = v;
  }
  return { full_name: full, phone: normalizePhoneVN(get('phone_number') || get('phone')), email: get('email'), apt_type: apt, lines };
}

/**
 * Ghi 1 lead. Trả { status: 'created' | 'merged' | 'duplicate' | 'error', customer_id?, error? }.
 * Luôn ghi 1 dòng fb_leads (kể cả lỗi — giữ dữ liệu gốc để không mất lead).
 */
export async function saveLead(lead, form, env, via) {
  const p = parseFieldData(lead.field_data);
  const at = lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString();
  const campaign = lead.campaign_name || form || null;
  const log = async (status, customerId, error) => sb(env, 'fb_leads', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      lead_id: String(lead.id), page_id: env.FB_PAGE_ID || null, form_id: lead.form_id || null, form_name: form,
      ad_id: lead.ad_id || null, campaign_name: lead.campaign_name || null, created_time: at,
      customer_id: customerId || null, status, error: error || null, via, raw: lead,
    }),
  }).catch((e) => console.error('fb_leads log lỗi', e.message));
  try {
    if (!env.FB_LEAD_OWNER_ID) throw new Error('Chưa đặt FB_LEAD_OWNER_ID (id tài khoản nhận lead)');
    if (!p.phone) throw new Error('Lead không có số điện thoại');
    const regText = [`Facebook Lead Ads${form ? ' — form "' + form + '"' : ''}${lead.ad_name ? ' — QC "' + lead.ad_name + '"' : ''}`, ...p.lines].join('\n');

    // Đã có khách cùng SĐT (bất kỳ người phụ trách) → bổ sung, không tạo trùng.
    const existing = await sb(env, `customers?phone=eq.${encodeURIComponent(p.phone)}&select=id,source,notes_manual&order=updated_at.desc&limit=1`);
    if (existing && existing.length) {
      const c = existing[0];
      const source = Array.isArray(c.source) ? [...c.source] : [];
      if (!source.includes('facebook_ads')) source.push('facebook_ads');
      const notes = [{ text: `Đăng ký lại qua ${regText.replace(/\n/g, ' · ')}`, at }, ...(Array.isArray(c.notes_manual) ? c.notes_manual : [])];
      await sb(env, `customers?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ source, notes_manual: notes, updated_at: new Date().toISOString() }) });
      await log('merged', c.id);
      return { status: 'merged', customer_id: c.id };
    }

    const row = {
      owner_id: env.FB_LEAD_OWNER_ID,
      full_name: p.full_name || 'Khách Facebook',
      phone: p.phone,
      source: ['facebook_ads'],
      intake_method: 'api',
      campaign,
      registered_at: at,
      care_stage: 'Đăng kí mới',
      care_stage_updated_at: at,
      care_stage_history: [{ stage: 'Đăng kí mới', note: `Lead Facebook${form ? ': ' + form : ''}`, at }],
      notes: regText,
      ...(p.apt_type ? { apt_type: p.apt_type } : {}),
    };
    const created = await sb(env, 'customers', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    const id = created && created[0] && created[0].id;
    await log('created', id);
    return { status: 'created', customer_id: id };
  } catch (e) {
    await log('error', null, e.message);
    return { status: 'error', error: e.message };
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
