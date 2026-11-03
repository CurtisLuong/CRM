// Điều phối một lượt chạy: quét lead mới → xử lý hàng chờ → ghi tình trạng kết nối.
// Mọi lượt đều có ngân sách fetch riêng (≤45) để không vượt giới hạn gói Cloudflare miễn phí.
import { createBudget, MAX_FETCHES_PER_RUN } from './budget.js';
import { createProjectRules } from './campaignProjects.js';
import { createGraph } from './graph.js';
import { runHealthCheck } from './health.js';
import { configuredPages, envForPage, pageFor } from './pages.js';
import { connectionMessage, processQueueItem, redactError } from './process.js';
import { createStore } from './store.js';

const VN_OFFSET_SECONDS = 7 * 3600;
const POLL_LOOKBACK_H = 48;

export function createRun(env, { now, maxFetches = MAX_FETCHES_PER_RUN } = {}) {
  const clock = now || (() => new Date());
  const budget = createBudget(maxFetches);
  const store = createStore(env, { budget, now: clock });
  const graph = createGraph(env, { budget, now: clock });
  const graphs = new Map();
  // Graph dùng token của đúng Page chứa lead (chung ngân sách fetch của lượt).
  function graphFor(pageId) {
    const page = pageFor(env, pageId);
    if (!page || page.index === 1) return graph;
    if (!graphs.has(page.id)) graphs.set(page.id, createGraph(envForPage(env, page), { budget, now: clock }));
    return graphs.get(page.id);
  }
  return {
    env,
    budget,
    store,
    graph,
    graphFor,
    now: clock,
    projectFor: createProjectRules(store, env.FB_LEAD_OWNER_ID),
    lastLeadAt: null,
    healthError: null,
  };
}

