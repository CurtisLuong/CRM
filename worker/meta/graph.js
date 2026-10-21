// Gọi Graph API của Meta. Mọi lỗi được phân loại để bên xử lý biết có nên đốt lượt thử hay không:
//   transient  — mạng, 5xx, phản hồi hỏng → thử lại theo lịch lùi dần
//   token      — error.code 190 (token hỏng/hết hạn) → không đốt lượt, báo lỗi kết nối
//   permission — error.code 10 hoặc 200–299 (thiếu quyền) → không đốt lượt, báo lỗi kết nối
//   permanent  — lỗi cố định khác (vd lead không tồn tại)
import { countedFetch } from './budget.js';
import { toEpochSeconds } from './mapping.js';

export const GRAPH_DEFAULT = 'v26.0';

export const LEAD_FIELDS_FULL =
  'id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic';
export const LEAD_FIELDS_MIN = 'id,created_time,field_data,form_id,ad_id,platform,is_organic';

export class GraphError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'GraphError';
    this.code = options.graphCode;
    this.status = options.status || 0;
    this.kind = options.kind || 'transient';
  }
}

function classify(error, status) {
  if (!status || status >= 500) return 'transient';
  if (error && error.code === 190) return 'token';
  if (error && (error.code === 10 || (error.code >= 200 && error.code <= 299))) return 'permission';
  return 'permanent';
}

export function createGraph(env, { budget, now = () => new Date() } = {}) {
  const formCache = new Map();

  async function request(path, params = {}) {
    const version = env.FB_GRAPH_VERSION || GRAPH_DEFAULT;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    if (!query.has('access_token')) query.set('access_token', env.FB_PAGE_ACCESS_TOKEN || '');
    const url = `https://graph.facebook.com/${version}/${path}?${query}`;
    let response;
    try {
      response = await countedFetch(budget, url);
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      throw new GraphError('Không gọi được Facebook', { kind: 'transient' });
    }
    let data = {};
    try {
      const body = await response.text();
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }
    if (!response.ok || data.error) {
      const graphError = data.error || {};
      throw new GraphError(graphError.message || `Graph ${response.status}`, {
        graphCode: graphError.code,
        status: response.status,
        kind: classify(graphError, response.status),
      });
    }
    return data;
  }

  async function fetchLead(id) {
    try {
      return await request(String(id), { fields: LEAD_FIELDS_FULL });
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      // Thiếu quyền đọc tên quảng cáo (ads_read) → lấy bản tối thiểu, vẫn ghi được lead.
      return request(String(id), { fields: LEAD_FIELDS_MIN });
    }
  }

  async function formName(formId) {
    if (!formId) return null;
    if (formCache.has(formId)) return formCache.get(formId);
    try {
      const data = await request(String(formId), { fields: 'name' });
      const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null;
      formCache.set(formId, name);
      return name;
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      formCache.set(formId, null);
      return null;
    }
  }

  async function listForms() {
    return request(`${env.FB_PAGE_ID}/leadgen_forms`, { fields: 'id,name,status', limit: 100 });
  }

  /**
   * Lead của 1 form trong khoảng [since, until] (giây). Meta lọc GREATER_THAN nên lấy since-1.
   * Đi hết các trang (`paging.next`, 100 lead/trang) trong khi còn ngân sách, chừa `reserve` lượt gọi
   * cho việc ghi hàng chờ. `more = true` = còn trang chưa đọc (gọi lại để lấy tiếp) — không được im lặng bỏ sót.
   */
  async function leadsOfForm(formId, since, until, { reserve = 1 } = {}) {
    const filtering = JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: Math.max(0, since - 1) }]);
    let data;
    try {
      data = await request(`${formId}/leads`, { fields: LEAD_FIELDS_FULL, limit: 100, filtering });
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      data = await request(`${formId}/leads`, { fields: LEAD_FIELDS_MIN, limit: 100, filtering });
    }
    const rows = Array.isArray(data.data) ? [...data.data] : [];
    let next = data.paging && data.paging.next;
    while (next && budget && budget.left() > reserve) {
      const page = await nextPage(next);
      if (Array.isArray(page.data)) rows.push(...page.data);
      next = page.paging && page.paging.next;
    }
    const leads = rows.filter((lead) => {
      const seconds = toEpochSeconds(lead && lead.created_time);
      if (seconds === null) return true;
      if (seconds < since) return false;
      return until === null || until === undefined || seconds <= until;
    });
    return { leads, more: Boolean(next) };
  }

  // Link trang sau do Meta trả về (đã kèm token + bộ lọc) — vẫn tính vào ngân sách và phân loại lỗi.
  async function nextPage(url) {
    let response;
    try {
      response = await countedFetch(budget, url);
    } catch (error) {
      if (error && error.code === 'budget') throw error;
      throw new GraphError('Không gọi được Facebook', { kind: 'transient' });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const graphError = data.error || {};
      throw new GraphError(graphError.message || `Graph ${response.status}`, {
        graphCode: graphError.code,
        status: response.status,
        kind: classify(graphError, response.status),
      });
    }
    return data;
  }

  async function debugToken() {
    const appToken = `${env.FB_APP_ID}|${env.FB_APP_SECRET}`;
    return request('debug_token', { input_token: env.FB_PAGE_ACCESS_TOKEN, access_token: appToken });
  }

  async function subscribedApps() {
    return request(`${env.FB_PAGE_ID}/subscribed_apps`);
  }

  return { request, fetchLead, formName, listForms, leadsOfForm, debugToken, subscribedApps, now };
}
