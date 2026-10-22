// Chuyển dữ liệu lead Meta → dòng khách / phần tử interaction theo đúng luật nghiệp vụ ML-01 + ML-03.
import { LEAD_FORM_ORIGIN } from '../../src/domain/customer/interactions';
import { fieldNameKey, formAnswers, looksLikePhone, nameHint, phoneHint } from './leadFields.js';
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

// Tên trường do người tạo form đặt có thể là tiếng Việt ("số_điện_thoại", "tên_đầy_đủ") thay vì mã chuẩn của Meta
// ("phone_number", "full_name") → so khớp trên tên đã bỏ dấu, gạch dưới → khoảng trắng (dùng chung với leadFields).
const PHONE_KEYS = ['phone number', 'phone', 'so dien thoai', 'dien thoai', 'sdt', 'so dt', 'mobile', 'zalo'];
const FULL_NAME_KEYS = ['full name', 'ten day du', 'ho va ten', 'ho ten', 'ten', 'name', 'ten cua ban', 'ten anh chi'];

/** field_data của Meta → { full_name, phone, email, lines, apt_type, bullets }. */
export function parseFieldData(fieldData) {
  const list = Array.isArray(fieldData) ? fieldData : [];
  const valueOf = (field) => text(field && Array.isArray(field.values) ? field.values[0] : '');
  const byKeys = (keys) => {
    for (const key of keys) {
      const field = list.find((item) => item && fieldNameKey(item.name) === key);
      if (field && valueOf(field)) return valueOf(field);
    }
    return '';
  };
  const byTest = (test) => {
    const field = list.find((item) => item && valueOf(item) && test(fieldNameKey(item.name), valueOf(item)));
    return field ? valueOf(field) : '';
  };
  const get = (name) => valueOf(list.find((item) => item && item.name === name));
  const fullName =
    byKeys(FULL_NAME_KEYS) ||
    [get('last_name'), get('first_name')].filter(Boolean).join(' ').trim() ||
    byTest((key) => nameHint(key));
  // Tên chuẩn → tên chứa cụm "điện thoại/SĐT/phone/zalo" có câu trả lời dạng số → câu trả lời bất kỳ dạng số.
  // Trước đây chỉ so khớp đúng tên: form đặt "Số điện thoại liên hệ" bị coi là không SĐT và lead bị bỏ im lặng.
  const rawPhone =
    byKeys(PHONE_KEYS) ||
    byTest((key, value) => phoneHint(key) && looksLikePhone(value)) ||
    byTest((key, value) => key !== 'email' && looksLikePhone(value));
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
  const { aptType, bullets } = formAnswers(list);
  return {
    full_name: fullName,
    // Không có chữ số nào → coi như không có SĐT (tránh normalizePhoneVN('') trả '0').
    phone: /\d/.test(rawPhone) ? normalizePhoneVN(rawPhone) : '',
    email: get('email'),
    // Giữ cho tương thích nơi khác; khách mới dùng `bullets` (ML-03), không dùng `lines`.
    lines,
    apt_type: aptType,
    bullets,
  };
}

/** Chiến dịch = tên chiến dịch Meta → tên form → để trống. */
export function campaignFor(lead, formName) {
  const campaign = text(lead && lead.campaign_name);
  if (campaign) return campaign;
  return text(formName) || null;
}

/** Mỗi gạch đầu dòng = 1 phần tử notes_manual; origin đánh dấu để app không tính là sale chạm khách. */
export function buildNotesManual({ bullets, at, leadId }) {
  return (Array.isArray(bullets) ? bullets : []).map((line) => ({
    text: line,
    at,
    origin: LEAD_FORM_ORIGIN,
    lead_id: leadId,
  }));
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

/** Dòng customers cho khách MỚI — chỉ các trường luật 1 + ML-03 cho phép; KHÔNG ghi `notes`. */
export function buildCustomerRow({ ownerId, parsed, campaign, at, formName, projects, leadId }) {
  const row = {
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
  };
  // Chỉ ghi khi có giá trị: đọc lỗi/không nhận ra thì để trống, không đoán.
  if (parsed.apt_type) row.apt_type = parsed.apt_type;
  const notesManual = buildNotesManual({ bullets: parsed.bullets, at, leadId });
  if (notesManual.length) row.notes_manual = notesManual;
  if (Array.isArray(projects) && projects.length) row.projects = projects;
  return row;
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
