// Truy cập Supabase bằng service role (chỉ chạy ở Worker). Không bao giờ PATCH bảng customers:
// khách đã có chỉ được gắn lead qua RPC `fb_attach_lead` (một câu UPDATE nguyên tử).
import { countedFetch } from './budget.js';

const INTEGRATION_ID = 'meta_lead_ads';

export class SupabaseError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SupabaseError';
    this.code = options.code;
    this.status = options.status || 0;
    // Mạng / Supabase lỗi đều là tạm thời → hàng chờ tự thử lại.
    this.kind = 'transient';
  }
}

function encoded(value) {
  return encodeURIComponent(String(value));
}

function firstRow(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export function createStore(env, { budget, now = () => new Date() } = {}) {
  async function request(path, init = {}) {
    const headers = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    };
    let response;
    try {
      response = await countedFetch(budget, `${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      throw new SupabaseError('Không kết nối được Supabase');
    }
    const body = await response.text();
    let data = null;
    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
        data = body;
      }
    }
    if (!response.ok) {
      const message = (data && (data.message || data.hint || data.details)) || `Supabase ${response.status}`;
      throw new SupabaseError(String(message), { code: data && data.code, status: response.status });
    }
    return data;
  }

  async function enqueue(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const data = await request('fb_lead_queue?on_conflict=lead_id&select=lead_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(rows),
    });
    return Array.isArray(data) ? data : [];
  }

  async function dueQueue(limit, nowIso) {
    const data = await request(
      `fb_lead_queue?done_at=is.null&next_attempt_at=not.is.null&next_attempt_at=lte.${encoded(nowIso)}` +
        '&select=lead_id,page_id,form_id,owner_id,via,payload,attempts,next_attempt_at,created_at' +
        `&order=next_attempt_at.asc&limit=${Number(limit) || 5}`,
    );
    return Array.isArray(data) ? data : [];
  }

  async function leadLog(leadId) {
    const data = await request(`fb_leads?lead_id=eq.${encoded(leadId)}&select=lead_id,status&limit=1`);
    return firstRow(data);
  }

  async function upsertLeadLog(row) {
    return request('fb_leads?on_conflict=lead_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  }

  async function customersByPhone(phone) {
    const data = await request(
      `customers?phone=eq.${encoded(phone)}&select=id,owner_id,archived_at,updated_at&limit=50`,
    );
    return Array.isArray(data) ? data : [];
  }

  async function createCustomer(row) {
    const data = await request('customers?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    return firstRow(data);
  }

  async function attachLead(customerId, interaction) {
    const data = await request('rpc/fb_attach_lead', {
      method: 'POST',
      body: JSON.stringify({ p_customer_id: customerId, p_interaction: interaction }),
    });
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object') return String(data.fb_attach_lead || data.result || '');
    return String(data || '');
  }

  async function updateQueue(leadId, patch) {
    return request(`fb_lead_queue?lead_id=eq.${encoded(leadId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
  }

  async function finishQueue(leadId, atIso) {
    return updateQueue(leadId, { done_at: atIso, updated_at: atIso });
  }

  /** Một lượt đọc đủ để đếm lead đang chờ / đã dừng tự thử (không phân trang vì số này nhỏ). */
  async function queueSnapshot() {
    const data = await request(
      'fb_lead_queue?done_at=is.null&select=lead_id,next_attempt_at,created_at&order=created_at.asc&limit=500',
    );
    return Array.isArray(data) ? data : [];
  }

  async function getHealth() {
    const data = await request(`integration_health?id=eq.${INTEGRATION_ID}&select=*&limit=1`);
    return firstRow(data);
  }

  async function upsertHealth(row) {
    const data = await request('integration_health?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    return firstRow(data);
  }

  /** Cập nhật một phần dòng sức khoẻ; chưa có dòng thì tạo mới để app luôn đọc được. */
  async function patchHealth(patch) {
    const data = await request(`integration_health?id=eq.${INTEGRATION_ID}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    const updated = firstRow(data);
    if (updated) return updated;
    return upsertHealth({
      id: INTEGRATION_ID,
      owner_id: env.FB_LEAD_OWNER_ID || null,
      status: 'ok',
      message: null,
      pending_count: 0,
      stuck_count: 0,
      details: {},
      checked_at: now().toISOString(),
      ...patch,
    });
  }

  return {
    request,
    enqueue,
    dueQueue,
    leadLog,
    upsertLeadLog,
    customersByPhone,
    createCustomer,
    attachLead,
    updateQueue,
    finishQueue,
    queueSnapshot,
    getHealth,
    upsertHealth,
    patchHealth,
  };
}
