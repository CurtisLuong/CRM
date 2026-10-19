// Tình trạng kết nối Meta — 1 dòng `integration_health` (id 'meta_lead_ads') cho app đọc (ML-02).
// Kiểm token + webhook tối đa 1 lần/24 giờ (hoặc ngay khi có lỗi token); mỗi lượt cron vẫn
// cập nhật số lead đang chờ / đã dừng tự thử.
export const INTEGRATION_ID = 'meta_lead_ads';

export const REQUIRED_SECRETS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FB_LEAD_OWNER_ID',
  'FB_PAGE_ID',
  'FB_PAGE_ACCESS_TOKEN',
  'FB_APP_ID',
  'FB_APP_SECRET',
  'FB_VERIFY_TOKEN',
  'FB_MANUAL_SECRET',
];

const DAY_MS = 24 * 3600 * 1000;
const VN_OFFSET_MS = 7 * 3600 * 1000;

/** dd/MM/yyyy theo giờ Việt Nam — app không hiển thị ngày ISO. */
export function formatVnDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${shifted.getUTCFullYear()}`;
}

export function countPending(snapshot) {
  const rows = Array.isArray(snapshot) ? snapshot : [];
  const pending = rows.filter((row) => row && row.next_attempt_at);
  const stuck = rows.filter((row) => row && !row.next_attempt_at);
  return { pending, stuck };
}

function missingSecretMessage(missing) {
  return `Thiếu cấu hình Worker: ${missing.join(', ')} — bổ sung secret trong Cloudflare rồi thử lại.`;
}

function expiryWarning(days, atMs) {
  const when = formatVnDate(atMs);
  if (days <= 0) return `Token Facebook đã hết hạn (${when}) — tạo token mới trong Meta rồi cập nhật cho Worker.`;
  return `Token Facebook hết hạn sau ${days} ngày (${when}) — tạo token mới trước ngày đó.`;
}

async function readSnapshot(ctx) {
  try {
    return countPending(await ctx.store.queueSnapshot());
  } catch (error) {
    if (error && error.code === 'budget') throw error;
    return { pending: [], stuck: [] };
  }
}

/**
 * Trả về dòng integration_health vừa ghi (hoặc dòng tính được nếu chưa cấu hình Supabase).
 * `forcedError`: lỗi cấu hình/token vừa gặp khi xử lý lead → giữ nguyên câu báo, không kiểm lại token.
 */
export async function runHealthCheck(env, ctx, { force = false, forcedError = null } = {}) {
  const now = ctx.now();
  const nowMs = now.getTime();
  const ownerId = env.FB_LEAD_OWNER_ID || null;
  const missing = REQUIRED_SECRETS.filter((name) => !env[name]);
  const canStore = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

  let existing = null;
  if (canStore) {
    try {
      existing = await ctx.store.getHealth();
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      existing = null;
    }
  }

  const details = { ...((existing && existing.details) || {}) };
  let status = 'ok';
  let message = 'Kết nối Facebook hoạt động bình thường.';
  let token = details.token || null;
  let webhookSubscribed = details.webhook_subscribed;
  let tokenExpiresAt = null;
  let snapshot = { pending: [], stuck: [] };

  if (canStore) snapshot = await readSnapshot(ctx);

  if (missing.length) {
    status = 'error';
    message = missingSecretMessage(missing);
    details.missing_secrets = missing;
  } else {
    delete details.missing_secrets;
    const lastCheck = details.token_checked_at ? Date.parse(details.token_checked_at) : 0;
    const stale = !lastCheck || nowMs - lastCheck >= DAY_MS;

    if (!forcedError && (force || stale)) {
      details.token_checked_at = now.toISOString();
      try {
        const data = await ctx.graph.debugToken();
        token = (data && data.data) || data || null;
        details.token = token;
        delete details.token_error;
      } catch (error) {
        if (error && error.code === 'budget') throw error;
        details.token_error = (error && error.kind) || 'transient';
        if (details.token_error === 'token' || details.token_error === 'permission') {
          token = { is_valid: false, scopes: (token && token.scopes) || [] };
          details.token = token;
        }
      }
      try {
        const apps = await ctx.graph.subscribedApps();
        const list = Array.isArray(apps && apps.data) ? apps.data : [];
        webhookSubscribed = list.some(
          (app) => Array.isArray(app && app.subscribed_fields) && app.subscribed_fields.includes('leadgen'),
        );
        details.webhook_subscribed = webhookSubscribed;
        delete details.webhook_error;
      } catch (error) {
        if (error && error.code === 'budget') throw error;
        details.webhook_error = (error && error.kind) || 'transient';
      }
    }

    const oldest = snapshot.pending.reduce((min, row) => {
      const time = Date.parse(String((row && row.created_at) || ''));
      return Number.isNaN(time) ? min : Math.min(min, time);
    }, Number.POSITIVE_INFINITY);
    const waitingOverHour = Number.isFinite(oldest) && nowMs - oldest > 3600 * 1000;

    const valid = token ? token.is_valid !== false : true;
    const scopes = token && Array.isArray(token.scopes) ? token.scopes : null;
    const missingScope = valid && scopes !== null && !scopes.includes('leads_retrieval');
    const expiries = [token && token.expires_at, token && token.data_access_expires_at]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    const expiresMs = expiries.length ? Math.min(...expiries) * 1000 : null;
    const daysLeft = expiresMs === null ? null : Math.ceil((expiresMs - nowMs) / DAY_MS);
    const expiringSoon = expiresMs !== null && expiresMs - nowMs <= 7 * DAY_MS;
    tokenExpiresAt = expiresMs === null ? null : new Date(expiresMs).toISOString();

    if (forcedError) {
      status = 'error';
      message = forcedError;
      // Lượt sau phải kiểm lại token thật (debug_token) thay vì dùng kết quả "hợp lệ" cũ → không nhấp nháy ok/lỗi.
      delete details.token_checked_at;
    } else if (!valid) {
      status = 'error';
      message = 'Token Facebook không còn hiệu lực — tạo token mới trong Meta rồi cập nhật cho Worker.';
    } else if (missingScope) {
      status = 'error';
      message =
        'Token Facebook thiếu quyền đọc lead (leads_retrieval) — cấp lại quyền trong Meta rồi cập nhật token.';
    } else if (snapshot.stuck.length > 0) {
      status = 'error';
      message = `Có ${snapshot.stuck.length} lead không tự ghi được vào CRM — cần xử lý tay (xem hướng dẫn Meta Lead Ads, mục "Khi có cảnh báo").`;
    } else if (expiringSoon) {
      status = 'warning';
      message = expiryWarning(daysLeft, expiresMs);
    } else if (webhookSubscribed === false) {
      status = 'warning';
      message = 'Page chưa đăng ký nhận lead qua webhook — bật leadgen trong cài đặt Meta để lead về ngay.';
    } else if (waitingOverHour) {
      status = 'warning';
      message = 'Có lead đang chờ quá 1 giờ — kiểm tra kết nối Facebook.';
    }
  }

  if (status === 'error') ctx.healthError = message;

  const row = {
    id: INTEGRATION_ID,
    owner_id: ownerId,
    status,
    message,
    token_expires_at: tokenExpiresAt,
    last_lead_at: ctx.lastLeadAt || (existing && existing.last_lead_at) || null,
    last_webhook_at: (existing && existing.last_webhook_at) || null,
    pending_count: snapshot.pending.length,
    stuck_count: snapshot.stuck.length,
    details,
    checked_at: now.toISOString(),
  };
  if (!canStore) return row;
  return ctx.store.upsertHealth(row);
}
