// Xử lý 1 dòng `fb_lead_queue`: lấy lead → chống trùng → tạo khách mới hoặc gắn vào khách cũ.
// Lỗi được chia 2 nhóm: lỗi tạm thời (đốt lượt thử, lùi dần) và lỗi cấu hình/token (KHÔNG đốt lượt).
import { INTEGRATION_ID } from './health.js';
import {
  buildCustomerRow,
  buildInteraction,
  buildNotes,
  campaignFor,
  createdTimeIso,
  parseFieldData,
  pickCustomer,
  retryDelayMs,
} from './mapping.js';

export const MAX_ATTEMPTS = 15;

const SECRET_KEYS = [
  'FB_PAGE_ACCESS_TOKEN',
  'FB_APP_SECRET',
  'FB_MANUAL_SECRET',
  'FB_VERIFY_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
];

function text(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

/** Không để SĐT/token/secret rơi vào log hay cột lỗi. */
export function redactError(error, env = {}) {
  let message = (error && error.message) || String(error) || 'Lỗi không rõ';
  message = message.replace(/\d{8,}/g, '[số]');
  for (const key of SECRET_KEYS) {
    const secret = env[key];
    if (typeof secret === 'string' && secret.length >= 4) message = message.split(secret).join('[ẩn]');
  }
  return message.slice(0, 500);
}

function healthMessage(kind, message) {
  if (kind === 'token') {
    return 'Token Facebook không còn hiệu lực — tạo token mới trong Meta rồi cập nhật cho Worker.';
  }
  if (kind === 'permission') {
    return 'Token Facebook thiếu quyền đọc lead (leads_retrieval) — cấp lại quyền trong Meta rồi cập nhật token.';
  }
  return `Chưa cấu hình đủ để nhận lead Facebook: ${message}`;
}

async function loadLead(ctx, row) {
  const payload = row.payload || {};
  if (payload.lead && typeof payload.lead === 'object') return payload.lead;
  return ctx.graph.fetchLead(row.lead_id);
}

async function attachToCustomer(ctx, { target, interaction, baseLog, leadId, nowIso }) {
  const result = await ctx.store.attachLead(target.id, interaction);
  if (result === 'not_found') return null;
  const archived = Boolean(target.archived_at);
  await ctx.store.upsertLeadLog({
    ...baseLog,
    customer_id: target.id,
    status: 'merged',
    error: archived ? 'Khách đã lưu trữ — chưa mở lại' : null,
  });
  await ctx.store.finishQueue(leadId, nowIso);
  ctx.lastLeadAt = nowIso;
  return { status: 'merged', lead_id: leadId, customer_id: target.id };
}

async function createCustomer(ctx, options) {
  const { parsed, campaign, at, formName, notes, interaction, baseLog, leadId, nowIso } = options;
  try {
    const created = await ctx.store.createCustomer(
      buildCustomerRow({
        ownerId: ctx.env.FB_LEAD_OWNER_ID,
        parsed,
        campaign,
        at,
        formName,
        notes,
      }),
    );
    const customerId = (created && created.id) || null;
    await ctx.store.upsertLeadLog({ ...baseLog, customer_id: customerId, status: 'created', error: null });
    await ctx.store.finishQueue(leadId, nowIso);
    ctx.lastLeadAt = nowIso;
    return { status: 'created', lead_id: leadId, customer_id: customerId };
  } catch (error) {
    // Hai đường chạy cùng lúc: khách vừa được tạo ở đường kia → tra lại và gắn, không báo lỗi.
    if (error && error.code === '23505') {
      const found = pickCustomer(await ctx.store.customersByPhone(parsed.phone), ctx.env.FB_LEAD_OWNER_ID);
      if (found) {
        const attached = await attachToCustomer(ctx, { target: found, interaction, baseLog, leadId, nowIso });
        if (attached) return attached;
      }
    }
    throw error;
  }
}

async function handleFailure(ctx, row, error, baseLog, nowIso) {
  if (error && error.code === 'budget') return { status: 'deferred', lead_id: row.lead_id };
  const kind = (error && error.kind) || 'transient';
  const message = redactError(error, ctx.env);
  // Chỉ mã lead — không SĐT, tên, token hay secret.
  console.error('fb lead lỗi', JSON.stringify({ lead_id: String(row.lead_id), kind }));

  const previousAttempts = Number(row.attempts) || 0;
  const nowMs = new Date(nowIso).getTime();
  try {
    if (kind === 'config' || kind === 'token' || kind === 'permission') {
      const notice = healthMessage(kind, message);
      await ctx.store.updateQueue(row.lead_id, {
        attempts: previousAttempts, // lỗi cấu hình/token không đốt lượt thử
        next_attempt_at: new Date(nowMs + 3600 * 1000).toISOString(),
        last_error: message,
        updated_at: nowIso,
      });
      ctx.healthError = notice;
      try {
        await ctx.store.patchHealth({ status: 'error', message: notice, checked_at: nowIso });
      } catch {
        /* còn cron sẽ ghi lại */
      }
      return { status: 'blocked', lead_id: row.lead_id };
    }

    const attempts = previousAttempts + 1;
    const stopped = attempts >= MAX_ATTEMPTS;
    await ctx.store.updateQueue(row.lead_id, {
      attempts,
      next_attempt_at: stopped ? null : new Date(nowMs + retryDelayMs(attempts)).toISOString(),
      last_error: message,
      updated_at: nowIso,
    });
    if (stopped) {
      await ctx.store.upsertLeadLog({
        ...baseLog,
        status: 'error',
        error: message,
        raw: baseLog.raw || (row.payload && row.payload.lead) || row.payload || null,
        updated_at: nowIso,
      });
    }
    return { status: stopped ? 'stopped' : 'retry', attempts, lead_id: row.lead_id };
  } catch (nested) {
    if (nested && nested.code === 'budget') return { status: 'deferred', lead_id: row.lead_id };
    console.error('fb lead lỗi', JSON.stringify({ lead_id: String(row.lead_id), kind: 'ghi-hang-cho' }));
    return { status: 'retry', lead_id: row.lead_id };
  }
}

export async function processQueueItem(ctx, row) {
  const leadId = String(row.lead_id);
  const now = ctx.now();
  const nowIso = now.toISOString();
  const baseLog = {
    lead_id: leadId,
    page_id: row.page_id || null,
    form_id: row.form_id || null,
    owner_id: ctx.env.FB_LEAD_OWNER_ID || null,
    via: row.via,
    updated_at: nowIso,
  };

  try {
    const previous = await ctx.store.leadLog(leadId);
    if (previous && (previous.status === 'created' || previous.status === 'merged')) {
      await ctx.store.finishQueue(leadId, nowIso);
      return { status: 'duplicate', lead_id: leadId };
    }

    // Lỗi cấu hình: KHÔNG gọi Graph, KHÔNG đốt lượt thử.
    if (!ctx.env.FB_PAGE_ACCESS_TOKEN && !(row.payload && row.payload.lead)) {
      const error = new Error('Thiếu FB_PAGE_ACCESS_TOKEN (token đọc lead)');
      error.kind = 'config';
      throw error;
    }
    if (!ctx.env.FB_LEAD_OWNER_ID) {
      const error = new Error('Thiếu FB_LEAD_OWNER_ID (người nhận lead)');
      error.kind = 'config';
      throw error;
    }

    const lead = await loadLead(ctx, row);
    const formName = text(row.payload && row.payload.form_name) || (await ctx.graph.formName(lead.form_id || row.form_id));
    const parsed = parseFieldData(lead.field_data);
    const at = createdTimeIso(lead.created_time != null ? lead.created_time : row.payload && row.payload.created_time, nowIso);
    const campaign = campaignFor(lead, formName);
    const notes = buildNotes({ formName, adName: lead.ad_name, lines: parsed.lines });

    Object.assign(baseLog, {
      page_id: lead.page_id || baseLog.page_id || ctx.env.FB_PAGE_ID || null,
      form_id: lead.form_id || baseLog.form_id || null,
      form_name: formName || null,
      ad_id: lead.ad_id || null,
      campaign_name: lead.campaign_name || null,
      created_time: at,
      phone: parsed.phone || null,
      campaign_id: lead.campaign_id || null,
      adset_id: lead.adset_id || (row.payload && row.payload.adgroup_id) || null,
      adset_name: lead.adset_name || null,
      ad_name: lead.ad_name || null,
      platform: lead.platform || null,
      is_organic: typeof lead.is_organic === 'boolean' ? lead.is_organic : null,
      raw: lead,
    });

    if (!parsed.phone) {
      await ctx.store.upsertLeadLog({ ...baseLog, customer_id: null, status: 'error', error: 'Lead không có số điện thoại' });
      await ctx.store.finishQueue(leadId, nowIso);
      return { status: 'error', lead_id: leadId, error: 'Lead không có số điện thoại' };
    }

    const interaction = buildInteraction({
      leadId,
      formId: baseLog.form_id,
      formName,
      adName: lead.ad_name,
      platform: lead.platform,
      campaign,
      at,
      note: notes,
    });

    const target = pickCustomer(await ctx.store.customersByPhone(parsed.phone), ctx.env.FB_LEAD_OWNER_ID);
    if (target) {
      const attached = await attachToCustomer(ctx, { target, interaction, baseLog, leadId, nowIso });
      if (attached) return attached;
    }

    return await createCustomer(ctx, {
      parsed,
      campaign,
      at,
      formName,
      notes,
      interaction,
      baseLog,
      leadId,
      nowIso,
    });
  } catch (error) {
    return handleFailure(ctx, row, error, baseLog, nowIso);
  }
}

/** Ghi tình trạng lỗi kết nối ngay (dùng cho webhook/manual — cron tự ghi ở cuối lượt). */
export async function flushHealth(ctx) {
  if (!ctx.healthError) return;
  try {
    await ctx.store.patchHealth({
      id: INTEGRATION_ID,
      status: 'error',
      message: ctx.healthError,
      checked_at: ctx.now().toISOString(),
    });
  } catch (error) {
    if (error && error.code === 'budget') return;
  }
}

/** Sau khi xử lý ngoài cron: lưu mốc lead gần nhất / lỗi kết nối vừa gặp. */
export async function finalizeRun(ctx) {
  if (ctx.healthError) {
    await flushHealth(ctx);
    return;
  }
  if (!ctx.lastLeadAt) return;
  try {
    await ctx.store.patchHealth({ last_lead_at: ctx.lastLeadAt });
  } catch (error) {
    if (error && error.code === 'budget') return;
  }
}