export function batchSize(env) {
  const parsed = Number.parseInt(String(env.FB_BATCH_SIZE || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(parsed, 20);
}

function parseYmd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * Khoảng ngày giờ Việt Nam, bao gồm cả hai đầu.
 * VD 2026-10-01 → 2026-10-15 = 1790787600 → 1792083599.
 */
export function vnRangeToEpoch(since, until, now = new Date()) {
  const start = parseYmd(since);
  if (!start) return null;
  const hasUntil = until !== undefined && until !== null && until !== '';
  const end = hasUntil ? parseYmd(until) : null;
  if (hasUntil && !end) return null;
  const sinceEpoch = Math.floor(Date.UTC(start.year, start.month - 1, start.day) / 1000) - VN_OFFSET_SECONDS;
  const untilEpoch = end
    ? Math.floor(Date.UTC(end.year, end.month - 1, end.day) / 1000) - VN_OFFSET_SECONDS + 86399
    : Math.floor(now.getTime() / 1000);
  if (untilEpoch < sinceEpoch) return null;
  return { since: sinceEpoch, until: untilEpoch };
}

export function makeQueueRow({ leadId, pageId, formId, formName, via, env, lead, nowIso }) {
  const at = nowIso || new Date().toISOString();
  const resolvedForm = formId || (lead && lead.form_id) || null;
  const payload = {
    leadgen_id: String(leadId),
    page_id: pageId || null,
    form_id: resolvedForm,
    form_name: formName || null,
  };
  if (lead) payload.lead = lead;
  return {
    lead_id: String(leadId),
    page_id: pageId || null,
    form_id: resolvedForm,
    owner_id: env.FB_LEAD_OWNER_ID || null,
    via,
    payload,
    attempts: 0,
    next_attempt_at: at,
    created_at: at,
    updated_at: at,
  };
}

/** Quét lead trong 48h gần nhất (lưới an toàn cho webhook) → chỉ ĐƯA VÀO HÀNG CHỜ. Quét mọi Page có token. */
export async function pollRecentLeads(ctx) {
  const env = ctx.env;
  const pages = configuredPages(env).filter((page) => page.token);
  if (!pages.length) return { forms: 0, found: 0, queued: 0, skipped: true };
  const since = Math.floor(ctx.now().getTime() / 1000) - POLL_LOOKBACK_H * 3600;
  const rows = [];
  let formCount = 0;
  let found = 0;
  let truncated = false;
  let firstError = null;
  for (const page of pages) {
    if (ctx.budget.left() < 4) break;
    const graph = ctx.graphFor(page.id);
    let forms;
    try {
      const data = await graph.listForms();
      forms = Array.isArray(data && data.data) ? data.data : [];
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      // 1 Page lỗi token không được chặn việc quét Page khác.
      if (!firstError) firstError = error;
      continue;
    }
    formCount += forms.length;
    for (const form of forms) {
      if (ctx.budget.left() < 4) break;
      const { leads, more } = await graph.leadsOfForm(form.id, since, null, { reserve: 3 });
      if (more) truncated = true; // trang còn lại: lượt cron sau đọc tiếp (lead đã vào hàng chờ được bỏ qua)
      found += leads.length;
      for (const lead of leads) {
        rows.push(
          makeQueueRow({
            leadId: lead.id,
            pageId: page.id,
            formId: lead.form_id || form.id,
            formName: form.name || null,
            via: 'poll',
            env,
            lead,
            nowIso: ctx.now().toISOString(),
          }),
        );
      }
    }
  }
  let inserted = [];
  if (rows.length && ctx.budget.left() >= 1) inserted = await ctx.store.enqueue(rows);
  return { forms: formCount, found, queued: inserted.length, truncated, error: firstError };
}

export async function processDueBatch(ctx, limit) {
  const due = await ctx.store.dueQueue(limit, ctx.now().toISOString());
  const results = [];
  for (const row of due) {
    if (ctx.budget.left() < 6) break; // giữ chỗ cho lượt ghi tình trạng kết nối
    results.push(await processQueueItem(ctx, row));
  }
  return results;
}

/** Cron 5 phút và POST /fb/poll. */
export async function runCron(env, options = {}) {
  const ctx = createRun(env, options);
  const summary = {
    forms: 0,
    found: 0,
    queued: 0,
    processed: 0,
    created: 0,
    merged: 0,
    duplicate: 0,
    error: 0,
    retry: 0,
    blocked: 0,
    stopped: 0,
    health: null,
  };

  try {
    const poll = await pollRecentLeads(ctx);
    summary.forms = poll.forms;
    summary.found = poll.found;
    summary.queued = poll.queued;
    if (poll.error) throw poll.error;
  } catch (error) {
    if (!error || error.code !== 'budget') {
      console.error('fb poll lỗi', JSON.stringify({ error: redactError(error, env) }));
    }
    // Token hỏng phát hiện ngay ở lượt quét, không chờ lượt kiểm token hằng ngày.
    if (error && (error.kind === 'token' || error.kind === 'permission')) ctx.healthError = connectionMessage(error.kind);
  }

  try {
    const results = await processDueBatch(ctx, batchSize(env));
    summary.processed = results.length;
    for (const result of results) {
      const key = result && result.status;
      if (key && Object.hasOwn(summary, key)) summary[key] += 1;
    }
  } catch (error) {
    if (!error || error.code !== 'budget') {
      console.error('fb hàng chờ lỗi', JSON.stringify({ error: redactError(error, env) }));
    }
  }

  try {
    const health = await runHealthCheck(env, ctx, { forcedError: ctx.healthError || null });
    summary.health = health && health.status;
  } catch (error) {
    if (!error || error.code !== 'budget') {
      console.error('fb health lỗi', JSON.stringify({ error: redactError(error, env) }));
    }
  }
  return summary;
}

/** POST /fb/backfill — chỉ đưa lead ĐÃ CÓ TRONG META nhưng CHƯA có trong hàng chờ vào hàng chờ. */
export async function runBackfill(env, body = {}) {
  const ctx = createRun(env);
  const range = vnRangeToEpoch(body.since, body.until, ctx.now());
  if (!range) {
    return { status: 400, body: { error: 'Ngày không hợp lệ — dùng dạng YYYY-MM-DD và since ≤ until.' } };
  }

  // Mỗi form kèm Page của nó để đọc lead bằng đúng token.
  let forms;
  try {
    if (body.form_id) {
      const page = pageFor(env, body.page_id);
      const name = await ctx.graphFor(page && page.id).formName(String(body.form_id));
      forms = [{ id: String(body.form_id), name, pageId: page ? page.id : env.FB_PAGE_ID || null }];
    } else {
      const pages = configuredPages(env).filter((page) => page.token);
      if (!pages.length) return { status: 400, body: { error: 'Thiếu FB_PAGE_ID để lấy danh sách form.' } };
      forms = [];
      for (const page of pages) {
        const data = await ctx.graphFor(page.id).listForms();
        for (const form of Array.isArray(data && data.data) ? data.data : []) {
          forms.push({ id: String(form.id), name: form.name || null, pageId: page.id });
        }
      }
    }
  } catch (error) {
    if (error && error.code === 'budget') {
      return { status: 200, body: { forms: 0, found: 0, queued: 0, already: 0, note: 'Đã chạm giới hạn gọi mạng — thử lại.' } };
    }
    return { status: 502, body: { error: 'Không đọc được form từ Facebook — kiểm tra token và quyền đọc lead.' } };
  }

  let found = 0;
  let queued = 0;
  let already = 0;
  let truncated = false;

  for (const form of forms) {
    if (ctx.budget.left() < 3) {
      truncated = true;
      break;
    }
    let leads;
    try {
      const page = await ctx.graphFor(form.pageId).leadsOfForm(form.id, range.since, range.until, { reserve: 2 });
      leads = page.leads;
      if (page.more) truncated = true;
    } catch (error) {
      if (error && error.code === 'budget') {
        truncated = true;
        break;
      }
      return { status: 502, body: { error: 'Không đọc được lead từ Facebook — kiểm tra token và quyền đọc lead.' } };
    }
    found += leads.length;
    const rows = leads.map((lead) =>
      makeQueueRow({
        leadId: lead.id,
        pageId: form.pageId,
        formId: lead.form_id || form.id,
        formName: form.name || null,
        via: 'backfill',
        env,
        lead,
        nowIso: ctx.now().toISOString(),
      }),
    );
    if (!rows.length) continue;
    if (ctx.budget.left() < 1) {
      truncated = true;
      break;
    }
    const inserted = await ctx.store.enqueue(rows);
    queued += inserted.length;
    already += rows.length - inserted.length;
  }

  const nowSeconds = Math.floor(ctx.now().getTime() / 1000);
  const notes = [];
  if (nowSeconds - range.since > 90 * 86400) {
    notes.push('Meta chỉ giữ lead khoảng 90 ngày — lead trước mốc đó có thể không còn.');
  }
  if (truncated) notes.push('Còn lead chưa đọc hết (giới hạn 45 lượt gọi mạng) — chia khoảng ngày nhỏ hơn rồi chạy lại.');
  const result = { forms: forms.length, found, queued, already };
  if (notes.length) result.note = notes.join(' ');
  return { status: 200, body: result };
}

/** Giữ tên cũ cho `/fb/poll` và tương thích. */
export async function pollLeads(env) {
  return pollRecentLeads(createRun(env));
}
