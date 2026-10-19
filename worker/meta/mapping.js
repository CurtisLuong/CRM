// Chuyển dữ liệu lead Meta → dòng khách / phần tử interaction theo đúng luật nghiệp vụ ML-01.
import { normalizePhoneVN } from './phone.js';

export const LEAD_FORM_KIND = 'lead_form';

const FIELD_LABELS = {
  full_name: 'Họ tên',
  first_name: 'Tên',
  last_name: 'Họ',
  phone_number: 'SĐT',
  phone: 'SĐT',
  email: 'Email',
  city: 'Thành phố',
  job_title: 'Nghề nghiệp',
  date_of_birth: 'Ngày sinh',
};

function text(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function labelFor(name) {
  const raw = text(name);
  if (!raw) return 'Trả lời';
  return FIELD_LABELS[raw] || raw.replace(/_/g, ' ').trim() || raw;
}

/** field_data của Meta → { full_name, phone, email, lines }. Không suy ra apt_type hay hồ sơ khác. */
export function parseFieldData(fieldData) {
  const list = Array.isArray(fieldData) ? fieldData : [];
  const get = (name) => {
    const field = list.find((item) => item && item.name === name);
    const first = field && Array.isArray(field.values) ? field.values[0] : '';
    return text(first);
  };
  const fullName = get('full_name') || [get('last_name'), get('first_name')].filter(Boolean).join(' ').trim();
  const rawPhone = get('phone_number') || get('phone');
  const lines = [];
  for (const field of list) {
    if (!field) continue;
    const value = (Array.isArray(field.values) ? field.values : [])
      .map((item) => text(item))
      .filter(Boolean)
      .join(', ');
    if (!value) continue;
    lines.push(`${labelFor(field.name)}: ${value}`);
  }
  return {
    full_name: fullName,
    // Không có chữ số nào → coi như không có SĐT (tránh normalizePhoneVN('') trả '0').
    phone: /\d/.test(rawPhone) ? normalizePhoneVN(rawPhone) : '',
    email: get('email'),
    lines,
  };
}

/** Chiến dịch = tên chiến dịch Meta → tên form → để trống. */
export function campaignFor(lead, formName) {
  const campaign = text(lead && lead.campaign_name);
  if (campaign) return campaign;
  return text(formName) || null;
}

export function buildNotes({ formName, adName, lines }) {
  const head = `Facebook Lead Ads${formName ? ` — form "${formName}"` : ''}${adName ? ` — QC "${adName}"` : ''}`;
  return [head, ...(Array.isArray(lines) ? lines : [])].join('\n');
}

/** Phần tử interaction cho khách ĐÃ CÓ — bỏ trường trống, khớp hợp đồng `src/domain`. */
export function buildInteraction({ leadId, formId, formName, adName, platform, campaign, at, note }) {
  const interaction = {
    at,
    channel: 'other',
    kind: LEAD_FORM_KIND,
    note,
    by: 'meta',
    origin: 'meta_lead_ads',
  };
  const extra = { campaign, lead_id: leadId, form_id: formId, form_name: formName, ad_name: adName, platform };
  for (const [key, value] of Object.entries(extra)) {
    const clean = text(value);
    if (clean) interaction[key] = clean;
  }
  return interaction;
}

/** Dòng customers cho khách MỚI — chỉ các trường luật 1 cho phép. */
export function buildCustomerRow({ ownerId, parsed, campaign, at, formName, notes }) {
  return {
    owner_id: ownerId,
    full_name: parsed.full_name || 'Khách Facebook',
    phone: parsed.phone,
    source: ['facebook_ads'],
    intake_method: 'api',
    campaign: campaign || null,
    registered_at: at,
    care_stage: 'Đăng kí mới',
    care_stage_updated_at: at,
    care_stage_history: [
      {
        stage: 'Đăng kí mới',
        note: formName ? `Lead Facebook: ${formName}` : 'Lead Facebook',
        at,
      },
    ],
    notes,
  };
}

/** Nhận cả epoch giây và chuỗi ISO của Meta. */
export function createdTimeIso(value, fallbackIso) {
  const fallback = fallbackIso || new Date().toISOString();
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const number = Number(value);
    const ms = number > 1e12 ? number : number * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function toEpochSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value);
  if (/^\d+$/.test(raw)) return Number(raw);
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

/** Lùi lần thử: 1 → +5 phút, 2 → +15 phút, 3 → +1 giờ, 4 → +3 giờ, 5 → +6 giờ, 6 → +12 giờ, ≥7 → +24 giờ. */
const RETRY_STEPS_MS = [5 * 60, 15 * 60, 60 * 60, 3 * 3600, 6 * 3600, 12 * 3600, 24 * 3600];

export function retryDelayMs(attempts) {
  const index = Math.min(Math.max(attempts, 1), RETRY_STEPS_MS.length) - 1;
  return RETRY_STEPS_MS[index] * 1000;
}

function updatedAtMs(customer) {
  const parsed = Date.parse(String((customer && customer.updated_at) || ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function newest(list) {
  return [...list].sort((a, b) => updatedAtMs(b) - updatedAtMs(a))[0] || null;
}

/**
 * Chọn khách đã có theo thứ tự: (a) của người nhận lead và chưa lưu trữ; (b) chưa lưu trữ mới
 * cập nhật nhất; (c) đã lưu trữ mới cập nhật nhất.
 */
export function pickCustomer(candidates, ownerId) {
  const list = (Array.isArray(candidates) ? candidates : []).filter((item) => item && item.id);
  if (!list.length) return null;
  const active = list.filter((item) => !item.archived_at);
  const own = ownerId ? active.filter((item) => item.owner_id === ownerId) : [];
  if (own.length) return newest(own);
  if (active.length) return newest(active);
  const archived = list.filter((item) => item.archived_at);
  return archived.length ? newest(archived) : null;
}
