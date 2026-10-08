/* app.js — UI + điều phối chính của CRM */

// 7 bậc tiến độ chăm sóc "đi tới" (bậc 1 → bậc 7), theo đúng thứ tự phễu bán hàng.
// Bậc 1 ('Đăng kí mới') = mặc định khi vừa tạo khách. Bậc 7 ('Kí HĐMB') = chăm sóc
// XONG, chốt thành công. (Trước 2026-08-26 danh sách này mô tả LẪN cả kênh liên
// lạc — nay kênh liên lạc tách sang CONTACT_STATUS bên dưới, xem CHANGELOG.)
const CARE_STAGES = [
  'Đăng kí mới',
  'Đang tiếp cận',
  'Đang chăm sóc',
  'Xem dự án',
  'Hỗ trợ hồ sơ',
  'Booking',
  'Kí HĐMB',
];

// Bậc mặc định cho khách MỚI — form tạo khách tự chọn sẵn bậc này.
const CARE_STAGE_DEFAULT = 'Đăng kí mới';

// 'Loại' KHÔNG phải bậc thứ 8 của phễu — nó là 1 trạng thái KẾT THÚC quá trình
// chăm sóc mà không chốt được (khách bị loại). Về mặt "đã xong hay chưa" nó tương
// đương bậc 7 (đều là xong), nhưng hiển thị dấu ✕ ĐỎ để phân biệt "loại" với "đã
// ký hợp đồng".
const CARE_STAGE_DROPPED = 'Loại';

// Danh sách đổ vào các <select>: 7 bậc + trạng thái kết thúc ở cuối cùng.
const CARE_STAGE_OPTIONS = [...CARE_STAGES, CARE_STAGE_DROPPED];

// Hai trạng thái coi là "chăm sóc đã xong" — mặc định ẩn khỏi dashboard.
const CARE_DONE_STAGES = ['Kí HĐMB', CARE_STAGE_DROPPED];

// Mức quan tâm MẶC ĐỊNH của khách mới (form, nhập Excel; landing page dùng default cột DB
// — xem SQL/interest_default_20.sql). Chỉnh 1 chỗ này + default cột nếu muốn đổi.
const INTEREST_DEFAULT_NEW = 20;

// Đổi bậc chăm sóc → TỰ set mức quan tâm (chỉ các bậc dưới; bậc khác giữ nguyên).
// Kéo slider bằng tay sẽ ghi đè giá trị tự động này. 'Loại' → 0%.
const STAGE_INTEREST = {
  'Đang chăm sóc': 60,
  'Xem dự án': 75,
  'Hỗ trợ hồ sơ': 85,
  'Booking': 95,
  'Kí HĐMB': 100,
  [CARE_STAGE_DROPPED]: 0,
};

// Các bậc có thể LẶP LẠI nhiều lần mà vẫn ở nguyên bậc đó — mỗi lần liên hệ là 1
// mốc riêng trong lịch sử để tiện theo dõi (vd gọi tiếp cận nhiều lần chưa được).
// Chỉ những bậc đầu phễu (chưa vào giao dịch) mới cho "ghi thêm lần".
const CARE_STAGES_REPEATABLE = ['Đăng kí mới', 'Đang tiếp cận'];
function isRepeatableStage(stage) {
  return CARE_STAGES_REPEATABLE.includes(stage);
}

// ---- CONTACT STATUS (trạng thái liên lạc) — ĐỘC LẬP với care_stage ----
// Mô tả KÊNH/kết quả liên lạc gần nhất (không phải độ sâu phễu). Lưu ở cột riêng
// customers.contact_status (xem change_care_stages_and_contact_status.sql). Người
// dùng tự chọn; 'Mất liên lạc' còn được app GỢI Ý (badge cảnh báo) khi >7 ngày
// không tương tác — chỉ hiển thị, KHÔNG tự ghi đè dữ liệu.
const CONTACT_STATUSES = [
  'Chưa gọi được',
  'Hẹn gọi lại',
  'Chờ kết bạn Zalo',
  'Phản hồi tốt',
  'Mất liên lạc',
];
const CONTACT_STATUS_COLORS = {
  'Chưa gọi được':    '#b0463a', // đỏ đất — gọi không bắt máy
  'Hẹn gọi lại':      '#c96a4f', // cam đất — có nghe, đang bận
  'Chờ kết bạn Zalo': '#d29b2c', // vàng cam — đã gửi lời mời, chờ accept
  'Phản hồi tốt':     '#3f8f6b', // xanh ngọc — tích cực
  'Mất liên lạc':     '#9a9a90', // xám — không phản hồi >7 ngày
};
function contactColor(s) {
  return CONTACT_STATUS_COLORS[s] || '#8b93a0';
}

// GỢI Ý "nghi mất liên lạc": contact_status đang tích cực (khác 'Mất liên lạc' và
// khác rỗng), khách chưa kết thúc chăm sóc, nhưng đã >7 ngày không có tương tác
// (mốc care_stage_updated_at). Chỉ để HIỂN THỊ badge nhắc — không đổi dữ liệu.
function contactLostWarning(c) {
  if (!c || isCareDone(c.care_stage)) return false;
  const cs = c.contact_status;
  if (!cs || cs === 'Mất liên lạc') return false;
  return daysSince(c.care_stage_updated_at || c.updated_at) > 7;
}

// ---- Hồ sơ "NÂNG CAO" (cột JSONB customers.advanced) ----
// 1 nguồn duy nhất cho cả: dựng form, lưu, và hiển thị chi tiết. Thêm/bớt field chỉ sửa ở đây.
// type: 'textarea' | 'text' | 'number' (number = VNĐ, hiển thị qua formatPrice).
const ADVANCED_GROUPS = [
  { title: 'Bối cảnh sống', fields: [
    { key: 'life_stage',           label: 'Giai đoạn cuộc sống',        type: 'textarea', ph: 'Độc thân, mới cưới, gia đình có con nhỏ, chăm cha mẹ, chuẩn bị về hưu...' },
    { key: 'household',            label: 'Hộ gia đình',                type: 'textarea', ph: 'Số người ở cùng, số con/người phụ thuộc...' },
    { key: 'housing_status',       label: 'Tình trạng nhà ở',           type: 'textarea', ph: 'Chưa có nhà, nhà thuê, nhà chật, thiếu chỗ đậu xe...' },
    { key: 'pain_points',          label: 'Nỗi đau hiện tại',           type: 'textarea', ph: 'Tiền thuê tăng, nhà chật, đi làm xa, tiền rảnh muốn đầu tư...' },
    { key: 'mobility',            label: 'Thói quen di chuyển',        type: 'textarea', ph: 'Ô tô, thời gian đi lại chấp nhận được...' },
    { key: 'decision_influencers', label: 'Người ảnh hưởng quyết định', type: 'textarea', ph: 'Vợ/chồng, cha mẹ, anh chị em, người đồng sở hữu...' },
    { key: 'timeline_events',      label: 'Mốc thời gian',              type: 'textarea', ph: 'Sinh nhật, hết hợp đồng thuê, chuyển việc, con vào năm học mới...' },
  ] },
  { title: 'Sở thích bất động sản', fields: [
    { key: 'pref_area',    label: 'Khu vực quan tâm', type: 'text', ph: 'Trung tâm, Thuỷ Nguyên, gần khu công nghiệp...' },
    { key: 'pref_product', label: 'Loại sản phẩm',    type: 'text', ph: 'Shophouse, liền kề, căn hộ cao tầng...' },
    { key: 'must_have',    label: 'Tiêu chí bắt buộc', type: 'text', ph: 'Gần nơi làm, trường học, bệnh viện, pháp lý rõ, có thang máy...' },
    { key: 'deal_breakers', label: 'Điều không chấp nhận', type: 'text', ph: 'Xa hơn X phút, giá vượt ngưỡng, tầng quá cao/thấp, gần KCN...' },
  ] },
  { title: 'Năng lực tài chính', fields: [
    { key: 'asset_value',     label: 'Giá trị tài sản',                 type: 'number', ph: 'VNĐ' },
    { key: 'capital',        label: 'Vốn',                             type: 'number', ph: 'VNĐ' },
    { key: 'loan_need',      label: 'Nhu cầu vay',                     type: 'number', ph: 'VNĐ' },
    { key: 'monthly_payment', label: 'Khoản trả hàng tháng chấp nhận', type: 'number', ph: 'VNĐ' },
    { key: 'financial_barriers', label: 'Rào cản tài chính',           type: 'text',   ph: 'Nợ xấu, thiếu thanh khoản, thiếu vốn đối ứng, lo lãi suất, thu nhập khó chứng minh...' },
  ] },
];
const ADVANCED_FIELDS = ADVANCED_GROUPS.flatMap((g) => g.fields);

// Dựng input cho hồ sơ Nâng cao trong FORM (gọi 1 lần lúc init). name = "adv_<key>".
function buildAdvancedForm() {
  const body = $('#form-advanced-body');
  if (!body) return;
  body.innerHTML = ADVANCED_GROUPS.map((g) => `
    <div class="adv-group">
      <div class="adv-group-title">${escapeHtml(g.title)}</div>
      <div class="form-grid">
        ${g.fields.map((fld) => {
          const n = 'adv_' + fld.key, ph = escapeHtml(fld.ph);
          const input = fld.type === 'textarea'
            ? `<textarea name="${n}" rows="2" placeholder="${ph}"></textarea>`
            : fld.type === 'number'
              ? `<input name="${n}" type="number" min="0" step="1000000" placeholder="${ph}" />`
              : `<input name="${n}" type="text" placeholder="${ph}" />`;
          return `<label class="span-2">${escapeHtml(fld.label)} ${input}</label>`;
        }).join('')}
      </div>
    </div>`).join('');
}

// Ghi chú TỰ ĐỘNG: lấy note của mốc care stage MỚI NHẤT có ghi chú (quét lịch sử
// từ mới → cũ, lấy note đầu tiên khác rỗng). Không có note nào → null. KHÔNG lưu
// xuống DB — tính lại mỗi lần hiển thị nên luôn bám theo note care stage mới nhất.
// Trả cả {note, at} của mốc care stage mới nhất có ghi chú (để hiển thị kèm timestamp).
function autoNoteEntryFromHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const sorted = [...history].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const n = (sorted[i].note || '').trim();
    if (n) return { note: n, at: sorted[i].at || null };
  }
  return null;
}
// Chỉ lấy TEXT của ghi chú tự động (dùng ở card, vCard...). Giữ nguyên chữ ký cũ.
function autoNoteFromHistory(history) {
  const e = autoNoteEntryFromHistory(history);
  return e ? e.note : null;
}

// Thời điểm gần nhất 1 GHI CHÚ trong care timeline được GHI hoặc SỬA. Ghi = mốc `at`
// của entry; Sửa = `edited_at` (đặt lúc sửa). Chỉ tính entry CÓ ghi chú. Dùng cho dòng
// "Cập nhật ..." trên card — thay cho care_stage_updated_at (vốn đổi khi đổi bậc).
function lastNoteActivity(history) {
  if (!Array.isArray(history)) return null;
  let max = null;
  for (const h of history) {
    if (!h || !(h.note && String(h.note).trim())) continue;
    for (const t of [h.at, h.edited_at]) {
      if (t && (!max || t > max)) max = t;
    }
  }
  return max;
}

// Mốc "CẬP NHẬT" của card = hoạt động CARE TIMELINE mới nhất: muộn hơn giữa (đổi bậc
// care_stage → care_stage_updated_at) và (ghi/sửa note trong timeline → lastNoteActivity).
// KHÔNG tính các thay đổi khác (avatar, ghi chú chung, sửa field...) — chúng chỉ bump
// updated_at. Dùng CHUNG cho cả dòng "Cập nhật ..." LẪN sắp xếp → hai thứ luôn khớp nhau.
function cardUpdatedAt(c) {
  const a = c.care_stage_updated_at || '';
  const b = lastNoteActivity(c.care_stage_history) || '';
  const m = a > b ? a : b; // ISO 8601 cùng định dạng → so chuỗi = so thời gian
  return m || c.updated_at || '';
}

// Màu từng bậc (đỏ đất → xanh lá: càng về sau càng "chín"). Giữ nguyên color scheme
// cũ theo VỊ TRÍ bậc. Bậc 'Loại' = ĐỎ (kèm dấu ✕) để nổi bật là khách bị loại.
const CARE_STAGE_COLORS = {
  'Đăng kí mới':    '#a8382f', // đỏ son — vừa tạo, chưa tiếp cận (rõ ĐỎ, tách bậc 2)
  'Đang tiếp cận':  '#d1743a', // cam đất — rõ CAM để không lẫn với bậc 1
  'Đang chăm sóc':  '#d29b2c', // vàng cam
  'Xem dự án':      '#b6a92f', // vàng xanh
  'Hỗ trợ hồ sơ':   '#7f9b3f', // xanh cốm
  'Booking':        '#3f8f6b', // xanh ngọc
  'Kí HĐMB':        '#2f7d5e', // xanh lá đậm — chốt thành công
  [CARE_STAGE_DROPPED]: '#c0392b', // đỏ — bị loại (kèm dấu ✕)
};

// Khách chưa đặt tiến độ (bỏ trống) coi như bậc 1 'Đăng kí mới' (theo yêu cầu).
function careLevel(stage) {
  if (stage === CARE_STAGE_DROPPED) return 7; // vòng đầy như bậc 7
  const idx = CARE_STAGES.indexOf(stage);
  return idx === -1 ? 1 : idx + 1; // bỏ trống / lạ → bậc 1
}

function careColor(stage) {
  return CARE_STAGE_COLORS[stage] || CARE_STAGE_COLORS[CARE_STAGE_DEFAULT];
}

// Nhãn HIỂN THỊ của bậc (chỉ để xem). Giá trị lưu + lúc chọn trong form/bộ lọc vẫn là tên
// bậc gốc: 'Loại' hiển thị "Không chốt" (khách đã chăm nhưng mất deal — khác lead bị loại ở
// tab Khách mới).
const CARE_STAGE_DISPLAY = { [CARE_STAGE_DROPPED]: 'Không chốt' };
function careLabel(stage) {
  const s = stage || CARE_STAGE_DEFAULT;
  return CARE_STAGE_DISPLAY[s] || s;
}

function isCareDone(stage) {
  return CARE_DONE_STAGES.includes(stage);
}

// Thứ hạng để SẮP XẾP theo tiến độ (khác careLevel dùng để vẽ vòng tròn):
// bỏ trống → 1, 7 bậc phễu → 1-7, 'Loại' → 8 (xếp cuối cùng).
function careSortRank(stage) {
  if (stage === CARE_STAGE_DROPPED) return 8;
  const idx = CARE_STAGES.indexOf(stage);
  return idx === -1 ? 1 : idx + 1;
}

// 4 bậc MỨC QUAN TÂM → nhãn + màu (dùng cho viền trái card + badge trên card).
// Ngưỡng: Nguội <35, Ấm 35–<60, Nóng 60–<80, Rất nóng >=80. Xếp min giảm dần để
// find() lấy đúng bậc đầu tiên khách đạt.
const INTEREST_TIERS = [
  { key: 'ratnong', label: 'Rất nóng', color: '#a8302a', min: 80 },
  { key: 'nong',    label: 'Nóng',     color: '#c94f3e', min: 60 },
  { key: 'am',      label: 'Ấm',       color: '#e8a33d', min: 35 },
  { key: 'nguoi',   label: 'Nguội',    color: '#8b93a0', min: 0 },
];
function interestTier(pct) {
  const v = pct || 0;
  return INTEREST_TIERS.find((t) => v >= t.min) || INTEREST_TIERS[INTEREST_TIERS.length - 1];
}

// Cập nhật giao diện "Mức độ quan tâm" trong form: chữ %, nhãn bậc, và MÀU thanh
// trượt (track đã đạt + thumb) đổi theo bậc THỜI GIAN THỰC. Gọi ở mọi nơi set giá
// trị slider (mở form, đổi bậc chăm sóc, OCR, kéo tay) để màu luôn khớp giá trị.
function updateInterestUI(pct) {
  const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const tier = interestTier(v);
  const out = $('#interest-output');
  if (out) out.textContent = v + '%';
  const badge = $('#interest-tier-badge');
  if (badge) { badge.textContent = tier.label; badge.style.background = tier.color; }
  const sl = $('#customer-form').interest_level;
  if (sl) {
    // Phần đã đạt (0→v%) tô màu bậc, phần còn lại xám nhạt.
    sl.style.background = `linear-gradient(to right, ${tier.color} 0%, ${tier.color} ${v}%, #e5e5e5 ${v}%, #e5e5e5 100%)`;
    sl.style.setProperty('--intr-color', tier.color);
  }
}

// Loại căn có sẵn (select + "Khác" tự nhập, không lưu vào danh sách chung).
// Mỗi dự án / toà chỉ dùng 1 phần danh sách này + diện tích điển hình riêng — lưu ở bảng
// project_apt_types / building_apt_types (SQL/add_apt_types_by_project.sql, js/catalog.js).
const APT_TYPES = ['Studio', '1N-1WC', '1N+, 1WC', '2N-2WC', '2N+, 2WC', '2N-2WC-G', '3N-2WC'];

// Chuẩn hoá "loại căn" về đúng 1 dạng chuẩn trong APT_TYPES nếu khớp — BẤT KỂ khác dấu
// cách/phẩy/gạch, hoa/thường. Vd "2N+,2WC" và "2N+, 2WC" → cùng "2N+, 2WC" (không còn
// đếm thành 2 loại). Không khớp (giá trị "Khác" tự nhập) → giữ nguyên (chỉ trim).
// Thêm (2026-10-07): đọc cả cách viết TỰ DO (hay gặp ở OCR / landing): "2 ngủ", "2N", "2n", "2PN",
// "2 phòng ngủ", "2BR" → 2N-2WC; "2 ngủ+", "2 ngủ +", "2PN+", "2N cộng" → 2N+, 2WC; "2PN Góc" →
// 2N-2WC-G; "3 ngủ" → 3N-2WC; "studio" → Studio. Ghi số WC KHÁC mặc định (vd "3N-3WC") → không
// đoán, giữ nguyên. Cùng logic với hàm SQL public.canonical_apt_type (SQL/normalize_apt_type_aliases.sql).
const APT_ALIAS_BASE = { 1: '1N-1WC', 2: '2N-2WC', 3: '3N-2WC' };   // số WC mặc định theo số ngủ
const APT_ALIAS_PLUS = { 1: '1N+, 1WC', 2: '2N+, 2WC' };
const APT_ALIAS_CORNER = { 2: '2N-2WC-G' };
function aptTypeFromAlias(s) {
  const t = removeVietnameseTones(s); // chữ thường, bỏ dấu: "2 Ngủ+" → "2 ngu+"
  if (/studio/.test(t)) return 'Studio';
  const m = t.match(/(\d)\s*(?:p\.?\s*n|phong\s*ngu|ngu|n|br|bedrooms?|beds?)(?![a-z])\s*(\+|cong(?![a-z])|plus)?/);
  if (!m) return null;
  const n = Number(m[1]);
  const plus = !!m[2];
  const corner = /goc/.test(t) || /(^|[\s\-(])g\)?$/.test(t.trim());
  const canon = corner ? (plus ? null : APT_ALIAS_CORNER[n]) : (plus ? APT_ALIAS_PLUS[n] : APT_ALIAS_BASE[n]);
  if (!canon) return null;
  const w = t.match(/(\d)\s*(?:wc|vs|ve\s*sinh|toilet)/);       // có ghi số WC → phải khớp
  if (w && !canon.includes(w[1] + 'WC')) return null;
  return canon;
}
function canonicalAptType(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9+]/g, '');
  const key = norm(s);
  return APT_TYPES.find((t) => norm(t) === key) || aptTypeFromAlias(s) || s;
}

// Nghề nghiệp (khớp enum ở schema) — dùng để lọc giá trị OCR trả về cho hợp lệ.
const OCCUPATIONS = ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội'];

// Icon điện thoại (SVG inline, tô theo màu chữ, cỡ ăn theo font-size chỗ đặt).
// Zalo dùng ảnh icons/Zalo-icon.png (đặt trong <img>).
const PHONE_SVG = '<svg class="ic-phone" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

// Icon đồng hồ nhỏ (SVG inline) — dùng cho pill khoảng thời gian giữa 2 bậc trên timeline.
const CLOCK_SVG = '<svg class="cs-gap-ic" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Icon tia sét (SVG inline) — thay cho chấm "•" ở đầu ghi chú TỰ ĐỘNG để làm nổi bật.
const BOLT_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 2v11h3v9l7-12h-4l4-8z" fill="currentColor"/></svg>';

let sb = null;
let currentUser = null;
let accountSyncTimer = null;
let allCustomers = [];
let progressFilter = 'active'; // lọc trạng thái: 'active' | 'done' | 'all' (dropdown tuỳ biến)
// Lọc theo THỜI GIAN ĐĂNG KÝ (registered_at, fallback created_at). preset:
// 'all'|'today'|'week'|'month'|'custom'; custom dùng from/to ('YYYY-MM-DD').
let dateFilter = { preset: 'all', from: null, to: null };
let aptTypeFilter = ''; // Bedroom group filter in the existing Tiềm năng panel.
let stageFilter = '';      // lọc theo bậc Tiến độ (dropdown): '' = Tất cả, hoặc tên bậc
let calExpanded = true;     // lịch Tuỳ chọn đang mở? (tự thu gọn sau khi chọn xong khoảng)
let editingId = null;
let formOriginalStage = ''; // care_stage lúc mở form — để biết có đổi bậc không
let pendingOcrNote = null;  // ghi chú OCR đọc được → thêm thành 1 note sau khi tạo khách
let pendingOcrImage = null; // ảnh OCR (blob đã nén) → lưu thành tài liệu reg_image sau khi tạo khách

// ---- NGUỒN KHÁCH (source) — quy tắc chốt 2026-10-06, xem docs/decisions.md ----
// source (jsonb MẢNG) chỉ chứa KÊNH khách đến từ đâu; 1 khách có thể nhiều kênh (gộp
// khi trùng SĐT+tên, xem handleFormSubmit). Mã: chữ thường, snake_case, dạng <nền tảng>_<loại>.
// Thêm kênh mới (google_ads, tiktok_ads...) = thêm 1 dòng vào SOURCES — không cần migration.
// Cách nhập (tay/ảnh/Excel/API) KHÔNG nằm ở đây mà ở cột intake_method.
const SOURCES = {
  facebook_ads: 'Facebook Ads',
  website:      'Landing page',
  referral:     'Khách quen / giới thiệu',
  // google_ads: 'Google Ads',
  // tiktok_ads: 'TikTok Ads',
};
const SOURCE_DEFAULT = 'facebook_ads';
// Mã cũ trước 2026-10-06 (app cũ/thiết bị chưa cập nhật có thể còn ghi) → mã kênh mới.
const SOURCE_LEGACY = { manual: 'facebook_ads', ocr: 'facebook_ads', landing: 'website' };
const LS_LAST_SOURCE = 'crm_last_source'; // kênh chọn gần nhất → mặc định cho khách mới

// Chuẩn hoá source (string cũ | mảng | null) → mảng mã kênh, không trùng.
function sourceListOf(source) {
  const raw = Array.isArray(source) ? source : (typeof source === 'string' && source ? [source] : []);
  const out = [];
  for (const s of raw) {
    if (!s) continue;
    const code = SOURCE_LEGACY[s] || s;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}
// Nhãn 1 mã kênh. Mã lạ KHÔNG bị đoán thành kênh khác — hiện nguyên mã để dễ phát hiện.
function sourceLabel(code) {
  return SOURCES[code] || ('Khác (' + code + ')');
}
// Chuỗi hiển thị: nhãn các kênh nối bằng " + ". Trống → "Chưa rõ".
function sourceDisplay(source) {
  const list = sourceListOf(source);
  if (list.length === 0) return 'Chưa rõ';
  return list.map(sourceLabel).join(' + ');
}
// Tên chiến dịch: cột campaign; lead web chưa có thì lấy UTM landing page ghi (web_*).
function campaignOf(c) {
  return (c && (c.campaign || c.web_last_campaign || c.web_first_campaign)) || '';
}

// ---- LỚP KHÁCH: lớp 1 "Khách mới" (lead) ⇄ lớp 2 "Chăm sóc" (xem SQL/add_lead_layer.sql) ----
// qualified_at trống = còn ở lớp 1 (không hiện trang chủ). Đạt = đã có ≥1 cuộc gọi
// "Nói chuyện được" + sale xác nhận quan tâm → set qualified_at, chuyển bậc 'Đang chăm sóc'.
const QUALIFIED_STAGE = 'Đang chăm sóc';
const LEAD_ONLY_STAGES = ['Đăng kí mới', 'Đang tiếp cận']; // bậc thuộc lớp 1, ẩn ở trang chủ
function isQualified(c) { return !!(c && c.qualified_at); }
// 'new' (chưa gọi) | 'calling' (đang gọi) | 'dropped' (đã loại)
function leadStatus(c) {
  if (c.disqualified_at) return 'dropped';
  return callAttemptsOf(c).length ? 'calling' : 'new';
}
// Kết quả 1 lần gọi (mã lưu DB → nhãn). Mã đã dùng KHÔNG đổi nghĩa; thêm mã = thêm dòng.
// Gợi ý theo thời lượng + lớp khách: CALL_RESULT_SETS trong js/calls.js.
// Mỗi lần gọi (call_attempts) = {at, result, note, duration?, origin?, device_id?, direction?}:
//   result null = CHƯA GHI CHÚ (vd cuộc gọi tự nạp từ nhật ký máy Android), duration = giây
//   (null = không biết, nhập tay), origin 'manual' | 'device'.
const CALL_RESULTS = {
  no_answer:    'Không nghe máy',
  unreachable:  'Thuê bao / tắt máy',
  line_busy:    'Máy bận',
  hung_up:      'Cúp máy',
  wrong_number: 'Sai số',
  busy:         'Bận, hẹn gọi lại',
  talked:       'Nói chuyện được',
};
function callResultLabel(a) { return a.result ? (CALL_RESULTS[a.result] || a.result) : 'Chưa ghi chú'; }
// Thời lượng gọn kiểu "2p1s" / "45s" / "0s". null → ''.
function formatCallDuration(sec) {
  if (sec == null || isNaN(sec)) return '';
  sec = Math.max(0, Math.round(sec));
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}p${sec % 60}s`;
}
function pendingCallsOf(c) { return callAttemptsOf(c).filter((a) => !a.result); }
// 1 dòng nhật ký gọi (dùng chung hộp Khách mới + hồ sơ Tiềm năng). prevAt: mốc trước để tính khoảng cách.
function callAttemptHtml(a, i, prevAt, prevLabel) {
  const gapMs = prevAt ? Date.parse(a.at) - Date.parse(prevAt) : NaN;
  const gap = isNaN(gapMs) ? '' : prevLabel + formatDuration(gapMs);
  const dur = formatCallDuration(a.duration);
  const dir = a.direction === 'in' ? ' · khách gọi đến' : '';
  const pending = !a.result;
  return `<div class="lead-attempt res-${escapeHtml(a.result || 'pending')}">
      <div class="lead-attempt-top"><b>Lần ${i + 1}</b> · ${escapeHtml(formatLogTime(a.at))}${dur ? ' · ' + escapeHtml(dur) : ''}${dir} · <span class="lead-res">${escapeHtml(callResultLabel(a))}</span>
        ${pending ? `<button type="button" class="btn-small call-annotate" data-call-at="${escapeHtml(a.at)}">Ghi chú</button>` : ''}</div>
      ${gap ? `<div class="lead-dim">${escapeHtml(gap)}</div>` : ''}
      ${a.note ? `<div class="lead-attempt-note">${escapeHtml(a.note)}</div>` : ''}
    </div>`;
}
function callAttemptsOf(c) {
  return (Array.isArray(c && c.call_attempts) ? c.call_attempts : [])
    .filter((a) => a && a.at)
    .slice().sort((a, b) => a.at.localeCompare(b.at)); // cũ → mới
}
function hasTalked(c) { return callAttemptsOf(c).some((a) => a.result === 'talked'); }
// Lý do loại lead (mã → nhãn). 4 lý do đầu = hay gặp nhất (hiện nổi bật). Thêm lý do mới
// = thêm 1 dòng (mã cũ đã lưu không bao giờ đổi nghĩa). 'khac' bắt buộc kèm ghi chú.
const LEAD_DROP_REASONS = {
  gia_cao:             'Chê giá cao',
  pha_campaign:        'Phá campaign',
  khong_du_dieu_kien:  'Không đủ điều kiện',
  khong_lien_lac_duoc: 'Không liên lạc được',
  so_sai:              'Số sai',
  no_xau:              'Nợ xấu',
  do_gia:              'Dò giá',
  to_mo:               'Tò mò',
  khac:                'Khác',
};
const LEAD_DROP_TOP = ['gia_cao', 'pha_campaign', 'khong_du_dieu_kien', 'khong_lien_lac_duoc'];
function dropReasonLabel(code) { return LEAD_DROP_REASONS[code] || code || ''; }
// Gợi ý loại "Không liên lạc được": ≥3 lần gọi, chưa lần nào nói chuyện được.
const LEAD_UNREACHABLE_SUGGEST = (window.FOLLOWUP && FOLLOWUP.config.leadMaxAttempts) || 5; // js/followup.js
let leadFilter = 'open';     // dropdown trạng thái: 'open' (cần gọi) | 'dropped' | 'all'
let leadSrcFilter = '';      // bộ lọc kênh: '' = tất cả, hoặc mã trong SOURCES
let leadAptTypeFilter = '';
let leadDatePreset = 'all';  // bộ lọc thời gian đăng ký: 'all' | 'today' | 'week' | 'month'
// Sắp xếp tab Khách mới: mảng {key, dir}. Thứ tự hàng trong panel = thứ tự ƯU TIÊN khi ghép.
const LEAD_SORT_ATTRS = [
  { key: 'reg',      name: 'Thời gian đăng ký' },
  { key: 'attempts', name: 'Số lần gọi' },
  { key: 'name',     name: 'Tên' },
];
// Mặc định (chốt 2026-10-07): đăng ký mới nhất → ít lần gọi nhất → tên A→Z.
const LEAD_DEFAULT_SORT = [
  { key: 'reg', dir: 'desc' },
  { key: 'attempts', dir: 'asc' },
  { key: 'name', dir: 'asc' },
];
let leadSort = LEAD_DEFAULT_SORT.map((x) => ({ ...x }));
let leadSortDraft = {};

// Nhãn hiển thị cho loại tài liệu (kind). Mở rộng khi có loại giấy tờ mới.
const DOC_KIND_LABELS = {
  reg_image: 'Ảnh đăng ký',
  cccd: 'CCCD/CMND',
  so_ho_khau: 'Sổ hộ khẩu',
  hop_dong: 'Hợp đồng',
  khac: 'Khác',
};

// Dự án (multi-select, danh sách tự quản lý — lưu ở bảng project_options)
let projectOptions = [];        // [{id, name}]
let selectedProjects = [];      // tên dự án đang chọn ở form
let projManageMode = false;     // đang bật chế độ xoá dự án
const LS_LAST_PROJECTS = 'crm_last_projects';  // lựa chọn gần nhất → mặc định khách mới
const LS_LAST_USER = 'crm_last_user';          // {id,email} người dùng đăng nhập gần nhất (cho chế độ offline)
const LS_VIEW_MODE = 'crm_view_mode';          // 'card' | 'list' — kiểu hiển thị danh sách khách

// Kiểu xem danh sách: 'card' (thẻ đầy đủ, mặc định) hoặc 'list' (dòng gọn để lướt nhanh
// khi khách nhiều). Đọc lựa chọn cũ từ localStorage.
let viewMode = (localStorage.getItem(LS_VIEW_MODE) === 'list') ? 'list' : 'card';

// Người dùng đã đăng nhập gần nhất (để vào app xem dữ liệu offline khi mất mạng).
function rememberedUser() {
  try { const u = JSON.parse(localStorage.getItem(LS_LAST_USER) || 'null'); return (u && u.id) ? u : null; }
  catch { return null; }
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------------------------------------------------------------- AUTH ----

function initSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function boot() {
  initSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onLoggedIn(session.user);
  } else if (!navigator.onLine && rememberedUser()) {
    // Mất mạng nhưng đã từng đăng nhập → vào app xem dữ liệu offline, KHÔNG bắt đăng nhập lại.
    await onLoggedIn(rememberedUser());
  } else {
    showAuthScreen();
  }
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) { if (!currentUser) onLoggedIn(session.user); return; }
    // Mất phiên: nếu đang MẤT MẠNG và còn nhớ user → GIỮ nguyên app (đừng đá ra login).
    // Chỉ khi ĐANG ONLINE (đăng xuất thật / token hết hạn) mới về màn hình đăng nhập.
    if (!navigator.onLine && rememberedUser()) return;
    currentUser = null; clearAccountView(); showAuthScreen();
  });
}

async function onLoggedIn(user) {
  currentUser = user;
  await CRM.init(sb, user.id);
  if (currentUser?.id !== user.id) return;
  Catalog.scope(user.id);
  // Nhớ user để lần sau mất mạng vẫn vào xem dữ liệu offline được.
  try { localStorage.setItem(LS_LAST_USER, JSON.stringify({ id: user.id, email: user.email || '' })); } catch {}
  // Avatar = chữ cái đầu của email; menu hiện email đầy đủ
  const email = user.email || '';
  $('#user-menu-btn .avatar-initial').textContent = (email[0] || '?').toUpperCase(); // giữ nguyên mũi tên menu
  $('#user-email').textContent = email;
  showAppScreen();
  focusSearchOnDesktop(); // con trỏ nằm sẵn ở ô tìm kiếm khi vừa vào app
  await refreshList(); // local-first: show this account's offline cache before the network
  if (currentUser?.id !== user.id) return;
  await CRM.flushQueue();
  if (currentUser?.id !== user.id) return;
  await CRM.pull();
  if (currentUser?.id !== user.id) return;
  await loadProjectOptions();
  if (currentUser?.id !== user.id) return;
  await refreshList();
  if (currentUser?.id !== user.id) return;
  hideSplash(); // dữ liệu đã sẵn sàng → ẩn màn hình tải
  if (window.CRMCalls) CRMCalls.sync(); // vỏ Android: đọc nhật ký cuộc gọi máy (web: không làm gì)
  checkAppUpdate(true);                 // vỏ Android: có APK mới → banner (web: không làm gì)
  maybeMigrateAvatars(user.id); // chuyển avatar cũ sang bucket public (chạy nền, 1 lần)
  syncZaloGreeting();           // đồng bộ lời chào Zalo từ Supabase (đa thiết bị, chạy nền)
  syncZaloTemplates();          // đồng bộ các mẫu tin Zalo khác
  syncTeam();                   // danh sách nhóm (giao khách — js/team.js)
  clearInterval(accountSyncTimer);
  accountSyncTimer = setInterval(async () => {
    if (currentUser?.id !== user.id) return;
    await CRM.flushQueue();
    // Nếu lần kéo trước lỗi mạng → thử KÉO LẠI (mạng chập chờn có thể không bắn event
    // 'online'). Kéo được thì vẽ lại danh sách cho khớp bản mới nhất.
    if (CRM.isOnline() && CRM.lastPullError && CRM.lastPullError()) {
      const r = await CRM.pull();
      if (r && r.ok) await refreshList();
    }
    updateSyncBadge();
  }, 15000);
  updateSyncBadge();
}

function showAuthScreen() {
  $('#auth-screen').hidden = false;
  $('#app-screen').hidden = true;
  $('#detail-screen').hidden = true;
  hideSplash(); // cần đăng nhập → ẩn màn hình tải, hiện form
}

// Ẩn màn hình tải (splash) sau khi app/đăng nhập sẵn sàng — mờ dần rồi bỏ hẳn.
function hideSplash() {
  const s = $('#splash');
  if (!s || s.hidden) return;
  s.classList.add('fade');
  setTimeout(() => { s.hidden = true; }, 320);
}

function showAppScreen() {
  $('#auth-screen').hidden = true;
  $('#app-screen').hidden = false;
  $('#detail-screen').hidden = true;
  // Nếu đang ở tab Tổng quan thì vẽ lại cho khớp dữ liệu mới nhất.
  if (!$('#dashboard-view').hidden) renderDashboard();
}

// Đặt sẵn con trỏ ở ô tìm kiếm mỗi lần vào app (reload / mở lại / lần đầu) để gõ tìm
// được ngay, không phải bấm chuột vào ô. CHỈ làm trên máy KHÔNG cảm ứng (Mac/laptop):
// trên điện thoại, focus sẽ tự bật bàn phím ảo mỗi lần mở app → phiền, nên bỏ qua.
function focusSearchOnDesktop() {
  const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (isTouch) return;
  if ($('.topbar').classList.contains('no-search')) return; // tab hiện tại không có ô tìm
  // requestAnimationFrame: chờ app-screen hiện xong hẳn rồi mới focus (tránh bị mất focus).
  requestAnimationFrame(() => { const el = $('#search-input'); if (el) el.focus(); });
}

function showDetailScreen() {
  $('#auth-screen').hidden = true;
  $('#app-screen').hidden = true;
  $('#detail-screen').hidden = false;
  // Đẩy 1 entry vào lịch sử trình duyệt để nút/gesture "Quay lại" của Android đóng màn chi
  // tiết (về danh sách) thay vì THOÁT APP. Chỉ đẩy khi mới vào chi tiết (không đẩy khi vẽ lại).
  if (!history.state || history.state.screen !== 'detail') {
    history.pushState({ screen: 'detail' }, '');
  }
}

// Đóng màn chi tiết về danh sách. Nếu đang có entry 'detail' trong history → lùi history
// (→ sự kiện popstate sẽ đóng, giữ history đồng bộ). Nếu không → đóng trực tiếp.
function closeDetailToList() {
  detailId = null;
  if (history.state && history.state.screen === 'detail') history.back();
  else showAppScreen();
}

// Gesture/nút "Quay lại" của Android/trình duyệt → nếu đang ở màn chi tiết thì về danh sách.
// (Các <dialog> native như form/lịch/xem ảnh được trình duyệt tự đóng bằng back, không tới đây.)
window.addEventListener('popstate', () => {
  if (!$('#detail-screen').hidden) { detailId = null; showAppScreen(); }
});

// ---- NÚT / VUỐT BACK trong vỏ Android (android-app/, MainActivity gọi window.CRMBack()) ----
// Trả true = đã lùi 1 bước trong app; false = không còn gì để lùi → vỏ đưa app xuống nền.
// Thứ tự: hộp thoại mở SAU CÙNG → menu/panel → hồ sơ khách → xoá ô tìm → về Tổng quan.
// Trình duyệt thường không gọi hàm này (back vẫn theo history như cũ).
const _showModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  this.dataset.openedAt = String(performance.now()); // để biết hộp nào mở sau cùng
  return _showModal.apply(this, arguments);
};
// ---- THANH TRẠNG THÁI (vỏ Android): icon giờ/pin màu TRẮNG trên nền thanh tiêu đề xanh đậm ----
// Plugin lõi SystemBars của Capacitor 8 (style 'DARK' = nền tối → icon sáng). Chỉ đổi thanh TRÊN; thanh điều
// hướng dưới giữ theo giao diện (nền be → icon tối). Trình duyệt thường: không làm gì.
(function setStatusBarLight() {
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform() || typeof cap.nativePromise !== 'function') return;
  cap.nativePromise('SystemBars', 'setStyle', { style: 'DARK', bar: 'StatusBar' }).catch(() => {});
})();

// ---- NÚT CẬP NHẬT APP (chỉ trong vỏ Android) ----
// So phiên bản APK đang cài (plugin native AppInfo) với /android-app-version.json (sửa file này mỗi
// lần phát APK mới — android-app/build-apk.sh tự cập nhật). Cũ hơn → banner; bấm Cập nhật → mở link
// APK trên Supabase Storage (bucket app-releases) → Chrome tải về → Android hỏi "Cài đặt?".
const APP_VERSION_URL = '/android-app-version.json';
const APP_UPDATE_CHECK_MS = 30 * 60 * 1000; // kiểm tra lại tối đa 30 phút/lần khi mở lại app
let appUpdateCheckedAt = 0, appUpdateInfo = null;
async function checkAppUpdate(force) {
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform() || typeof cap.nativePromise !== 'function') return;
  if (!force && Date.now() - appUpdateCheckedAt < APP_UPDATE_CHECK_MS) return;
  appUpdateCheckedAt = Date.now();
  try {
    const cur = await cap.nativePromise('AppInfo', 'get', {});
    const res = await fetch(APP_VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const latest = await res.json();
    if (!(Number(latest.versionCode) > Number(cur.versionCode)) || !latest.url) { $('#app-update-bar').hidden = true; return; }
    let dismissed = null; try { dismissed = sessionStorage.getItem('crm_app_update_dismissed'); } catch {}
    if (dismissed === String(latest.versionCode)) return; // bấm ✕ → không nhắc lại trong phiên này
    appUpdateInfo = latest;
    $('#app-update-text').textContent = `Có bản app mới ${latest.versionName || ''}` + (latest.notes ? ` — ${latest.notes}` : '');
    $('#app-update-bar').hidden = false;
  } catch (e) {
    // APK cũ chưa có plugin AppInfo / mất mạng → bỏ qua lặng lẽ.
  }
}
$('#app-update-btn')?.addEventListener('click', () => {
  if (!appUpdateInfo) return;
  // Link khác tên miền app → vỏ Capacitor tự mở bằng trình duyệt ngoài (Chrome) để tải APK.
  window.location.href = appUpdateInfo.url;
  showToast('Đang tải bản mới — tải xong bấm vào file để cài đè (không cần gỡ app)');
});
$('#app-update-close')?.addEventListener('click', () => {
  $('#app-update-bar').hidden = true;
  try { if (appUpdateInfo) sessionStorage.setItem('crm_app_update_dismissed', String(appUpdateInfo.versionCode)); } catch {}
});
window.addEventListener('crm:resume', () => checkAppUpdate(false));

window.CRMBack = function () {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  if (dialogs.length) {
    dialogs.sort((a, b) => Number(a.dataset.openedAt || 0) - Number(b.dataset.openedAt || 0));
    dialogs[dialogs.length - 1].close();
    return true;
  }
  const menu = document.querySelector('#topbar-menu.open, #notif-wrap.open, #search-menu.open');
  if (menu) { menu.classList.remove('open'); return true; }
  if (document.querySelector('#app-screen .pop-panel:not([hidden])')) { closeToolPops(); closeLeadPops(); return true; }
  if (!$('#detail-screen').hidden) { closeDetailToList(); return true; }
  if (!$('#app-screen').hidden) {
    const q = $('#search-input');
    if (q && q.value) { q.value = ''; q.dispatchEvent(new Event('input')); return true; }
    if ($('#dashboard-view').hidden) { showDashboardView(); window.scrollTo(0, 0); return true; }
  }
  return false;
};

async function handleLogin(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errBox = $('#auth-error');
  errBox.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errBox.textContent = 'Đăng nhập lỗi: ' + error.message; return; }
  await onLoggedIn(data.user);
}

async function handleSignup(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errBox = $('#auth-error');
  errBox.textContent = '';
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) { errBox.textContent = 'Đăng ký lỗi: ' + error.message; return; }
  if (data.session) { await onLoggedIn(data.user); }
  else { errBox.textContent = 'Đã gửi email xác nhận — kiểm tra hộp thư rồi đăng nhập lại.'; }
}

async function handleLogout() {
  // Đăng xuất CHỦ ĐỘNG: xoá "nhớ user" trước để chế độ offline không giữ app lại,
  // rồi về màn hình đăng nhập ngay (kể cả khi đang mất mạng).
  try { localStorage.removeItem(LS_LAST_USER); } catch {}
  currentUser = null;
  clearAccountView();
  try { await sb.auth.signOut(); } catch {}
  showAuthScreen();
}

// Làm mới dữ liệu: đẩy hàng đợi + kéo bản mới nhất từ Supabase + vẽ lại
// (không phải reload cả trang — giữ nguyên vị trí đang xem).
let manualSyncing = false; // đang chạy làm mới thủ công → nút hiện trạng thái "đang đồng bộ"
async function handleReload() {
  if (manualSyncing) return;
  manualSyncing = true;
  updateSyncBadge();                                    // → ↻ đang đồng bộ (xoay)
  const minSpin = new Promise((r) => setTimeout(r, 550)); // giữ ↻ tối thiểu để thấy hiệu ứng
  try {
    await CRM.flushQueue();
    await CRM.pull();
    await refreshList();
    if (!$('#dashboard-view').hidden) renderDashboard();
  } catch (e) {
    console.warn('Làm mới lỗi:', e);
  }
  await minSpin;
  manualSyncing = false;
  updateSyncBadge();                                    // → về trạng thái thật (✓ / ⊘ / !)
}

// ------------------------------------------------------------- SYNC UI ----

// Nút đồng bộ gộp: 4 trạng thái (synced/syncing/offline/error) — icon + màu + tooltip.
// Icon bộ "ĐÁM MÂY" (cloud): đám mây nét (currentColor theo trạng thái) + ký hiệu bên trong.
// Riêng syncing xoay CHỈ phần mũi tên (<g class="spin">), không xoay cả đám mây.
const CLOUD = 'M17.5 18.5H8.4A5.4 5.4 0 1 1 13.8 10h1.6a3.9 3.9 0 1 1 0 8.5Z';
const SYNC_SVG = {
  synced: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${CLOUD}"/><path d="M9.6 13.4l1.8 1.8 3.4-3.7"/></svg>`,
  syncing: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${CLOUD}"/><g class="spin"><path d="M14.3 13a2.5 2.5 0 1 1-.75-1.8"/><path d="M14.4 10.1v1.6h-1.6"/></g></svg>`,
  offline: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 18.5H8.4A5.4 5.4 0 0 1 5 9.2m3.6-1.1A5.4 5.4 0 0 1 13.8 10h1.6a3.9 3.9 0 0 1 3.4 5.8"/><path d="M4.5 4.5l15 15"/></svg>`,
  error: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${CLOUD}"/><path d="M12 11v2.2"/><path d="M12 15.7h.02"/></svg>`,
};
// Glyph nhỏ dùng trong CHỮ tooltip (không phải icon nút).
const SYNC_GLYPH = { synced: '✓', syncing: '↻', offline: '⊘', error: '!' };
let lastSyncedAt = null, prevSyncState = null;
function fmtClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function updateSyncBadge() {
  const n = await CRM.pendingCount();
  const err = CRM.lastSyncError && CRM.lastSyncError();
  const pullErr = CRM.lastPullError && CRM.lastPullError();
  let state, label;
  if (manualSyncing) { state = 'syncing'; label = 'Đang đồng bộ...'; }
  else if (!CRM.isOnline()) { state = 'offline'; label = 'Offline' + (n ? ` — ${n} thay đổi chờ` : ''); }
  else if (n > 0 && err) { state = 'error'; label = `Kẹt đồng bộ (${n} thay đổi) — chạm để xử lý`; }
  else if (pullErr) { state = 'error'; label = 'Chưa tải được bản mới — chạm để thử lại'; }
  else if (n > 0) { state = 'syncing'; label = `Đang đồng bộ ${n} thay đổi...`; }
  else { state = 'synced'; label = 'Đã đồng bộ'; }

  // Ghi mốc "lần cuối đồng bộ" khi vừa CHUYỂN sang trạng thái đã đồng bộ.
  if (state === 'synced' && prevSyncState !== 'synced') lastSyncedAt = Date.now();
  prevSyncState = state;

  const btn = $('#sync-btn');
  if (!btn) return;
  btn.className = 'sync-btn sync-' + state;
  btn.dataset.state = state;
  btn.querySelector('.sync-ic').innerHTML = SYNC_SVG[state];
  const line1 = `${SYNC_GLYPH[state]} ${label}`;
  const line2 = lastSyncedAt ? `Lần cuối: ${fmtClock(lastSyncedAt)}` : '';
  const tip = line2 ? `${line1}\n${line2}` : line1;
  btn.querySelector('.sync-tip').textContent = tip;
  btn.setAttribute('aria-label', tip.replace('\n', ' · '));
}
window.addEventListener('online', updateSyncBadge);
window.addEventListener('offline', updateSyncBadge);

// Xử lý trạng thái LỖI: thử đẩy lại; nếu vẫn kẹt → hiện lỗi + cho xoá thao tác kẹt (escape hatch).
async function handleSyncError() {
  const n = await CRM.pendingCount();
  if (!n && CRM.lastPullError && CRM.lastPullError()) { // chỉ kẹt ở khâu KÉO → thử tải lại
    await handleReload();
    alert((CRM.lastPullError && CRM.lastPullError()) ? 'Vẫn chưa tải được — kiểm tra lại mạng rồi thử lần nữa.' : 'Đã tải được dữ liệu mới nhất.');
    return;
  }
  if (!n) { await handleReload(); return; }
  const err = CRM.lastSyncError && CRM.lastSyncError();
  await CRM.flushQueue();
  if ((await CRM.pendingCount()) === 0) { updateSyncBadge(); alert('Đã đồng bộ xong.'); return; }
  const detail = err ? `Lỗi: ${err.message}${err.code ? ' (' + err.code + ')' : ''}\n\n` : '';
  if (confirm(`${detail}Có ${n} thay đổi không đẩy lên server được (đang kẹt).\n\nBỏ qua & xoá các thay đổi kẹt này?\n(Dữ liệu khách đã lưu trên máy vẫn còn — chỉ ngừng cố đẩy các thao tác lỗi. Nếu cần, mở khách đó bấm Lưu để đồng bộ lại.)`)) {
    await CRM.clearQueue();
    await refreshList();
    updateSyncBadge();
  }
}

// Nút đồng bộ gộp: bấm hành xử theo trạng thái (chỉ gộp UI, logic vẫn là flush/pull/xử-lỗi cũ).
$('#sync-btn')?.addEventListener('click', () => {
  const state = $('#sync-btn').dataset.state;
  if (state === 'syncing') return;              // đang đồng bộ → bỏ qua
  if (state === 'error') { handleSyncError(); return; } // lỗi → hiện & thử sửa
  handleReload();                               // synced (làm mới) / offline (thử reconnect)
});

// -------------------------------------------------------------- LIST ------

async function refreshList() {
  const userId = currentUser?.id;
  const customers = await CRM.list();
  if (userId !== currentUser?.id) return;
  allCustomers = customers;
  scheduleSearchWarmup();
  renderList();
  renderLeads();
  if (!$('#dashboard-view').hidden) renderDashboard(); // Tổng quan là màn mặc định khi mở app
  updateSyncBadge();
  renderNotifications();
  const assignErr = CRM.takeAssignError(); // giao khách bị server từ chối (trùng SĐT bên người nhận…)
  if (assignErr) alert('⚠️ ' + assignErr);
}

// ─── CHUÔNG THÔNG BÁO ───────────────────────────────────────────────────────
// Tính lại danh sách thông báo từ "cổng" NOTIF (xem js/notifications.js), cập
// nhật chấm đỏ + số, đặt badge trên icon app (PWA), và vẽ panel xổ xuống.
// Gọi mỗi khi dữ liệu đổi (refreshList) và định kỳ (setInterval) để "đến giờ
// gọi" tự nổi lên theo thời gian mà không cần thao tác.
let _notifCache = [];
function renderNotifications() {
  if (!window.NOTIF) return;
  const items = NOTIF.compute(ownedCustomers()); // chỉ nhắc người phụ trách
  _notifCache = items;
  const n = items.length;

  // Chấm đỏ + số trên chuông
  const dot = $('#notif-dot');
  if (dot) {
    dot.textContent = n > 99 ? '99+' : String(n);
    dot.hidden = n === 0;
  }

  // Badge trên icon app (PWA). Chỉ có ở một số trình duyệt → phải kiểm tra.
  if ('setAppBadge' in navigator) {
    if (n > 0) navigator.setAppBadge(n).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
  }

  // Danh sách trong panel
  const list = $('#notif-list');
  if (list) {
    if (n === 0) {
      list.innerHTML = '<div class="notif-empty">Không có thông báo 👍</div>';
    } else {
      list.innerHTML = items.map((it) => `
        <button class="notif-item level-${it.level}" data-notif-open="${escapeHtml(it.customerId)}" data-notif-rule="${escapeHtml(it.ruleKey)}">
          <div class="notif-item-top">
            <span class="notif-item-title">${escapeHtml(it.title)}</span>
            <span class="notif-item-name">${escapeHtml(it.customerName)}</span>
          </div>
          <div class="notif-item-body">${escapeHtml(it.body)}</div>
        </button>`).join('');
    }
  }
}

function normalizePhone(p) {
  return (p || '').replace(/[^\d+]/g, '');
}

// Bỏ dấu tiếng Việt để tìm kiếm "theo ký tự": "Hương" → "huong", "Đặng" → "dang".
// Cách làm: NFD tách chữ + dấu thành 2 phần rồi xoá toàn bộ ký tự dấu tổ hợp
// (dấu thanh, mũ, râu ư/ơ...). Riêng đ/Đ không tách được bằng NFD nên thay tay.
function removeVietnameseTones(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

// Máy Mac để bàn (KHÔNG phải iPhone/iPad giả UA Macintosh). iPad Safari cũng báo
// "Macintosh" nhưng có cảm ứng (maxTouchPoints > 1) → loại ra để iOS vẫn dùng web.
function isMacDesktop() {
  const ua = navigator.userAgent || '';
  const isMac = /Macintosh|Mac OS X/.test(ua);
  const isTouchIOS = /iPhone|iPad|iPod/.test(ua) || (isMac && navigator.maxTouchPoints > 1);
  return isMac && !isTouchIOS;
}

function zaloLink(phone) {
  const clean = normalizePhone(phone).replace(/^\+?84/, '0');
  // Trên Mac có app Zalo native: deep-link mở THẲNG cửa sổ chat của khách (scheme
  // này dò được từ app Zalo Mac — xem CHANGELOG 2026-08-20). Các nền tảng khác
  // (Android/iOS/Windows...) dùng link web zalo.me, tự mở app nếu có (App/Universal
  // Links). Lưu ý: nếu Mac chưa cài app Zalo thì bấm sẽ không mở gì — chấp nhận
  // được vì đây là công cụ nội bộ cho sale luôn dùng Zalo.
  if (isMacDesktop()) return `zalo://conversation?phone=${clean}`;
  return `https://zalo.me/${clean}`;
}

// ---- LỜI CHÀO ZALO ----------------------------------------------------------
// Zalo KHÔNG cho điền sẵn ô lời chào qua deep-link → giải pháp: bấm icon Zalo sẽ COPY
// sẵn lời chào (đã điền tên khách) vào clipboard để DÁN vào ô kết bạn. Lời chào lưu ở
// localStorage (theo TỪNG MÁY), sửa trong menu avatar. Placeholder: {ten} = tên gọi
// (từ cuối họ tên, vd "Huyền"), {hoten} = họ tên đầy đủ.
const LS_ZALO_GREETING = 'crm_zalo_greeting';
const ZALO_GREETING_DEFAULT =
  'Em chào anh/chị {ten} ạ! Em là tư vấn viên dự án nhà ở xã hội. Em xin phép kết bạn ' +
  'để gửi thông tin căn hộ phù hợp tới mình ạ. Em cảm ơn!';
function getZaloGreeting() {
  try { const v = localStorage.getItem(LS_ZALO_GREETING); return v == null ? ZALO_GREETING_DEFAULT : v; }
  catch { return ZALO_GREETING_DEFAULT; }
}
function setZaloGreeting(text) {
  try { localStorage.setItem(LS_ZALO_GREETING, text); } catch { /* ignore */ } // cache local (offline-first)
  CRM.saveZaloGreetingRemote(text); // đẩy lên Supabase để đồng bộ đa thiết bị (offline thì bỏ qua)
}
// Đồng bộ lời chào từ server (gọi sau đăng nhập): server có → lấy về; server chưa có → seed từ local.
async function syncZaloGreeting() {
  try {
    const remote = await CRM.getZaloGreetingRemote();
    if (remote === undefined) return;                    // offline/lỗi → giữ local
    if (typeof remote === 'string') {
      try { localStorage.setItem(LS_ZALO_GREETING, remote); } catch { /* ignore */ }
    } else {
      CRM.saveZaloGreetingRemote(getZaloGreeting());     // server chưa có → đẩy local lên (seed lần đầu)
    }
  } catch (e) { console.warn('syncZaloGreeting lỗi:', e); }
}
// ---- MẪU TIN ZALO (nhiều mẫu theo tình huống) — mặc định + gợi ý ở js/followup.js ----
// Lưu local (offline-first) + cột user_settings.zalo_templates (SQL/add_zalo_templates.sql) để
// đồng bộ Mac ↔ Android. Mẫu 'chao' LUÔN dùng chung "Lời chào Zalo" cũ (cột zalo_greeting) để
// app bản cũ vẫn khớp. Mẫu [{id, name, text}]; id bắt đầu 'u_' = mẫu sale tự thêm.
const LS_ZALO_TEMPLATES = 'crm_zalo_templates';
function defaultZaloTemplates() {
  return (window.FOLLOWUP ? FOLLOWUP.templatesDefault : [{ id: 'chao', name: 'Chào kết bạn', text: ZALO_GREETING_DEFAULT }]).map((t) => ({ ...t }));
}
function getZaloTemplates() {
  let list = null;
  try { list = JSON.parse(localStorage.getItem(LS_ZALO_TEMPLATES) || 'null'); } catch { list = null; }
  if (!Array.isArray(list) || !list.length) list = defaultZaloTemplates();
  return list.map((t) => (t.id === 'chao' ? { ...t, text: getZaloGreeting() } : t));
}
function setZaloTemplates(list) {
  const store = list.map(({ id, name, text }) => ({ id, name, text }));
  const chao = store.find((t) => t.id === 'chao');
  if (chao) setZaloGreeting(chao.text);
  try { localStorage.setItem(LS_ZALO_TEMPLATES, JSON.stringify(store)); } catch { /* ignore */ }
  CRM.saveZaloTemplatesRemote(store); // cột chưa có (chưa chạy SQL) → chỉ lưu trên máy này
}
// Đồng bộ mẫu từ server (sau đăng nhập): server có → lấy về; server trống mà máy có → đẩy lên.
async function syncZaloTemplates() {
  try {
    const remote = await CRM.getZaloTemplatesRemote();
    if (remote === undefined) return;
    if (Array.isArray(remote) && remote.length) {
      try { localStorage.setItem(LS_ZALO_TEMPLATES, JSON.stringify(remote)); } catch { /* ignore */ }
    } else if (localStorage.getItem(LS_ZALO_TEMPLATES)) {
      CRM.saveZaloTemplatesRemote(JSON.parse(localStorage.getItem(LS_ZALO_TEMPLATES)));
    }
  } catch (e) { console.warn('syncZaloTemplates lỗi:', e); }
}
function fillGreeting(tpl, c) {
  const full = ((c && c.full_name) || '').trim();
  const given = full ? full.split(/\s+/).pop() : '';
  // Xưng hô theo giới tính: Nam→"anh", Nữ→"chị", khác/chưa rõ→giữ "anh/chị".
  const g = ((c && c.gender) || '').toLowerCase();
  const sal = g === 'nam' ? 'anh' : (g === 'nữ' ? 'chị' : 'anh/chị');
  const salCap = sal.charAt(0).toUpperCase() + sal.slice(1);
  return String(tpl || '')
    .replace(/\{ten\}/gi, given || full)
    .replace(/\{hoten\}/gi, full)
    .replace(/\{du_an\}/gi, (c && Array.isArray(c.projects) && c.projects.length) ? c.projects.join(', ') : 'bên em')
    .replace(/\{anhchi\}/gi, sal)
    .replace(/Anh\/Chị/g, salCap)   // "Anh/Chị" (đầu câu) → "Anh"/"Chị"
    .replace(/anh\/chị/gi, sal);    // "anh/chị" → "anh"/"chị"
}

// Copy text vào clipboard (có fallback execCommand cho ngữ cảnh không có Clipboard API).
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); }
    catch { fallbackCopy(text); }
  } else { fallbackCopy(text); }
  return Promise.resolve();
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  } catch { /* ignore */ }
}

// Toast nhỏ ở đáy màn hình (tự ẩn sau ~2.6s).
let _toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) { el = document.createElement('div'); el.id = 'app-toast'; el.className = 'app-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  // ép reflow để add lại class 'show' luôn chạy transition
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Chuẩn hoá SĐT về chuỗi chỉ chữ số, đưa +84/84 về dạng "0..." để khớp với thói
// quen gõ số bắt đầu bằng 0 (vd "+84901234567" và "84901234567" đều thành
// "0901234567"). Chỉ đổi khi đủ 11+ chữ số dạng 84... để không đụng số nội địa.
function phoneDigits(p) {
  let d = (p || '').replace(/\D/g, '');
  if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
  return d;
}

// Tìm SĐT theo vị trí bất kỳ, có ưu tiên theo độ dài:
// - Khớp TỪ ĐẦU (prefix): chỉ cần 1 số đã ra (gõ "0", "01", "012"... đều ra).
// - Khớp Ở GIỮA/CUỐI: phải từ 3 số trở lên mới ra ("123", "678", "6789" ra;
//   nhưng "23", "2" không ra) — tránh việc gõ 1-2 số ở giữa làm ra quá nhiều kết quả.
function phoneMatch(phoneDig, qDig) {
  if (!phoneDig || !qDig) return false;
  if (phoneDig.startsWith(qDig)) return true;
  return qDig.length >= 3 && phoneDig.includes(qDig);
}

// UNIVERSAL SEARCH: gom TẤT CẢ giá trị tìm được của 1 khách thành 1 chuỗi đã bỏ
// dấu, để gõ chuỗi bất kỳ ra khách có chuỗi đó ở BẤT KỲ trường nào — ghi chú tay,
// note của từng bậc chăm sóc ("lăn tăn giá"), loại căn ("2N-2WC" → gõ "2n"), dự án,
// mệnh, nghề, nơi ở... Cache theo `updated_at` qua WeakMap (không đụng vào object gốc,
// tránh lỡ đẩy field "_" xuống DB) để không phải bỏ dấu lại toàn bộ mỗi lần gõ phím;
// mọi chỉnh sửa khách đều bump `updated_at` nên cache tự mới lại đúng lúc.
const _searchBlobCache = new WeakMap();
// Các trường được TÌM (kèm nhãn) — dùng chung cho lọc (customerSearchBlob) và đoạn trích
// tô đậm từ khoá ở trang kết quả (searchSnippets). Thêm trường tìm mới = thêm vào đây.
function searchFields(c) {
  const f = [
    ['Tên', c.full_name], ['SĐT', c.phone],
    ['Giới tính', c.gender], ['Ngày sinh', c.dob ? formatDob(c.dob) : ''], ['Ngày sinh', c.dob],
    ['Mệnh', c.menh], ['Cung', c.cung], ['Hôn nhân', c.marital_status], ['Công việc', c.occupation],
    ['Thu nhập', c.income], ['Thường trú', c.residence],
    ['Dự án', Array.isArray(c.projects) ? c.projects.join(', ') : ''],
    ['Loại căn', c.apt_type], ['Mã căn', c.apt_code], ['Mã toà', c.building_code],
    ['Diện tích', c.apt_area != null ? String(c.apt_area).replace('.', ',') + ' m²' : ''],
    ['Hướng', c.apt_direction], ['Tầng', c.apt_floor],
    ['Giá căn', c.apt_price ? formatPrice(c.apt_price) : ''], ['Giá căn', c.apt_price != null ? String(c.apt_price) : ''],
    ['Vốn sẵn có', c.finance != null ? String(c.finance) : ''], ['Mục đích', c.purpose],
    ['Tiến độ', careLabel(c.care_stage)], ['Tiến độ', c.care_stage], ['Liên lạc', c.contact_status],
    ['Quan tâm', isQualified(c) && c.interest_level != null ? c.interest_level + '%' : ''], // lead: chưa đánh giá
    ['Kênh', sourceDisplay(c.source)], ['Chiến dịch', campaignOf(c)],
    ['Thông tin đăng ký', c.notes],
    ['Lý do loại', c.disqualified_at ? [dropReasonLabel(c.disqualify_reason), c.disqualify_note].filter(Boolean).join(' — ') : ''],
  ];
  for (const n of (Array.isArray(c.notes_manual) ? c.notes_manual : [])) f.push(['Ghi chú', n && n.text]);
  for (const h of (Array.isArray(c.care_stage_history) ? c.care_stage_history : [])) f.push(['Lịch sử chăm sóc', h && h.note]);
  for (const a of (Array.isArray(c.call_attempts) ? c.call_attempts : [])) f.push(['Cuộc gọi', a && a.note]);
  for (const t of (Array.isArray(c.next_tasks) ? c.next_tasks : [])) f.push(['Việc tiếp theo', t && t.text]);
  return f.filter(([, v]) => v != null && String(v).trim() !== '').map(([label, v]) => [label, String(v)]);
}
function customerSearchDoc(c) {
  const cached = _searchBlobCache.get(c);
  if (cached && cached.key === (c.updated_at || '')) return cached.doc;
  const doc = CRMSearch.prepare(searchFields(c));
  _searchBlobCache.set(c, { key: c.updated_at || '', doc });
  return doc;
}
// Prepare normalized fields in short idle slices instead of one blocking first query.
let _searchWarmGeneration = 0;
function scheduleSearchWarmup() {
  const generation = ++_searchWarmGeneration, records = allCustomers;
  let index = 0;
  const schedule = window.requestIdleCallback
    ? (fn) => requestIdleCallback(fn, {timeout:500}) : (fn) => setTimeout(fn, 16);
  function slice() {
    if (generation !== _searchWarmGeneration || records !== allCustomers) return;
    const started = performance.now();
    do { customerSearchDoc(records[index++]); }
    while (index < records.length && performance.now() - started < 4);
    if (index < records.length) schedule(slice);
  }
  if (records.length) schedule(slice);
}
function customerSearchBlob(c) { return customerSearchDoc(c).fields.map((f) => f.norm).join('\0'); }
function customerSearchResult(c, ctx = searchCtx()) {
  if (!ctx) return { match: true, score: 0, fuzzy: false, highlights: [] };
  if (!ctx.results) ctx.results = new WeakMap();
  if (!ctx.results.has(c)) ctx.results.set(c, CRMSearch.match(customerSearchDoc(c), ctx));
  return ctx.results.get(c);
}
function searchOrder(a, b, ctx = searchCtx()) {
  if (!ctx) return 0;
  const x = customerSearchResult(a, ctx), y = customerSearchResult(b, ctx);
  return Number(x.fuzzy) - Number(y.fuzzy) || y.score - x.score;
}

// ---- Tô đậm từ khoá (không phân biệt dấu/hoa thường), kiểu đoạn trích Google ----
// Chuẩn hoá TỪNG KÝ TỰ để giữ ánh xạ vị trí chuỗi chuẩn hoá → chuỗi gốc.
function highlightHtml(text, q, maxLen = 0) { return CRMSearch.highlight(text, q, maxLen); }
function searchSnippets(c, ctx, limit = 2) {
  if (!ctx) return [];
  if (typeof ctx === 'string') ctx = CRMSearch.compile(ctx);
  const terms = customerSearchResult(c, ctx).highlights;
  const seen = new Set(), out = [];
  for (const f of customerSearchDoc(c).fields) {
    if (f.label === 'Tên' || f.label === 'SĐT' || seen.has(f.label)) continue;
    if (!terms.some((q) => f.norm.includes(q))) continue;
    seen.add(f.label);
    out.push(`<span class="snip-label">${escapeHtml(f.label)}:</span> ${highlightHtml(f.value, terms, 90)}`);
    if (out.length >= limit) break;
  }
  return out;
}
let _queryContext = null;
function searchCtx() {
  const raw = $('#search-input').value.trim(), scope = 'all';
  const key = scope + '\0' + raw;
  if (_queryContext?.key === key) return _queryContext.ctx;
  const ctx = CRMSearch.compile(raw, scope);
  if (!ctx.active) { _queryContext = { key, ctx: null }; return null; }
  Object.assign(ctx, { qNorm: ctx.text, isPhone: ctx.phoneOnly, qPhone: ctx.digits, results: new WeakMap() });
  _queryContext = { key, ctx }; return ctx;
}
function hlName(c, ctx) {
  const name = c.full_name || '(chưa có tên)', result = customerSearchResult(c, ctx);
  return (ctx && !ctx.isPhone ? highlightHtml(name, result.highlights) : escapeHtml(name)) +
    (result.fuzzy ? '<span class="search-fuzzy">Gần đúng</span>' : '');
}
function hlPhone(c, ctx) {
  const p = ctx?.isPhone ? CRMSearch.phone(c.phone) : c.phone || '';
  return ctx && ctx.isPhone ? highlightHtml(p, ctx.qPhone) : escapeHtml(p);
}
function snipsHtml(c, ctx, cls, limit = 2) {
  if (!ctx || ctx.isPhone) return '';
  return searchSnippets(c, ctx, limit).map((h) => `<span class="${cls}">${h}</span>`).join('');
}
function matchesSearch(c, ctx = searchCtx()) { return customerSearchResult(c, ctx).match; }
const SEARCH_PAGE_SIZE = 50;
let searchPages = { list: 1, leads: 1, qualified: 1, new: 1, team: 1 };
function resetSearchPages() { searchPages = { list: 1, leads: 1, qualified: 1, new: 1, team: 1 }; }
function renderSearchView() {
  if (!$('#dashboard-view').hidden) renderDashboard();
  else if (!$('#lead-view').hidden) renderLeads();
  else if (!$('#list-view').hidden) renderList();
}
function clearAccountView() {
  clearInterval(accountSyncTimer); accountSyncTimer = null;
  CRM.suspend(); Catalog.scope(null); if (window.CatalogSearchUI) CatalogSearchUI.reset();
  allCustomers = []; resetTeamState(); custGroup = 'care'; _searchWarmGeneration++; _queryContext = null; resetSearchPages();
  progressFilter = 'active'; stageFilter = ''; aptTypeFilter = ''; dateFilter = {preset:'all',from:null,to:null};
  leadFilter = 'open'; leadSrcFilter = ''; leadDatePreset = 'all'; leadAptTypeFilter = '';
  $('#filter-min-interest').value = 0; $('#filter-interest-val').textContent = '0';
  $('#search-input').value = '';
  for (const id of ['customer-list', 'lead-list', 'dash-search', 'dashboard-content', 'detail-notes', 'detail-history', 'cat-body']) {
    const el = document.getElementById(id); if (el) el.replaceChildren();
  }
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}

let _listFilterContext = null;
function matchesFilters(c) {
  // Trang chủ CHỈ hiện khách lớp 2 (đã xác nhận quan tâm). Lead ở tab "Khách mới".
  // Đang chăm: khách lớp 2 MÌNH phụ trách. Khách nhóm: khách đồng nghiệp phụ trách (cả 2 lớp), lọc theo người.
  if (custGroup === 'team') { if (isMine(c) || !matchesTeamPerson(c)) return false; }
  else if (!isQualified(c) || !isMine(c)) return false;
  if (!matchesSearch(c, _listFilterContext?.ctx)) return false;
  if (aptTypeFilter && (CRMSearch.apartmentGroup(c.apt_type) || 'missing') !== aptTypeFilter) return false;
  const stage = stageFilter;
  if (stage) {
    // Chọn 1 bậc cụ thể → lọc đúng bậc đó, bỏ qua lọc trạng thái xong/chưa xong.
    if (c.care_stage !== stage) return false;
  } else {
    // Không chọn bậc cụ thể → áp bộ lọc trạng thái (mặc định chỉ hiện "đang chăm sóc").
    const progress = progressFilter; // 'active' | 'done' | 'all' (dropdown tuỳ biến)
    const done = isCareDone(c.care_stage);
    if (progress === 'active' && done) return false;
    if (progress === 'done' && !done) return false;
  }
  const minInterest = _listFilterContext?.minInterest ?? Number($('#filter-min-interest').value || 0);
  if ((c.interest_level || 0) < minInterest) return false;
  // Lọc theo thời gian đăng ký (registered_at, fallback created_at).
  const range = _listFilterContext ? _listFilterContext.range : dateFilterRange();
  if (range) {
    const t = Date.parse(c.registered_at || c.created_at || '');
    if (isNaN(t) || t < range.start || t >= range.end) return false;
  }
  return true;
}

// So sánh 1 tiêu chí (chưa nhân hướng): trả về a-b.
function sortCompareOne(key, a, b) {
  if (key === 'care') return careSortRank(a.care_stage) - careSortRank(b.care_stage);
  if (key === 'interest') return (a.interest_level || 0) - (b.interest_level || 0);
  if (key === 'updated') return cardUpdatedAt(a).localeCompare(cardUpdatedAt(b));
  if (key === 'name') return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
  return 0;
}
function sortCustomers(list) {
  const arr = [...list];
  // Không chọn tiêu chí nào → dùng mặc định để danh sách luôn có thứ tự hợp lý.
  const keys = (currentSort && currentSort.length) ? currentSort : DEFAULT_SORT;
  const ctx = searchCtx();
  arr.sort((a, b) => {
    const relevance = searchOrder(a, b, ctx); if (relevance) return relevance;
    for (const { key, dir } of keys) {
      const d = sortCompareOne(key, a, b);
      if (d !== 0) return (dir === 'asc' ? 1 : -1) * d;
    }
    return 0;
  });
  return arr;
}

// Danh sách khách ĐANG HIỂN THỊ = lọc + sắp xếp hiện tại, kèm ĐẨY nhắc-gọi lên đầu.
// Dùng chung cho renderList và Export (xuất đúng thứ tự đang thấy).
function visibleCustomers() {
  _listFilterContext = { ctx: searchCtx(), minInterest: Number($('#filter-min-interest').value || 0), range: dateFilterRange() };
  let list; try { list = sortCustomers(allCustomers.filter(matchesFilters)); } finally { _listFilterContext = null; }
  const reminders = new Map();
  for (const c of list) { const r = isMine(c) && callReminder(c); if (r) reminders.set(c.id, r); } // chỉ nhắc khách mình phụ trách
  if (reminders.size && !searchCtx()) {
    const withR = [], without = [];
    for (const c of list) (reminders.has(c.id) ? withR : without).push(c);
    withR.sort((a, b) => reminders.get(a.id).sort - reminders.get(b.id).sort);
    list = [...withR, ...without];
  }
  return list;
}

let _emptyStateText = null; // chữ gốc của #empty-state (nhóm Đang chăm)
function renderList() {
  if (_emptyStateText === null) _emptyStateText = $('#empty-state').textContent;
  if ($('#list-view').hidden) return;
  const fullList = visibleCustomers(), list = fullList.slice(0, searchPages.list * SEARCH_PAGE_SIZE);
  // Map nhắc-gọi để hiển thị nhãn trên card/dòng (danh sách đã được đẩy nhắc-gọi lên đầu).
  const reminders = new Map();
  for (const c of list) { const r = isMine(c) && callReminder(c); if (r) reminders.set(c.id, r); } // chỉ nhắc khách mình phụ trách
  const container = $('#customer-list');
  const ctx = searchCtx(); // đang tìm → tô đậm từ khoá + đoạn trích trường khớp
  container.innerHTML = '';
  container.classList.toggle('list-mode', viewMode === 'list');
  $('#empty-state').hidden = list.length !== 0;
  const groupLabel = custGroup === 'team' ? 'Khách nhóm' + (ownerScopeLabel() ? ' · ' + ownerScopeLabel() : '') : 'Đang chăm';
  $('#result-count').textContent = `${fullList.length} khách hàng · ${groupLabel}${searchCtx() ? ' · theo độ liên quan' : ''}`;
  $('#empty-state').textContent = custGroup === 'team'
    ? (hasTeam() ? 'Chưa có khách nào giao cho đồng nghiệp. Mở hồ sơ khách → 👥 Giao khách.' : 'Chưa có nhóm — trưởng nhóm thêm đồng nghiệp ở menu avatar → Đồng nghiệp.')
    : _emptyStateText;
  $('#list-search-more').hidden = list.length >= fullList.length;
  $('#list-search-more').textContent = `Xem thêm (${fullList.length - list.length} khách)`;
  updateFilterDot(); // giữ chấm đỏ + nút "Xoá lọc ✕" luôn khớp trạng thái lọc

  // Kiểu DÒNG GỌN (list view): LUÔN 1 hàng — [Tên đầy đủ] ... [SĐT …xxxxx + loại căn +
  // thẻ mức quan tâm]. KHÔNG có nút gọi/Zalo (bấm vào dòng → trang chi tiết mới thao tác).
  // Số ĐT hiển thị bao nhiêu số CUỐI là do fitListRow tính theo chỗ trống (nhiều chỗ = nhiều
  // số), ưu tiên tên đầy đủ trước. Field null → bỏ hẳn. Handler click #customer-list khớp .cust-row.
  if (viewMode === 'list') {
    for (const c of list) {
      const row = document.createElement('div');
      row.className = 'cust-row'; row.tabIndex = 0; row.setAttribute('role', 'button');
      row.dataset.id = c.id;
      const digits = (c.phone || '').replace(/\D/g, '');
      // data-digits = toàn bộ số; fitListRow chọn hiển thị bao nhiêu số cuối cho vừa.
      const phoneHtml = digits ? `<span class="row-phone-num" data-digits="${escapeHtml(digits)}">${escapeHtml(digits)}</span>` : '';
      const aptHtml = c.apt_type ? `<span class="row-apt">${escapeHtml(canonicalAptType(c.apt_type))}</span>` : '';
      // Thẻ mức quan tâm: nhãn bậc (Nguội/Ấm/Nóng/Rất nóng) — dùng chung style thẻ trên card.
      let interestHtml = '';
      if (c.interest_level != null) {
        const tier = interestTier(c.interest_level);
        interestHtml = `<span class="tag tag-interest ti-${tier.key}"><span class="ti-dot">◆</span> ${escapeHtml(tier.label)}</span>`;
      }
      // Chỉ báo NHẮC GỌI (cùng rule/màu như card) — cho thấy vì sao khách này bị đẩy lên đầu.
      // Chỉ là nhãn (không phải nút; bấm dòng vẫn mở chi tiết).
      const rem = reminders.get(c.id);
      const callHtml = rem ? `<span class="row-call call-${rem.state}">${escapeHtml(rem.text)}</span>` : '';
      const snip = snipsHtml(c, ctx, 'row-snip', 1);
      if (ctx && ctx.isPhone) row.dataset.hlPhone = ctx.qPhone; // fitListRow tô lại sau khi cắt số
      row.innerHTML = `
        <div class="row-name">${hlName(c, ctx)}</div>
        <div class="row-right">${ownerTagHtml(c)}${callHtml}${phoneHtml}${aptHtml}${interestHtml}</div>${snip}`;
      container.appendChild(row);
    }
    refitListRows(); // chọn số digits ĐT (và cắt tên nếu cùng cực) cho vừa 1 hàng
    return;
  }

  for (const c of list) {
    const card = document.createElement('div');
    card.className = 'customer-card'; card.tabIndex = 0;
    card.dataset.id = c.id; // để bấm vào thân card mở xem/sửa đầy đủ
    if (c.care_stage === CARE_STAGE_DROPPED) card.classList.add('is-dropped'); // khách bị Loại → mờ đi
    // Viền trái card = màu bậc mức quan tâm (Nguội/Ấm/Nóng/Rất nóng).
    const tier = interestTier(c.interest_level ?? 0);
    card.style.setProperty('--tier', tier.color);

    // Tiến độ chăm sóc → GỘP thành 1 pill nền tint theo màu bậc: vòng tròn nhỏ (đĩa
    // conic đầy theo % bậc) + "x/7" + tên bậc. Riêng bậc 'Loại' → pill đỏ nhạt
    // "✕ Loại" (không phải bước phễu nên không có vòng tiến độ).
    const isDropped = c.care_stage === CARE_STAGE_DROPPED;
    const level = careLevel(c.care_stage);
    const ringPct = Math.round((level / 7) * 100);
    const ringColor = careColor(c.care_stage);
    const stagePill = isDropped
      ? `<span class="stage-pill is-dropped" title="${escapeHtml(careLabel(c.care_stage))}"><span class="sp-xmark">✕</span><span class="sp-name">${escapeHtml(careLabel(c.care_stage))}</span></span>`
      : `<span class="stage-pill" style="--ring:${ringColor}; --pct:${ringPct}" title="${escapeHtml(careLabel(c.care_stage))}"><span class="sp-ring"></span><span class="sp-frac">${level}/7</span><span class="sp-name">${escapeHtml(careLabel(c.care_stage))}</span></span>`;
    // Timestamp "Cập nhật" = hoạt động care timeline mới nhất (đổi bậc HOẶC ghi/sửa note).
    // Dùng chung với sắp xếp (cardUpdatedAt) → thứ tự card khớp con số hiển thị.
    const updated = timeAgo(cardUpdatedAt(c));
    const menhShort = c.menh ? c.menh.split(' — ')[0] : ''; // "Mệnh Kim" (bỏ nạp âm dài phía sau)
    const cung = cungOf(c); // Cung (fallback tính từ dob nếu chưa lưu)
    // Link Zalo: web (http) mở tab mới; app native (zalo://) mở app tại chỗ, không target.
    const zaloHref = zaloLink(c.phone);
    const zaloAttr = zaloHref.startsWith('http') ? 'target="_blank" rel="noopener"' : '';
    // Ghi chú trên card: note TỰ ĐỘNG (từ care stage mới nhất) lên đầu, rồi note tự nhập.
    // Cắt còn 2 dòng bằng CSS (.card-notes line-clamp). Cũ ở dưới, mới ở trên.
    const autoNote = autoNoteFromHistory(c.care_stage_history);
    // Mới nhất lên trên (tạo sau = cập nhật hơn).
    const manualNotes = (Array.isArray(c.notes_manual) ? [...c.notes_manual] : [])
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    const noteLines = [];
    if (autoNote) noteLines.push(`<span class="note-auto">• ${escapeHtml(autoNote)}</span>`);
    for (const n of manualNotes) noteLines.push(`• ${escapeHtml(n.text || '')}`);
    const cardNotesInner = noteLines.join('<br>');
    card.innerHTML = `
      <div class="card-top">
        ${cardAvatarMarkup(c)}
        <div class="card-top-main">
          <div class="card-head">
            <div class="card-name">${hlName(c, ctx)}</div>
            <div class="card-head-right">
              ${ownerTagHtml(c)}
              ${reminders.has(c.id) ? `<button class="call-tag call-${reminders.get(c.id).state}" data-calltag="${c.id}">${escapeHtml(reminders.get(c.id).text)}</button>` : ''}
              <div class="card-menu"${isMine(c) ? '' : ' hidden'}>
                <button class="card-menu-btn" data-action="menu" aria-label="Tuỳ chọn khác">⋯</button>
                <div class="card-menu-pop">
                  <button class="menu-item" data-action="schedule" data-id="${c.id}">Hẹn lịch gọi</button>
                </div>
              </div>
            </div>
          </div>
          <div class="phone-row">
            <span class="phone-number">${hlPhone(c, ctx)}</span>
            <a class="card-phone" href="tel:${normalizePhone(c.phone)}" data-call-id="${c.id}" aria-label="Gọi ${escapeHtml(c.phone || '')}">${PHONE_SVG}</a>
            <a class="card-zalo" href="${zaloHref}" ${zaloAttr} data-id="${c.id}" aria-label="Nhắn Zalo">
              <img class="ic-zalo" src="/icons/zalo.png" alt="Zalo" />
            </a>
          </div>
        </div>
      </div>
      <div class="card-progress">
        ${stagePill}
        ${c.care_stage === 'Kí HĐMB' ? '<span class="tag tag-won">✓ Đã chốt</span>' : ''}
        ${c.contact_status ? `<span class="tag tag-contact" style="--cs:${contactColor(c.contact_status)}">${escapeHtml(c.contact_status)}</span>` : ''}
        ${contactLostWarning(c) ? `<span class="tag tag-contact-warn" title="Đã >7 ngày chưa tương tác — kiểm tra lại">⚠ nghi mất liên lạc</span>` : ''}
        <span class="tag tag-interest ti-${tier.key}"><span class="ti-dot">◆</span> ${tier.label}</span>
        ${c.apt_type ? `<span class="tag">${escapeHtml(canonicalAptType(c.apt_type))}</span>` : ''}
        ${menhShort ? `<span class="tag tag-menh">${escapeHtml(menhShort)}</span>` : ''}
        ${cung ? `<span class="tag tag-cung">${escapeHtml(cung)}</span>` : ''}
      </div>
      ${(() => { const sn = snipsHtml(c, ctx, 'card-snip'); return sn ? `<div class="card-snips">${sn}</div>` : ''; })()}
      <div class="card-notes">${cardNotesInner}</div>
      <div class="card-footer">
        <span class="card-updated">${updated ? 'Cập nhật ' + escapeHtml(updated) : ''}</span>
        ${isMine(c) ? `<button class="btn-small" data-action="edit" data-id="${c.id}">Sửa</button>` : ''}
      </div>
    `;
    container.appendChild(card);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ─── LIST VIEW: chọn số DIGITS của SĐT (và cắt tên nếu cùng cực) cho vừa ĐÚNG 1 hàng ───
// Nguyên tắc: ưu tiên TÊN đầy đủ trước. Chỗ còn lại dành cho số ĐT — hiện được BAO NHIÊU
// số cuối thì hiện bấy nhiêu (nhiều chỗ = nhiều số; đủ chỗ thì cả số đầy đủ), dạng "…xxxx"
// khi bị cắt. Chật quá thì số ĐT ẩn hẳn. Nếu ẩn số ĐT rồi mà tên vẫn quá dài → mới cắt "…"
// ở tên. Đo bằng scrollWidth > clientWidth (dòng có overflow:hidden).
function fitListRow(row) {
  const nameEl = row.querySelector('.row-name');
  const phoneNum = row.querySelector('.row-phone-num');
  // Đoạn trích tìm kiếm (dòng 2): tạm bỏ xuống-dòng khi ĐO để hàng 1 vẫn phát hiện tràn đúng.
  const snip = row.querySelector('.row-snip');
  if (snip) { row.classList.remove('has-snip'); snip.hidden = true; }
  if (nameEl) nameEl.classList.remove('truncate'); // reset: tên để nguyên để đo lại
  const overflow = () => row.scrollWidth > row.clientWidth + 1;
  if (phoneNum) {
    const d = phoneNum.dataset.digits || '';
    let shown = false;
    // Thử từ NHIỀU số nhất (đầy đủ) xuống 1 số — lấy mức nhiều nhất còn vừa.
    for (let k = d.length; k >= 1; k--) {
      phoneNum.style.display = '';
      phoneNum.textContent = (k === d.length) ? d : '…' + d.slice(-k); // đủ số → không cần "…"
      if (!overflow()) { shown = true; break; }
    }
    if (!shown) phoneNum.style.display = 'none'; // 1 số vẫn tràn → ẩn hẳn số ĐT
  }
  if (nameEl && overflow()) nameEl.classList.add('truncate'); // cùng lắm mới cắt tên
  // Tìm theo SĐT → tô phần số khớp trong đoạn số đang hiện (đã cắt "…" nếu thiếu chỗ).
  if (phoneNum && row.dataset.hlPhone) {
    const full = phoneNum.dataset.digits || '', q = row.dataset.hlPhone;
    const shown = phoneNum.textContent.replace('…', ''), off = full.length - shown.length;
    const i = full.indexOf(q);
    const a = Math.max(i, off) - off, b = i + q.length - off; // phần khớp còn nằm trong đoạn đang hiện
    if (i >= 0 && b > a) {
      phoneNum.innerHTML = (off > 0 ? '…' : '') + escapeHtml(shown.slice(0, a)) + '<mark>' + escapeHtml(shown.slice(a, b)) + '</mark>' + escapeHtml(shown.slice(b));
    }
  }
  if (snip) { snip.hidden = false; row.classList.add('has-snip'); }
}
function refitListRows() {
  if (viewMode !== 'list') return;
  $$('#customer-list .cust-row').forEach(fitListRow);
}
// Đổi bề rộng cửa sổ (xoay ngang/thu cửa sổ trên Mac) → co lại cho khớp.
let _refitTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_refitTimer);
  _refitTimer = setTimeout(refitListRows, 120);
});

$('#customer-list')?.addEventListener('click', (e) => {
  const card = e.target.closest('.customer-card, .cust-row');
  const menuBtn = e.target.closest('.card-menu-btn');
  // Đóng mọi menu đang mở (trừ menu của card vừa bấm nút "⋯")
  $$('.customer-card.menu-open').forEach((el) => {
    if (!(menuBtn && el === card)) el.classList.remove('menu-open');
  });
  if (menuBtn) { card.classList.toggle('menu-open'); return; }

  // Bấm tag nhắc gọi → popup xác nhận gọi (không mở trang chi tiết)
  const callTag = e.target.closest('[data-calltag]');
  if (callTag) { openCallAction(callTag.dataset.calltag); return; }

  const btn = e.target.closest('button[data-action]');
  if (btn) {
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') openForm(id);
    // Hẹn lịch gọi: đóng menu "⋯" rồi mở helper hẹn lịch (cùng modal ở trang chi tiết).
    if (btn.dataset.action === 'schedule') { card?.classList.remove('menu-open'); openScheduler(id); }
    return;
  }
  // Bấm vào link SĐT → để nó mở Zalo/gọi bình thường, không mở trang chi tiết
  if (e.target.closest('a')) return;
  // Bấm vào chỗ trống còn lại của card → mở trang chi tiết khách
  if (card?.dataset.id) openDetail(card.dataset.id);
});

// Bấm ra ngoài card → đóng menu "⋯" đang mở
document.addEventListener('click', (e) => {
  if (!e.target.closest('.customer-card')) {
    $$('.customer-card.menu-open').forEach((el) => el.classList.remove('menu-open'));
  }
});

// Bấm icon Zalo (card / trang chi tiết / Tổng quan) → hộp: nút "Mở Zalo" lớn ở trên (dùng nhiều
// nhất) + danh sách mẫu tin (mẫu hợp tình huống lên đầu, gắn "Gợi ý" + lý do). Chọn 1 mẫu → COPY
// nội dung đã điền tên rồi mở Zalo để DÁN. Hai đường mở Zalo dùng CHUNG openZaloFor() — link tính
// lại từ SĐT khách lúc bấm. Không có mẫu nào (đều trống) → để link mở Zalo bình thường.
let zpickCustomer = null;
document.addEventListener('click', (e) => {
  const zaloEl = e.target.closest('#detail-zalo-btn, .card-zalo');
  if (!zaloEl) return;
  const id = zaloEl.dataset.id || detailId;
  const c = id ? allCustomers.find((x) => x.id === id) : null;
  const tpls = getZaloTemplates().filter((t) => (t.text || '').trim());
  if (!c || !tpls.length) return;
  e.preventDefault();
  zpickCustomer = c;
  // Chỉ 1 mẫu gợi ý (tối đa 2 khi có thêm tình huống rõ ràng — js/followup.js). Các mẫu khác ẩn
  // sau "Chọn mẫu khác" để hộp gọn, nút Mở Zalo luôn là thứ nổi bật nhất.
  const sugs = (window.FOLLOWUP ? FOLLOWUP.suggestTemplates(c) : [{ id: 'chao', why: '' }])
    .filter((x) => tpls.some((t) => t.id === x.id));
  const sugIds = sugs.map((x) => x.id);
  const others = tpls.filter((t) => !sugIds.includes(t.id));
  const item = (t, why) => `<button type="button" class="zpick-item${why != null ? ' is-sug' : ''}" data-tpl="${escapeHtml(t.id)}">
      <span class="zpick-name">${escapeHtml(t.name || 'Mẫu')}</span>
      ${why ? `<span class="zpick-why">${escapeHtml(why)}</span>` : ''}
      <span class="zpick-text">${escapeHtml(fillGreeting(t.text, c))}</span>
    </button>`;
  $('#zpick-title').textContent = c.full_name || 'Nhắn Zalo';
  $('#zpick-sub').textContent = [c.phone, isQualified(c) ? careLabel(c.care_stage) : 'Khách mới'].filter(Boolean).join(' · ');
  $('#zpick-sep').hidden = !sugs.length;
  $('#zpick-list').innerHTML = sugs.map((x) => item(tpls.find((t) => t.id === x.id), x.why || '')).join('');
  $('#zpick-more').hidden = !others.length;
  $('#zpick-more').textContent = `Chọn mẫu khác (${others.length})`;
  $('#zpick-others').hidden = true;
  $('#zpick-others').innerHTML = others.map((t) => item(t, null)).join('');
  $('#zalo-pick-modal').showModal();
});
// Mở chat Zalo của khách. Android chạy trên TRÌNH DUYỆT / app cài từ Chrome (PWA): window.open
// zalo.me mở 1 tab trình duyệt (Custom Tab) rồi mới chuyển sang app Zalo — lúc được lúc không, có
// khi kẹt ở trang zalo.me báo "Trang này không tìm thấy". → Dùng intent:// chỉ đích danh app Zalo
// (package com.zing.zalo) để Chrome mở THẲNG app; máy chưa cài Zalo → tự rơi về trang zalo.me.
// Vỏ Android (Capacitor) không hiểu intent:// → giữ link https (vỏ tự giao cho app Zalo).
function isCapacitorShell() {
  return !!(window.Capacitor && (typeof window.Capacitor.isNativePlatform === 'function' ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative));
}
function openZaloFor(c) {
  const href = c && c.phone ? zaloLink(c.phone) : '';
  if (!href) return;
  if (!href.startsWith('http')) { window.location.href = href; return; } // Mac: zalo:// mở app tại chỗ
  if (/Android/i.test(navigator.userAgent || '') && !isCapacitorShell()) {
    const path = href.replace(/^https:\/\//, '');
    window.location.href = `intent://${path}#Intent;scheme=https;package=com.zing.zalo;S.browser_fallback_url=${encodeURIComponent(href)};end`;
    return;
  }
  window.open(href, '_blank', 'noopener');
}
$('#zpick-more')?.addEventListener('click', () => { $('#zpick-others').hidden = false; $('#zpick-more').hidden = true; });
$('#zalo-pick-modal')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tpl]'); if (!b || !zpickCustomer) return;
  const t = getZaloTemplates().find((x) => x.id === b.dataset.tpl); if (!t) return;
  copyText(fillGreeting(t.text, zpickCustomer)); // copy TRONG cử chỉ click (không await)
  showToast(`Đã copy "${t.name}" — dán vào Zalo`);
  $('#zalo-pick-modal').close();
  openZaloFor(zpickCustomer);
});
// "Mở Zalo": copy kèm SĐT khách. Lý do: app Zalo trên Android (nhất là lúc Zalo đang tắt hẳn)
// đôi khi KHÔNG nhận ra link zalo.me/<SĐT> mà mở nó trong trình duyệt nội bộ → "Trang này không
// tìm thấy" — lỗi phía Zalo, CRM không chặn được. Có sẵn SĐT trong clipboard → dán vào ô tìm Zalo.
$('#zpick-plain')?.addEventListener('click', () => {
  const c = zpickCustomer;
  const phone = c && c.phone ? normalizePhone(c.phone).replace(/^\+?84/, '0') : '';
  if (phone) { copyText(phone); showToast(`Đã copy SĐT ${phone} — nếu Zalo báo lỗi, dán vào ô tìm kiếm Zalo`); }
  $('#zalo-pick-modal').close();
  openZaloFor(c);
});
$('#zpick-close')?.addEventListener('click', () => $('#zalo-pick-modal').close());

// ---- Đổi kiểu xem danh sách: thẻ (card) ⇄ dòng gọn (list) ----
// Nút hiện ICON của kiểu SẼ chuyển sang (bấm để đổi), lựa chọn lưu vào localStorage.
const VIEW_ICON_LIST = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z"/></svg>';
const VIEW_ICON_CARD = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h16v6H4zM4 14h16v6H4z"/></svg>';
function updateViewToggleBtn() {
  const btn = $('#view-toggle');
  if (!btn) return;
  const toList = viewMode === 'card';
  const label = toList ? 'Xem dạng danh sách' : 'Xem dạng thẻ';
  btn.innerHTML = toList ? VIEW_ICON_LIST : VIEW_ICON_CARD;
  btn.setAttribute('data-tip', label);      // tooltip hover (tuỳ biến)
  btn.setAttribute('aria-label', label);
  btn.removeAttribute('title');             // tránh tooltip native trùng
}
function setViewMode(mode) {
  viewMode = (mode === 'list') ? 'list' : 'card';
  try { localStorage.setItem(LS_VIEW_MODE, viewMode); } catch {}
  updateViewToggleBtn();
  renderList();
}
$('#view-toggle')?.addEventListener('click', () => setViewMode(viewMode === 'card' ? 'list' : 'card'));
updateViewToggleBtn(); // đặt icon đúng theo lựa chọn đã lưu ngay khi tải

// --------------------------------------------------------- DỰ ÁN ----------

// Danh sách dự án = GIỎ HÀNG (bảng projects, js/catalog.js) — gộp từ project_options cũ
// (SQL/add_catalog_buildings.sql). projectOptions giữ dạng [{id, name}] cho code cũ.
function syncProjectOptions() {
  projectOptions = Catalog.projects().map((p) => ({ id: p.id, name: p.name }));
}
Catalog.onChange(syncProjectOptions);

// Nạp giỏ hàng: online → Supabase + cache; offline → cache (Catalog tự lo).
async function loadProjectOptions() {
  await Catalog.load();
  syncProjectOptions();
}

// Thêm dự án mới (cần online — thao tác hiếm). Trả về true nếu thành công.
async function addProjectOption(name) {
  name = (name || '').trim();
  if (!name) return false;
  try { await Catalog.addProject(name); return true; }
  catch (e) { alert('Thêm dự án lỗi: ' + (e.message || e)); return false; }
}

// Xoá 1 dự án khỏi giỏ hàng (cần online) — xoá luôn toà/căn của dự án đó.
async function removeProjectOption(id) {
  try { await Catalog.deleteProject(id); }
  catch (e) { alert('Xoá dự án lỗi: ' + (e.message || e)); }
}

// Đổi tên dự án → cập nhật luôn các khách đang gắn tên cũ (customers.projects lưu theo TÊN).
async function renameProjectInCustomers(oldName, newName) {
  for (const c of allCustomers) {
    if (Array.isArray(c.projects) && c.projects.includes(oldName)) {
      await CRM.update(c.id, { projects: c.projects.map((n) => (n === oldName ? newName : n)) });
    }
  }
  await refreshList();
}

// Vẽ các chip dự án trong form (chọn nhiều; chế độ Quản lý hiện nút xoá).
// Dropdown chọn nhiều dự án: nút tóm tắt (tên đã chọn) + panel danh sách checkbox.
function renderProjSelect() {
  const btn = $('#proj-dropdown-btn');
  if (btn) btn.textContent = selectedProjects.length ? selectedProjects.join(', ') : '— Chọn dự án —';
  const box = $('#proj-options');
  if (!box) return;
  box.innerHTML = projectOptions.map((o) => {
    const sel = selectedProjects.includes(o.name);
    return `<div class="proj-opt ${sel ? 'is-sel' : ''}">
      <label class="proj-opt-label">
        <input type="checkbox" data-projtoggle="${escapeHtml(o.name)}" ${sel ? 'checked' : ''} />
        <span>${escapeHtml(o.name)}</span>
      </label>
      ${projManageMode ? `<button type="button" class="proj-chip-del" data-projdel="${o.id}" title="Xoá dự án khỏi danh sách">✕</button>` : ''}
    </div>`;
  }).join('') || '<div class="proj-empty">Chưa có dự án nào</div>';
  refreshAptSuggestions(); // đổi dự án → đổi gợi ý mã toà / mã căn
}

// -------------------------------------------------------------- FORM ------

function openForm(id) {
  editingId = id || null;
  const c = id ? allCustomers.find((x) => x.id === id) : {};
  // Header khi sửa: kèm HỌ TÊN ĐÃ LƯU (đọc từ record c — giá trị trước khi sửa),
  // không đổi theo lúc gõ ô Họ tên vì chỉ set 1 lần lúc mở form.
  // Tiêu đề dính đầu form: tên khách đang sửa (giá trị đã lưu, không đổi theo lúc gõ).
  $('#form-title').innerHTML = id
    ? `<span class="form-title-pre">Sửa thông tin</span>${escapeHtml(c.full_name || '(chưa tên)')}`
    : 'Thêm khách mới';

  const f = $('#customer-form');
  f.phone.value = c.phone || '';
  f.full_name.value = c.full_name || '';
  f.gender.value = c.gender || '';
  setDobInput(c.dob); // nạp ngày sinh vào 3 đoạn dd/MM/YYYY + preview Mệnh/Cung
  f.marital_status.value = c.marital_status || '';
  f.occupation.value = c.occupation || '';
  f.income.value = c.income || '';
  f.residence.value = c.residence || '';
  // Thời gian đăng ký: khách cũ dùng registered_at (hoặc created_at); khách mới = giờ hiện tại.
  const reg = c.registered_at ? new Date(c.registered_at) : (c.created_at ? new Date(c.created_at) : new Date());
  f.registered_at.value = toLocalDatetimeInput(reg);
  // Loại căn: chuẩn hoá về dạng chuẩn trước → khớp option có sẵn → chọn; nếu khác → "Khác".
  setFormAptType(c.apt_type || ''); // danh sách sẽ lọc lại theo dự án ở renderProjSelect() bên dưới
  f.apt_code.value = c.apt_code || '';
  f.building_code.value = c.building_code || '';
  f.apt_area.value = c.apt_area || '';
  f.apt_direction.value = c.apt_direction || '';
  f.apt_floor.value = c.apt_floor || '';
  f.apt_price.value = c.apt_price || '';
  f.finance.value = c.finance || '';
  f.purpose.value = c.purpose || '';
  // Hồ sơ Nâng cao: nạp từng field từ c.advanced; luôn GẬP LẠI mỗi lần mở form.
  const adv = (c && c.advanced && typeof c.advanced === 'object') ? c.advanced : {};
  for (const fld of ADVANCED_FIELDS) {
    const el = f.elements['adv_' + fld.key];
    if (el) el.value = adv[fld.key] != null ? adv[fld.key] : '';
  }
  const advDetails = $('#form-advanced'); if (advDetails) advDetails.open = false;
  f.interest_level.value = c.interest_level ?? INTEREST_DEFAULT_NEW;
  updateInterestUI(f.interest_level.value);
  // Khách MỚI mặc định bậc 'Đăng kí mới'; khách cũ giữ bậc đang có.
  f.care_stage.value = c.care_stage || (id ? '' : CARE_STAGE_DEFAULT);
  f.contact_status.value = c.contact_status || '';

  // Nguồn khách: kênh chính (phần tử đầu) + chiến dịch. Khách mới → kênh chọn gần nhất.
  let lastSrc = null; try { lastSrc = localStorage.getItem(LS_LAST_SOURCE); } catch {}
  const srcList = sourceListOf(c.source);
  const primarySrc = srcList[0] || (id ? '' : (SOURCES[lastSrc] ? lastSrc : SOURCE_DEFAULT));
  // Mã kênh lạ (chưa có trong SOURCES) → thêm tạm 1 option để không mất khi lưu.
  const srcSel = f.source_channel;
  srcSel.querySelectorAll('option[data-tmp]').forEach((o) => o.remove());
  if (primarySrc && !SOURCES[primarySrc]) {
    srcSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(primarySrc)}" data-tmp>${escapeHtml(sourceLabel(primarySrc))}</option>`);
  }
  if (!primarySrc) srcSel.insertAdjacentHTML('afterbegin', '<option value="" data-tmp>— Chưa rõ —</option>');
  srcSel.value = primarySrc;
  f.campaign.value = c.campaign || '';
  const camps = [...new Set(allCustomers.map((x) => x.campaign).filter(Boolean))].sort();
  $('#cf-campaign-list').innerHTML = camps.map((x) => `<option value="${escapeHtml(x)}"></option>`).join('');
  // Lớp khách: lead (mới/chưa đạt) → ẩn Tiến độ + Trạng thái liên lạc (lead quản lý ở hộp
  // "Khách mới"). Ô "đưa thẳng vào chăm sóc" chỉ khi TẠO MỚI.
  const isLeadForm = !id || !isQualified(c);
  $('#care-stage-wrap').hidden = isLeadForm;
  $('#contact-status-wrap').hidden = isLeadForm;
  // Mức quan tâm chỉ đánh giá ở lớp Tiềm năng → lead ẩn thanh trượt (lưu mốc 20%). Tạo mới
  // + tick "đưa thẳng vào chăm sóc" thì hiện lại (xem syncInterestVisibility).
  formIsLead = isLeadForm;
  $('#qualify-now-wrap').hidden = !!id;
  f.qualify_now.checked = false;
  syncInterestVisibility();

  // Dự án: khách cũ dùng lịch sử của khách; khách mới lấy lựa chọn gần nhất
  // (localStorage) làm mặc định nếu chưa chủ động set.
  if (id) selectedProjects = Array.isArray(c.projects) ? [...c.projects] : [];
  else { try { selectedProjects = JSON.parse(localStorage.getItem(LS_LAST_PROJECTS) || '[]'); } catch { selectedProjects = []; } }
  // Diện tích đang có = số tự điền? (khớp đúng diện tích điển hình theo dự án/toà/loại căn) → còn
  // chạy theo khi đổi lựa chọn; khác (sửa tay theo căn thực tế) → giữ nguyên.
  areaAuto = false; priceAuto = false;
  { const t = typicalAreaForForm(); if (t && f.apt_area.value && Number(f.apt_area.value) === t.area) areaAuto = true; }
  syncAreaAutoTag();
  projManageMode = false;
  $('#proj-add-row').hidden = true;
  $('#proj-add-btn').hidden = false;
  $('#proj-dropdown-panel').hidden = true; // dropdown thu gọn mỗi lần mở form
  renderProjSelect();

  // Ghi chú: nạp BẢN NHÁP từ ghi chú hiện có (sửa/xoá/thêm chỉ ghi khi bấm Lưu).
  formNotesDraft = (Array.isArray(c.notes_manual) ? c.notes_manual : [])
    .filter((n) => n && n.text).map((n) => ({ text: n.text, at: n.at }));
  formRegNote = c.notes || '';
  renderFormNotes();
  $('#form-note-new').value = '';

  // Ô "Ghi chú cho lần đổi tiến độ" chỉ hiện khi bậc thực sự khác lúc mở form.
  // Với khách mới, bậc mặc định 'Đăng kí mới' chính là bậc gốc (chưa coi là "đổi").
  formOriginalStage = f.care_stage.value || '';
  f.care_stage_note.value = '';
  toggleCareStageNote();

  // Reset trạng thái OCR mỗi lần mở form (ghi chú tạm + ảnh tạm + dòng thông báo + nút thử lại).
  pendingOcrNote = null;
  pendingOcrImage = null;
  lastOcrFile = null;
  const ocrStatus = $('#ocr-status'); if (ocrStatus) ocrStatus.textContent = '';
  const ocrRetry = $('#ocr-retry-btn'); if (ocrRetry) ocrRetry.hidden = true;

  // Nút Xoá khách + mục Tài liệu: chỉ khi SỬA (đã có khách). Khách mới thì ẩn.
  $('#delete-customer-btn').hidden = !id;
  $('#form-docs-section').hidden = !id;
  $('#form-doc-status').textContent = '';
  $('#form-doc-file').value = '';
  if (id) loadFormDocs(id);

  // Nhóm "Mở rộng": luôn GẬP khi mở form; kèm số trường đã có dữ liệu bên trong.
  $$('#customer-form details.form-more').forEach((d) => { d.open = false; updateMoreCount(d); });
  $('#form-modal').showModal();
  $('#customer-form').scrollTop = 0;
}

let formIsLead = false;
function syncInterestVisibility() {
  const f = $('#customer-form');
  const show = !formIsLead || f.qualify_now.checked;
  $('#interest-wrap').hidden = !show;
  // Vừa tick "đưa thẳng vào chăm sóc" → gợi ý luôn mốc 60% (bậc 'Đang chăm sóc').
  if (formIsLead && f.qualify_now.checked && Number(f.interest_level.value) < STAGE_INTEREST[QUALIFIED_STAGE]) {
    f.interest_level.value = STAGE_INTEREST[QUALIFIED_STAGE]; updateInterestUI(f.interest_level.value);
  }
  if (formIsLead && !f.qualify_now.checked) { f.interest_level.value = INTEREST_DEFAULT_NEW; updateInterestUI(f.interest_level.value); }
}
$('#customer-form')?.qualify_now?.addEventListener('change', syncInterestVisibility);

// Đếm trường có giá trị trong 1 nhóm "Mở rộng" → hiện "· 3 đã điền" cạnh nút (biết có dữ liệu ẩn).
function updateMoreCount(det) {
  const n = [...det.querySelectorAll('input:not([type=hidden]):not([hidden]), select')]
    .filter((el) => String(el.value || '').trim() !== '').length;
  const out = det.querySelector('.more-count');
  if (out) out.textContent = n ? ` · ${n} đã điền` : '';
}

// ---- GHI CHÚ trong form (bản nháp) ----
let formNotesDraft = []; // [{text, at}] — mới nhất ở ĐẦU (giống notes_manual)
let formRegNote = '';    // cột notes (vd landing ghi thông tin đăng ký) — sửa được như 1 ghi chú
function renderFormNotes() {
  const rows = [];
  if (formRegNote) {
    rows.push(`<div class="form-note-row">
      <textarea class="form-note-text" data-reg="1" rows="2">${escapeHtml(formRegNote)}</textarea>
      <div class="form-note-meta"><span>Thông tin đăng ký</span><button type="button" class="doc-del" data-note-del="reg" title="Xoá">✕</button></div>
    </div>`);
  }
  formNotesDraft.forEach((n, i) => {
    rows.push(`<div class="form-note-row">
      <textarea class="form-note-text" data-idx="${i}" rows="${Math.min(4, Math.max(1, Math.ceil(n.text.length / 60)))}">${escapeHtml(n.text)}</textarea>
      <div class="form-note-meta"><span>${n.at ? escapeHtml(formatLogTime(n.at)) : 'mới'}</span><button type="button" class="doc-del" data-note-del="${i}" title="Xoá">✕</button></div>
    </div>`);
  });
  $('#form-notes').innerHTML = rows.join('') || '<div class="docs-empty">Chưa có ghi chú.</div>';
}
// Đọc lại nội dung đang gõ trong các ô → bản nháp (gọi trước khi render lại / khi lưu).
function syncFormNotesFromDom() {
  $$('#form-notes .form-note-text').forEach((el) => {
    if (el.dataset.reg) formRegNote = el.value;
    else if (formNotesDraft[+el.dataset.idx]) formNotesDraft[+el.dataset.idx].text = el.value;
  });
}
function addFormNote() {
  const t = $('#form-note-new').value.trim(); if (!t) return;
  syncFormNotesFromDom();
  formNotesDraft.unshift({ text: t, at: null }); // at gán lúc Lưu
  $('#form-note-new').value = '';
  renderFormNotes();
}
// Kết quả cuối: ghi chú (bỏ ô trống, gán giờ cho ghi chú mới) + cả ô "thêm" chưa bấm ＋.
function collectFormNotes() {
  syncFormNotesFromDom();
  const now = new Date().toISOString();
  const pending = $('#form-note-new').value.trim();
  const list = (pending ? [{ text: pending, at: null }] : []).concat(formNotesDraft)
    .map((n) => ({ text: n.text.trim(), at: n.at || now }))
    .filter((n) => n.text);
  return { notes: list, reg: formRegNote.trim() || null };
}
$('#form-note-add-btn')?.addEventListener('click', addFormNote);
$('#form-note-new')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFormNote(); } });
$('#form-notes')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-note-del]'); if (!b) return;
  syncFormNotesFromDom();
  if (b.dataset.noteDel === 'reg') formRegNote = '';
  else formNotesDraft.splice(+b.dataset.noteDel, 1);
  renderFormNotes();
});
// Nhóm "Mở rộng": cập nhật số trường đã điền khi gập lại.
$('#customer-form')?.addEventListener('toggle', (e) => { if (e.target.matches?.('details.form-more')) updateMoreCount(e.target); }, true);

// ---- Gợi ý Mã toà / Mã căn từ GIỎ HÀNG (js/catalog.js), lọc theo dự án đang chọn ----
function formCatalogProjects() {
  const sel = selectedProjects.map((n) => Catalog.projectByName(n)).filter(Boolean);
  return sel.length ? sel : Catalog.projects(); // chưa chọn dự án → gợi ý từ mọi dự án
}
function formCatalogBuildings() { return formCatalogProjects().flatMap((p) => Catalog.buildingsOf(p.id)); }
function refreshAptSuggestions() {
  refreshAptTypeOptions();
  fillTypicalArea(); // đổi dự án / mã toà → diện tích tự điền chạy theo
  const f = $('#customer-form');
  const bs = formCatalogBuildings();
  const multiProj = formCatalogProjects().length > 1;
  $('#cf-building-list').innerHTML = bs.map((b) => {
    const p = Catalog.project(b.project_id);
    return `<option value="${escapeHtml(b.code)}">${multiProj && p ? escapeHtml(p.name) : ''}</option>`;
  }).join('');
  const code = f.building_code.value.trim().toLowerCase();
  const picked = bs.filter((b) => b.code.toLowerCase() === code);
  const units = (picked.length ? picked : bs).flatMap((b) => Catalog.unitsOf(b.id));
  $('#cf-unit-list').innerHTML = units.slice(0, 500).map((u) => {
    const info = [picked.length ? '' : 'Toà ' + u.building, u.apt_type, u.area_m2 ? u.area_m2 + 'm²' : '',
                  Catalog.statusLabel(u.status)].filter(Boolean).join(' · ');
    return `<option value="${escapeHtml(u.code)}">${escapeHtml(info)}</option>`;
  }).join('');
}
// Gõ/chọn mã căn có trong giỏ hàng → tự điền toà, diện tích, loại căn, tầng, hướng (+ giá nếu trống)
function fillFromCatalogUnit() {
  const f = $('#customer-form');
  const code = f.apt_code.value.trim().toLowerCase();
  if (!code) return;
  const bs = formCatalogBuildings();
  const bCode = f.building_code.value.trim().toLowerCase();
  const cands = bs.flatMap((b) => Catalog.unitsOf(b.id)).filter((u) => u.code.toLowerCase() === code);
  const u = cands.find((x) => x.building.toLowerCase() === bCode) || (cands.length === 1 ? cands[0] : null);
  if (!u) return; // không có / trùng mã ở nhiều toà mà chưa chọn toà → không đoán
  f.apt_code.value = u.code;
  f.building_code.value = u.building;
  const area = Catalog.unitArea(u); // riêng của căn > điển hình của loại căn (toà > dự án)
  if (area) { f.apt_area.value = area; areaAuto = true; }
  if (u.floor) f.apt_floor.value = u.floor;
  if (u.direction && [...f.apt_direction.options].some((o) => o.value === u.direction)) f.apt_direction.value = u.direction;
  if (u.apt_type) setFormAptType(u.apt_type);
  const price = Catalog.unitPrice(u);
  if ((!f.apt_price.value || priceAuto) && price && area) { f.apt_price.value = Math.round(price * area); priceAuto = true; }
  const p = Catalog.project(u.project_id);
  if (p && !selectedProjects.includes(p.name)) { selectedProjects.push(p.name); renderProjSelect(); }
  refreshAptSuggestions();
  showToast('Đã điền thông tin căn từ giỏ hàng');
}

// ---- Ô Loại căn: chỉ hiện loại căn của dự án đã chọn (toà đã nhập → loại căn của toà) ----
// Chưa chọn dự án / dự án chưa khai báo loại căn trong Giỏ hàng → danh sách chuẩn APT_TYPES.
// Trả về [[loại, diện tích điển hình | null], ...] hoặc null (= dùng danh sách chuẩn).
function formTypeList() {
  const f = $('#customer-form');
  const ps = selectedProjects.map((n) => Catalog.projectByName(n)).filter(Boolean);
  if (!ps.length) return null;
  const bCode = f.building_code.value.trim().toLowerCase();
  const map = new Map();
  for (const p of ps) {
    const b = bCode && Catalog.buildingsOf(p.id).find((x) => x.code.toLowerCase() === bCode);
    const list = b ? Catalog.buildingTypes(b.id)
      : Catalog.projectTypes(p.id).map((t) => ({ apt_type: t.apt_type, area: t.typical_area_m2 ? +t.typical_area_m2 : null }));
    // Nhiều dự án cùng có 1 loại → không hiện diện tích (mỗi dự án 1 số)
    list.forEach((t) => map.set(t.apt_type, map.has(t.apt_type) ? null : t.area));
  }
  if (!map.size) return null;
  const rank = (t) => { const i = APT_TYPES.indexOf(t); return i < 0 ? 99 : i; };
  return [...map].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}
function getFormAptType() {
  const f = $('#customer-form');
  return canonicalAptType(f.apt_type_select.value === '__other' ? f.apt_type_other.value.trim() : f.apt_type_select.value) || '';
}
// Chọn 1 loại căn: có trong danh sách đang hiện → chọn; không có → "Khác..." + ghi sẵn tên (giữ dữ liệu)
function setFormAptType(raw) {
  const f = $('#customer-form');
  const at = canonicalAptType(raw || '') || '';
  const has = at && [...f.apt_type_select.options].some((o) => o.value === at);
  if (!at) { f.apt_type_select.value = ''; f.apt_type_other.value = ''; }
  else if (has) { f.apt_type_select.value = at; f.apt_type_other.value = ''; }
  else { f.apt_type_select.value = '__other'; f.apt_type_other.value = at; }
  toggleAptOther();
}
function refreshAptTypeOptions() {
  const f = $('#customer-form');
  const cur = getFormAptType();
  const list = formTypeList() || APT_TYPES.map((t) => [t, null]);
  f.apt_type_select.innerHTML = '<option value="">— Chưa rõ —</option>' +
    list.map(([t, a]) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}${a ? ' · ' + String(a).replace('.', ',') + 'm²' : ''}</option>`).join('') +
    '<option value="__other">Khác...</option>';
  setFormAptType(cur);
}

// Chọn loại căn khi ô diện tích còn trống → điền diện tích điển hình (toà đã nhập > dự án đã chọn)
// + giá căn (nếu trống) = diện tích × giá điển hình (toà > dự án)
// ---- DIỆN TÍCH = GIÁ TRỊ PHỤ THUỘC (dự án + toà + loại căn), sửa tay được ----
// Nguồn (giỏ hàng, js/catalog.js): diện tích riêng của căn > của toà > điển hình của dự án theo loại căn.
// areaAuto = ô Diện tích đang là số TỰ ĐIỀN → luôn chạy theo dự án/toà/loại căn. Sửa tay → false → giữ nguyên.
// Giá căn (= diện tích × đơn giá điển hình) đi theo cùng nguyên tắc với priceAuto.
let areaAuto = false, priceAuto = false;
let lastUnitPrice = null; // đơn giá điển hình (đ/m²) của lựa chọn hiện tại — để giá tự tính theo diện tích sửa tay
// Diện tích + đơn giá điển hình theo lựa chọn hiện tại của form; null = không xác định được.
function typicalAreaForForm() {
  const f = $('#customer-form');
  const type = canonicalAptType(f.apt_type_select.value === '__other' ? f.apt_type_other.value : f.apt_type_select.value);
  if (typeof Catalog === 'undefined') return null; // Catalog khai báo const ở js/catalog.js (không nằm trên window)
  const bCode = f.building_code.value.trim().toLowerCase();
  // 1) Mã căn khớp 1 căn trong giỏ hàng → diện tích RIÊNG của căn (căn > toà > dự án).
  const uCode = f.apt_code.value.trim().toLowerCase();
  if (uCode) {
    const cands = formCatalogBuildings().flatMap((b) => Catalog.unitsOf(b.id)).filter((u) => u.code.toLowerCase() === uCode);
    const u = cands.find((x) => (x.building || '').toLowerCase() === bCode) || (cands.length === 1 ? cands[0] : null);
    const ua = u && Catalog.unitArea(u);
    if (ua) return { area: ua, unitPrice: Catalog.unitPrice(u) };
  }
  // 2) Không có căn cụ thể → điển hình theo loại căn (toà > dự án).
  if (!type) return null;
  for (const p of formCatalogProjects()) {
    const b = bCode ? Catalog.buildingsOf(p.id).find((x) => x.code.toLowerCase() === bCode) : null;
    const a = Catalog.typicalArea(p.id, b && b.id, type);
    if (a && (b || selectedProjects.length === 1)) { // nhiều dự án mà chưa có toà → không đoán
      return { area: a, unitPrice: b ? Catalog.buildingPrice(b) : Catalog.projectPrice(p) }; // giá: toà > dự án
    }
  }
  return null;
}
function syncAreaAutoTag() { const t = $('#area-auto-tag'); if (t) t.hidden = !areaAuto; }
// Tính lại diện tích (và giá) tự điền sau mỗi lần đổi dự án / toà / loại căn.
function fillTypicalArea() {
  const f = $('#customer-form');
  if (f.apt_area.value && !areaAuto) return; // diện tích sửa tay / theo căn cụ thể → không đè
  const t = typicalAreaForForm();
  lastUnitPrice = t && t.unitPrice ? t.unitPrice : null;
  if (t) {
    f.apt_area.value = t.area; areaAuto = true;
    if ((!f.apt_price.value || priceAuto) && t.unitPrice) { f.apt_price.value = Math.round(t.area * t.unitPrice); priceAuto = true; }
  } else if (areaAuto) {
    // Lựa chọn mới không có diện tích điển hình → bỏ số tự điền cũ (tránh giữ số của loại căn khác).
    f.apt_area.value = ''; areaAuto = false;
    if (priceAuto) { f.apt_price.value = ''; priceAuto = false; }
  }
  syncAreaAutoTag();
}

// Hiện ô "loại căn khác" khi chọn "Khác..."
function toggleAptOther() {
  const f = $('#customer-form');
  f.apt_type_other.hidden = f.apt_type_select.value !== '__other';
}

// Hiện ô ghi chú khi: (a) đổi sang bậc khác, HOẶC (b) chọn lại ĐÚNG bậc cũ nhưng
// là bậc lặp được (Đăng kí mới / Đang tiếp cận) → cho ghi thêm 1 lần liên hệ mới.
function toggleCareStageNote() {
  const f = $('#customer-form');
  const val = f.care_stage.value;
  const changed = !!val && val !== formOriginalStage;
  // "Ghi thêm lần cùng bậc" chỉ có nghĩa khi ĐANG SỬA khách cũ (thêm 1 lần liên hệ
  // mới ở bậc hiện tại) — không áp cho form TẠO mới (bậc mặc định 'Đăng kí mới' vốn
  // là bậc lặp được, nếu không chặn sẽ tự bật ô ghi chú ngay khi mở form tạo khách).
  const relog = !!val && val === formOriginalStage && isRepeatableStage(val) && !!editingId;
  const show = changed || relog;
  $('#care-stage-note-wrap').hidden = !show;
  // Nhãn đổi theo ngữ cảnh để người dùng hiểu đang làm gì.
  const lbl = $('#care-stage-note-label');
  if (lbl) lbl.textContent = relog
    ? 'Ghi chú lần liên hệ mới (thêm 1 mốc, vẫn ở bậc này)'
    : 'Ghi chú cho lần đổi tiến độ này';
  if (!show) f.care_stage_note.value = '';
}

// Khi ĐỔI bậc chăm sóc: tự chỉnh mức quan tâm theo bậc (nếu bậc có map). 'Loại' → 0%.
// Người dùng kéo slider tay sau đó sẽ ghi đè (giá trị lúc Lưu là giá trị cuối cùng).
function onCareStageChange() {
  toggleCareStageNote();
  const f = $('#customer-form');
  const stage = f.care_stage.value;
  if (Object.prototype.hasOwnProperty.call(STAGE_INTEREST, stage)) {
    const v = STAGE_INTEREST[stage];
    f.interest_level.value = v;
    updateInterestUI(v);
  }
}

function closeForm() {
  $('#form-modal').close();
  editingId = null;
}

// ==================== Ô NGÀY SINH dd/MM/YYYY (1 ô, tự nhảy đoạn) ====================
// 3 đoạn input (ngày/tháng/năm) trông như 1 ô. Năm bỏ trống / <4 số hợp lệ → partial
// ('--MM-DD', chỉ Cung). Đủ ngày+tháng+năm → 'YYYY-MM-DD' (Mệnh + Cung).
const DOB_DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function dobMaxDay(m, y) {
  if (!m) return 31;
  if (m === 2) return (!y) ? 29 : (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28);
  return DOB_DIM[m - 1];
}
function readDobInput() {
  const dd = +$('#dob-day').value || 0, mm = +$('#dob-mon').value || 0;
  const ys = $('#dob-year').value, yy = (ys.length === 4) ? +ys : 0;
  return { dd, mm, ys, yy };
}
// Chuỗi dob để LƯU, hoặc null nếu chưa đủ / không hợp lệ.
function buildDobFromInput() {
  const { dd, mm, yy } = readDobInput();
  if (!(dd >= 1 && dd <= 31) || !(mm >= 1 && mm <= 12) || dd > dobMaxDay(mm, yy)) return null;
  const md = ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2);
  const nowY = new Date().getFullYear();
  if (yy && yy >= 1900 && yy <= nowY) return yy + '-' + md;
  return '--' + md; // partial (không năm hợp lệ)
}
// Nạp dob (chuỗi) vào 3 đoạn input.
function setDobInput(dobStr) {
  const p = window.LunarUtil.parseDob(dobStr);
  if (!p) { $('#dob-day').value = ''; $('#dob-mon').value = ''; $('#dob-year').value = ''; }
  else {
    $('#dob-day').value = ('0' + p.day).slice(-2);
    $('#dob-mon').value = ('0' + p.month).slice(-2);
    $('#dob-year').value = p.year ? String(p.year) : '';
  }
  updateDobDerived();
}
// Kiểm tra hợp lệ ô ngày sinh (Mệnh/Cung nay suy lúc lưu, không preview trong form nữa).
function updateDobDerived() {
  const { dd, mm, ys, yy } = readDobInput();
  const nowY = new Date().getFullYear();
  let msg = '';
  if (dd && (dd < 1 || dd > 31)) msg = 'Ngày phải 1–31.';
  else if (mm && (mm < 1 || mm > 12)) msg = 'Tháng phải 1–12.';
  else if (dd && mm && dd > dobMaxDay(mm, yy)) msg = 'Tháng ' + mm + (mm === 2 && !yy ? ' tối đa 29 ngày' : ' chỉ có ' + dobMaxDay(mm, yy) + ' ngày') + '.';
  else if (ys.length === 4 && (yy < 1900 || yy > nowY)) msg = 'Năm phải 1900–' + nowY + '.';
  $('#dob-box').classList.toggle('invalid', !!msg);
  $('#dob-err').textContent = msg;
}
// Gắn hành vi gõ cho 3 đoạn (gọi 1 lần lúc init).
function wireDobInput() {
  const d = $('#dob-day'), m = $('#dob-mon'), y = $('#dob-year');
  if (!d) return;
  const dg = (el) => { el.value = el.value.replace(/\D/g, ''); return el.value; };
  d.addEventListener('input', () => {
    let v = dg(d).slice(0, 2);
    if (v.length === 1 && +v > 3) { d.value = '0' + v; m.focus(); updateDobDerived(); return; } // 4–9 → 0X
    if (v.length === 2) { const n = +v; if (n < 1 || n > 31) v = v[0]; else { d.value = v; m.focus(); updateDobDerived(); return; } }
    d.value = v; updateDobDerived();
  });
  m.addEventListener('input', () => {
    let v = dg(m).slice(0, 2);
    if (v.length === 1 && +v > 1) { m.value = '0' + v; y.focus(); updateDobDerived(); return; } // 2–9 → 0X
    if (v.length === 2) { const n = +v; if (n < 1 || n > 12) v = v[0]; else { m.value = v; y.focus(); updateDobDerived(); return; } }
    m.value = v; updateDobDerived();
  });
  y.addEventListener('input', () => { y.value = dg(y).slice(0, 4); updateDobDerived(); });
  // Tab: 1 số → tự đệm 0 rồi nhảy. Backspace ở ô rỗng → về đoạn trước.
  d.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey && d.value.length === 1) { e.preventDefault(); d.value = '0' + d.value; m.focus(); updateDobDerived(); } });
  m.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && m.value.length === 1) { e.preventDefault(); m.value = '0' + m.value; y.focus(); updateDobDerived(); }
    if (e.key === 'Backspace' && m.value === '') { e.preventDefault(); d.focus(); }
  });
  y.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && y.value === '') { e.preventDefault(); m.focus(); } });
  d.addEventListener('blur', () => { if (d.value.length === 1) d.value = '0' + d.value; updateDobDerived(); });
  m.addEventListener('blur', () => { if (m.value.length === 1) m.value = '0' + m.value; updateDobDerived(); });
}
// Hiển thị ngày sinh: full → DD/MM/YYYY, partial → DD/MM.
function formatDob(dobStr) {
  const p = window.LunarUtil.parseDob(dobStr);
  if (!p) return '';
  const dd = ('0' + p.day).slice(-2), mm = ('0' + p.month).slice(-2);
  return p.year ? `${dd}/${mm}/${p.year}` : `${dd}/${mm}`;
}
// Số tuổi suy từ dob — CHỈ khi có năm sinh (YYYY). Trừ 1 nếu chưa tới sinh nhật năm nay
// (khi đủ ngày+tháng). Trả null nếu không có năm hoặc giá trị vô lý → chỗ gọi để trống.
function ageFromDob(dobStr) {
  const p = window.LunarUtil.parseDob(dobStr);
  if (!p || !p.year) return null;
  const now = new Date();
  let age = now.getFullYear() - p.year;
  if (p.month && p.day) {
    const passed = (now.getMonth() + 1 > p.month) || (now.getMonth() + 1 === p.month && now.getDate() >= p.day);
    if (!passed) age -= 1;
  }
  return (age >= 0 && age < 150) ? age : null;
}
// Giá trị "Ngày sinh" cho trang chi tiết: ngày sinh + (nếu có năm) tuổi dạng chữ nhỏ.
// Trả { html } tin cậy (đã escape phần ngày) để renderGroupedKV chèn nguyên.
function dobWithAge(dobStr) {
  const base = escapeHtml(formatDob(dobStr));
  const age = ageFromDob(dobStr);
  return { html: age != null ? `${base} <span class="pi-note">(${age} tuổi)</span>` : base };
}
// Cung của khách: ưu tiên giá trị đã lưu; nếu chưa có (khách lưu trước khi có feature)
// thì tính lại từ dob → khách cũ vẫn hiện Cung ngay mà không cần lưu lại.
function cungOf(c) {
  return c.cung || (c.dob ? (window.LunarUtil.calcCungFromDOB(c.dob) || null) : null);
}
// Cầm tinh (con giáp): suy TRỰC TIẾP từ dob (không lưu DB) — cần năm sinh, trống nếu không có.
function camTinhOf(c) {
  return (c && c.dob) ? (window.LunarUtil.calcCamTinhFromDOB(c.dob) || null) : null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const f = $('#customer-form');
  // Chặn lưu khi ngày sinh đang nhập sai (viền đỏ) — có nhập nhưng không hợp lệ.
  if ($('#dob-box').classList.contains('invalid')) {
    alert('Ngày sinh không hợp lệ — kiểm tra lại (ngày/tháng/năm).');
    return;
  }
  const dob = buildDobFromInput(); // 'YYYY-MM-DD' | '--MM-DD' | null
  const payload = {
    phone: f.phone.value.trim(),
    full_name: f.full_name.value.trim(),
    gender: f.gender.value || null,
    dob,
    menh: dob ? (window.LunarUtil.calcMenhFromSolarDOB(dob) || null) : null,
    cung: dob ? (window.LunarUtil.calcCungFromDOB(dob) || null) : null,
    marital_status: f.marital_status.value || null,
    occupation: f.occupation.value || null,
    income: f.income.value.trim() || null,
    residence: f.residence.value.trim() || null,
    registered_at: f.registered_at.value ? new Date(f.registered_at.value).toISOString() : null,
    apt_type: canonicalAptType(f.apt_type_select.value === '__other' ? f.apt_type_other.value.trim() : f.apt_type_select.value) || null,
    projects: selectedProjects,
    apt_code: f.apt_code.value.trim() || null,
    building_code: f.building_code.value.trim() || null,
    apt_area: f.apt_area.value ? Number(f.apt_area.value) : null,
    apt_direction: f.apt_direction.value || null,
    apt_floor: f.apt_floor.value ? Number(f.apt_floor.value) : null,
    apt_price: f.apt_price.value ? Number(f.apt_price.value) : null,
    finance: f.finance.value ? Number(f.finance.value) : null,
    purpose: f.purpose.value || null,
    interest_level: Number(f.interest_level.value),
    care_stage: f.care_stage.value || null,
    contact_status: f.contact_status.value || null,
  };
  // Hồ sơ Nâng cao → gom thành 1 object (bỏ field trống). Number cho field số.
  const advanced = {};
  for (const fld of ADVANCED_FIELDS) {
    const el = f.elements['adv_' + fld.key];
    if (!el) continue;
    const raw = String(el.value).trim();
    if (raw === '') continue;
    advanced[fld.key] = fld.type === 'number' ? Number(raw) : raw;
  }
  payload.advanced = advanced;
  // Chuẩn hoá SĐT (master key) NGAY: bỏ dấu cách, +84→0... để mọi so trùng & lưu đều
  // dùng 1 dạng chuẩn ("0123 456 789" và "0123456789" là một).
  payload.phone = normalizePhoneVN(payload.phone);
  // Diện tích không bắt buộc, nhưng nếu có nhập thì phải là số DƯƠNG.
  if (f.apt_area.value !== '' && !(Number(f.apt_area.value) > 0)) {
    alert('Diện tích phải là số dương (vd: 68.5).');
    return;
  }
  if (!payload.phone || !payload.full_name) {
    alert('Cần nhập ít nhất Số điện thoại và Họ tên.');
    return;
  }
  payload.campaign = f.campaign.value.trim() || null;
  const channel = f.source_channel.value || null;
  const editing = editingId ? allCustomers.find((x) => x.id === editingId) : null;
  // Lead (chưa đạt): KHÔNG đụng tiến độ/trạng thái liên lạc (ô đã ẩn) — giữ giá trị đang có.
  if (editing && !isQualified(editing)) { delete payload.care_stage; delete payload.contact_status; }
  if (editing && channel) {
    // Đổi kênh chính = thay phần tử ĐẦU, giữ các kênh gộp thêm sau đó.
    const list = sourceListOf(editing.source);
    if (list[0] !== channel) payload.source = [channel, ...list.filter((x) => x !== channel)];
  }
  if (editing && !isQualified(editing)) delete payload.interest_level; // lead: không đụng mức quan tâm (đã ẩn)
  const savedId = editingId;
  try { if (!editingId && channel) localStorage.setItem(LS_LAST_SOURCE, channel); } catch {}
  // Nhớ lựa chọn dự án lần này làm mặc định cho khách mới sau (nếu không tự set).
  localStorage.setItem(LS_LAST_PROJECTS, JSON.stringify(selectedProjects));
  // Ghi chú cho lần đổi bậc / lần liên hệ mới.
  const note = f.care_stage_note.value.trim() || null;
  const opts = { careStageNote: note };
  // Ghi chú (bản nháp đã sửa/xoá/thêm trong form).
  const { notes: formNotes, reg: formReg } = collectFormNotes();
  if (editingId) {
    // Chặn SỬA SĐT trùng khách KHÁC: update vi phạm unique (phone,owner) sẽ làm KẸT
    // hàng đợi đồng bộ (khác insert — không tự bỏ được), nên chặn ngay tại đây.
    const clash = allCustomers.find((c) => c.id !== editingId && c.owner_id === editing.owner_id && normalizePhoneVN(c.phone) === payload.phone);
    if (clash) {
      alert('⚠️ Số điện thoại "' + payload.phone + '" đã thuộc về khách khác: "' +
        (clash.full_name || '') + '".\n\nHãy dùng số khác hoặc kiểm tra lại.');
      return;
    }
    const newStage = payload.care_stage;
    const orig = formOriginalStage;
    if (newStage && orig && careSortRank(newStage) < careSortRank(orig)) {
      // (a) CẬP NHẬT LÙI: bậc mới thấp hơn bậc cũ → cảnh báo trước khi xoá lịch sử.
      const ok = confirm(
        '⚠️ CẬP NHẬT LÙI TIẾN ĐỘ\n\n' +
        `Từ "${orig}" → "${newStage}".\n\n` +
        `Mọi mốc lịch sử ở bậc CAO HƠN "${newStage}" sẽ bị XOÁ vĩnh viễn ` +
        '(coi các bước sau là nhầm/thử). Tiếp tục?'
      );
      if (!ok) return; // huỷ: giữ nguyên form để sửa lại
      opts.rewind = true;
      opts.keepStages = CARE_STAGE_OPTIONS.filter((s) => careSortRank(s) <= careSortRank(newStage));
    } else if (newStage && newStage === orig && isRepeatableStage(newStage) && note) {
      // (b) Cùng bậc lặp được + có ghi chú → ghi thêm 1 lần liên hệ mới.
      opts.forceLog = true;
    }
    // Chỉ gửi ghi chú khi thực sự đổi (tránh ghi đè không cần thiết).
    const curNotes = (editing && Array.isArray(editing.notes_manual)) ? editing.notes_manual : [];
    const norm = (l) => JSON.stringify(l.map((n) => [n.text, n.at]));
    if (norm(formNotes) !== norm(curNotes)) payload.notes_manual = formNotes;
    if ((editing && editing.notes || null) !== formReg) payload.notes = formReg;
    await CRM.update(editingId, payload, opts);
    if (pendingOcrNote) { await CRM.addNote(editingId, pendingOcrNote); pendingOcrNote = null; }
    // Đổi bậc TIẾN LÊN cho khách Tiềm năng → sau khi đóng form gợi ý lịch theo nhịp bậc mới.
    if (newStage && newStage !== orig && careSortRank(newStage) > careSortRank(orig || CARE_STAGE_DEFAULT) && isQualified(editing)) {
      pendingFollowup = { id: editingId, stage: newStage };
    }
  } else {
    // Kênh do sale chọn (source); cách nhập hệ thống tự set: ảnh (OCR) → 'ocr', còn lại 'manual'.
    const newSource = channel || SOURCE_DEFAULT;
    payload.intake_method = pendingOcrImage ? 'ocr' : 'manual';

    // === CHẶN TRÙNG theo MASTER KEY (SĐT) khi tạo khách mới ===
    // So với khách của chính mình (local chỉ chứa khách của owner hiện tại).
    const dup = ownedCustomers().find((c) => normalizePhoneVN(c.phone) === payload.phone);
    // SĐT đã nằm trong danh sách của ĐỒNG NGHIỆP (thấy được khi theo dõi / trưởng nhóm) → hỏi trước.
    const other = !dup && allCustomers.find((c) => !isMine(c) && normalizePhoneVN(c.phone) === payload.phone);
    if (other && !confirm(`Số "${payload.phone}" đã có trong danh sách của ${memberName(other.owner_id)} (khách "${other.full_name || ''}").\n\nVẫn tạo khách riêng của bạn?`)) return;
    if (dup) {
      const sameName = normalizeNameKey(dup.full_name) === normalizeNameKey(payload.full_name);
      if (!sameName) {
        // SĐT trùng nhưng TÊN khác → nhiều khả năng gõ nhầm số → chặn, bắt xác nhận lại.
        alert('⚠️ Số điện thoại "' + payload.phone + '" đã tồn tại nhưng gắn với TÊN KHÁC: "' +
          (dup.full_name || '') + '".\n\nHãy kiểm tra / xác nhận lại số điện thoại.');
        return;
      }
      const curSources = sourceListOf(dup.source);
      if (curSources.includes(newSource)) {
        // Trùng SĐT + trùng tên + CÙNG kênh → trùng lặp hoàn toàn → không cho ghi.
        alert('⚠️ Khách này đã tồn tại (trùng số điện thoại, tên và kênh "' +
          sourceLabel(newSource) + '"). Không tạo bản trùng.');
        return;
      }
      // Trùng SĐT + trùng tên + KHÁC kênh → KHÔNG tạo bản mới; chỉ BỔ SUNG kênh
      // vào khách cũ (nguồn thành nhiều giá trị, vd "Facebook Ads + Landing page").
      const mergedSource = curSources.concat([newSource]);
      await CRM.update(dup.id, { source: mergedSource });
      if (pendingOcrNote) { await CRM.addNote(dup.id, pendingOcrNote); pendingOcrNote = null; }
      for (const n of [...formNotes].reverse()) await CRM.addNote(dup.id, n.text); // giữ thứ tự cũ→mới
      if (pendingOcrImage) {
        try { await CRM.uploadDocument(dup.id, pendingOcrImage, 'reg_image', 'Ảnh đăng ký'); }
        catch (err) { console.warn('Lưu ảnh đăng ký lỗi:', err); }
        pendingOcrImage = null;
      }
      alert('✅ Đã lưu. Khách "' + (dup.full_name || '') + '" đã tồn tại — đã BỔ SUNG kênh "' +
        sourceLabel(newSource) + '" vào khách cũ (không tạo bản trùng).');
      closeForm();
      await refreshList();
      return;
    }

    // SĐT mới hoàn toàn → tạo khách. source lưu dạng MẢNG (jsonb).
    payload.source = [newSource];
    payload.notes_manual = formNotes;
    if (f.qualify_now.checked) {
      // Đã gọi & xác nhận quan tâm ngay lúc nhập → vào thẳng lớp 2, ghi 1 lần gọi "Nói chuyện được".
      const now = new Date().toISOString();
      payload.qualified_at = now;
      payload.care_stage = QUALIFIED_STAGE;
      // Vào thẳng chăm sóc → mức quan tâm lên mốc của bậc 'Đang chăm sóc' (60%), trừ khi đã kéo cao hơn.
      payload.interest_level = Math.max(payload.interest_level || 0, STAGE_INTEREST[QUALIFIED_STAGE]);
      payload.call_attempts = [{ at: now, result: 'talked', note: 'Xác nhận quan tâm lúc nhập khách' }];
    } else {
      payload.care_stage = CARE_STAGE_DEFAULT; // lớp 1 "Khách mới"
      delete payload.contact_status;
    }
    const created = await CRM.create(payload, opts);
    if (created) showToast(created.qualified_at ? 'Đã thêm vào Đang chăm' : 'Đã thêm vào Khách mới');
    if (created && created.qualified_at) pendingFollowup = { id: created.id, stage: QUALIFIED_STAGE };
    // Nếu OCR đọc được 1 ghi chú → thêm thành 1 note tự nhập cho khách vừa tạo.
    if (created && pendingOcrNote) { await CRM.addNote(created.id, pendingOcrNote); pendingOcrNote = null; }

    // Lưu ảnh OCR thành tài liệu reg_image (cần mạng; offline thì bỏ qua, không chặn tạo khách).
    if (created && pendingOcrImage) {
      try { await CRM.uploadDocument(created.id, pendingOcrImage, 'reg_image', 'Ảnh đăng ký'); }
      catch (err) { console.warn('Lưu ảnh đăng ký lỗi:', err); }
      pendingOcrImage = null;
    }
  }
  closeForm();
  await refreshList();
  // Nếu đang mở trang chi tiết khách vừa sửa → vẽ lại cho khớp dữ liệu mới
  if (savedId && !$('#detail-screen').hidden) openDetail(savedId);
  if (pendingFollowup) { const f = pendingFollowup; pendingFollowup = null; offerFollowup(f.id, f.stage); }
}

async function confirmDelete(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!confirm(`Xoá khách "${c?.full_name || ''}"? Không thể hoàn tác.`)) return;
  await CRM.remove(id);
  closeForm();
  if (detailId === id) closeDetailToList(); // đang xem chi tiết khách này → về danh sách (đồng bộ history)
  await refreshList();
}

// ------------------------------------------------- LƯU VÀO DANH BẠ ----------
// Tạo vCard (.vcf) rồi: điện thoại dùng Web Share (bung "Thêm liên hệ") — mượt nhất;
// desktop fallback tải file .vcf (macOS/Windows mở Danh bạ/Contacts để thêm).
// Tên danh bạ = Họ tên + loại căn; SĐT + ngày sinh + thường trú map vào field khớp;
// còn lại gộp vào NOTE của hồ sơ danh bạ.

function vcardEsc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function buildContactNote(c) {
  const L = [];
  const push = (label, val) => { if (val != null && String(val).trim() !== '') L.push(`${label}: ${val}`); };
  push('Loại căn', canonicalAptType(c.apt_type));
  push('Dự án', Array.isArray(c.projects) && c.projects.length ? c.projects.join(', ') : '');
  push('Giá', c.apt_price ? formatPrice(c.apt_price) : '');
  push('Mã căn', c.apt_code);
  push('Mã toà', c.building_code);
  push('Giới tính', c.gender);
  push('Hôn nhân', c.marital_status);
  push('Mệnh', c.menh);
  push('Công việc', c.occupation);
  push('Thu nhập', c.income);
  push('Mức quan tâm', c.interest_level != null ? c.interest_level + '%' : '');
  push('Tiến độ', c.care_stage);
  push('Liên lạc', c.contact_status);
  const autoNote = autoNoteFromHistory(c.care_stage_history);
  const manual = Array.isArray(c.notes_manual) ? c.notes_manual.map((n) => n.text).filter(Boolean) : [];
  const notes = [autoNote, ...manual].filter(Boolean);
  if (notes.length) push('Ghi chú', notes.join(' | '));
  push('Nguồn', sourceDisplay(c.source));
  return L.join('\n');
}

function buildVCard(c) {
  const fn = (c.full_name || '(chưa có tên)') + (c.apt_type ? ' - ' + c.apt_type : '');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:;' + vcardEsc(fn) + ';;;', 'FN:' + vcardEsc(fn)];
  if (c.phone) lines.push('TEL;TYPE=CELL:' + vcardEsc(c.phone));
  // BDAY chấp nhận cả 'YYYY-MM-DD' (đủ) lẫn '--MM-DD' (không năm) theo RFC 6350.
  if (c.dob && window.LunarUtil.parseDob(c.dob)) lines.push('BDAY:' + c.dob);
  if (c.residence) lines.push('ADR;TYPE=HOME:;;;' + vcardEsc(c.residence) + ';;;'); // thường trú → phần "tỉnh/thành"
  const note = buildContactNote(c);
  if (note) lines.push('NOTE:' + vcardEsc(note));
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

async function saveContact(c) {
  if (!c) return;
  const vcf = buildVCard(c);
  const fnBase = ((c.full_name || 'khach') + (c.apt_type ? '-' + c.apt_type : '')).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
  const fileName = `${fnBase || 'khach'}.vcf`;
  // Điện thoại: Web Share API với file → bung màn hình "Thêm liên hệ" / share sheet.
  try {
    const file = new File([vcf], fileName, { type: 'text/vcard' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: c.full_name || 'Liên hệ' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user tự huỷ share
    console.warn('Web Share lỗi, chuyển sang tải .vcf:', e);
  }
  // Desktop / không hỗ trợ share file: tải .vcf (OS mở Danh bạ/Contacts để thêm).
  const url = URL.createObjectURL(new Blob([vcf], { type: 'text/vcard;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#detail-contact-btn')?.addEventListener('click', () => {
  const c = allCustomers.find((x) => x.id === detailId);
  if (c) saveContact(c);
});

// ---------- PHÂN TÍCH AI: copy prompt (kèm JSON khách) để dán vào LLM ----------
// Gom dữ liệu khách thành 1 object JSON có NHÓM rõ ràng + khoá tiếng Việt dễ đọc, rồi
// nhét vào 1 prompt cố định. Bấm nút → copy CẢ prompt vào clipboard (không tải file,
// không gọi API — thuần client, đọc từ dữ liệu đã có sẵn trong app).
// QUY ƯỚC: trường trống để null CÓ CHỦ ĐÍCH (không bỏ khỏi JSON) — prompt yêu cầu LLM
// tự nhận biết "chưa đủ dữ liệu" thay vì bịa; giữ null giúp LLM biết đang thiếu gì.

// Số tiền → chuỗi người-đọc-được (vd "1,5 tỷ"); trống/không hợp lệ → null.
function moneyOrNull(v) {
  if (v == null || v === '' || !(Number(v) > 0)) return null;
  return formatPrice(v);
}
// Chuỗi đã trim; rỗng → null (để JSON hiện null thay vì "").
function textOrNull(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s || null;
}

// Dựng object JSON đầy đủ của 1 khách để đưa vào prompt phân tích.
function buildAnalysisJSON(c) {
  // Hồ sơ Nâng cao: chỉ đưa field CÓ giá trị (số → định dạng VNĐ), dùng nhãn tiếng Việt.
  const advanced = {};
  const advObj = (c && c.advanced && typeof c.advanced === 'object') ? c.advanced : {};
  for (const fld of ADVANCED_FIELDS) {
    const raw = advObj[fld.key];
    if (raw == null || String(raw).trim() === '') continue;
    advanced[fld.label] = fld.type === 'number' ? moneyOrNull(raw) : String(raw).trim();
  }

  // Ghi chú tay (mảng {text, at}) → mảng chuỗi text (bỏ trống, mới nhất giữ nguyên thứ tự lưu).
  const ghiChuTay = Array.isArray(c.notes_manual)
    ? c.notes_manual.map((n) => textOrNull(n && n.text)).filter(Boolean)
    : [];

  // Lịch sử chăm sóc (mảng {stage, note, at}) → gọn {bac, ghi_chu, thoi_diem}, cũ→mới.
  const lichSuChamSoc = Array.isArray(c.care_stage_history)
    ? [...c.care_stage_history]
        .sort((a, b) => (a.at || '').localeCompare(b.at || ''))
        .map((h) => ({
          bac: h.stage || null,
          ghi_chu: textOrNull(h.note),
          thoi_diem: h.at ? formatLogTime(h.at) : null,
        }))
    : [];

  const projects = (Array.isArray(c.projects) && c.projects.length) ? c.projects.slice() : [];

  return {
    thong_tin_ca_nhan: {
      ho_ten: textOrNull(c.full_name),
      so_dien_thoai: textOrNull(c.phone),
      tuoi: ageFromDob(c.dob),                                  // null nếu không có năm sinh
      gioi_tinh: c.gender ? capitalize(c.gender) : null,
      ngay_sinh: c.dob ? formatDob(c.dob) : null,               // DD/MM/YYYY hoặc DD/MM
      tinh_trang_hon_nhan: c.marital_status ? capitalize(c.marital_status) : null,
      cong_viec: textOrNull(c.occupation),
      thu_nhap: textOrNull(c.income),
      noi_thuong_tru: textOrNull(c.residence),
    },
    tu_vi: { // suy từ ngày sinh (âm lịch) — yếu tố văn hoá tham khảo, không phải khách tự khai
      menh: c.menh ? c.menh.replace(/^Mệnh\s+/, '') : null,
      cung: cungOf(c),
      cam_tinh: camTinhOf(c),
    },
    can_ho_quan_tam: {
      du_an: projects,
      loai_can: canonicalAptType(c.apt_type) || null,
      dien_tich_m2: (c.apt_area != null && c.apt_area !== '') ? Number(c.apt_area) : null,
      huong: textOrNull(c.apt_direction),
      tang: (c.apt_floor != null && c.apt_floor !== '') ? Number(c.apt_floor) : null,
      ma_can: textOrNull(c.apt_code),
      ma_toa: textOrNull(c.building_code),
      ngan_sach_khach_co: moneyOrNull(c.finance),               // tiền khách sẵn có
      gia_can_quan_tam: moneyOrNull(c.apt_price),               // giá căn đang nhắm
      muc_dich: textOrNull(c.purpose),                          // Ở / Đầu tư / Cho tặng
    },
    trang_thai_ban_hang: {
      tien_do_cham_soc: c.care_stage || CARE_STAGE_DEFAULT,
      trang_thai_lien_lac: textOrNull(c.contact_status),
      muc_do_quan_tam_phan_tram: (c.interest_level != null) ? c.interest_level : null,
      muc_do_quan_tam_bac: (c.interest_level != null) ? interestTier(c.interest_level).label : null,
      nguon_khach: sourceDisplay(c.source),
    },
    ghi_chu: {
      ghi_chu_tay: ghiChuTay,
      lich_su_cham_soc: lichSuChamSoc,
    },
    ho_so_nang_cao: advanced,
  };
}

// Ghép prompt hoàn chỉnh: phần cố định + JSON khách chèn vào block ```json.
// Dùng mảng dòng .join('\n') để chứa được ký tự ``` mà không phải escape trong template literal.
// TRỌNG TÂM: bám GIAI ĐOẠN CHĂM SÓC hiện tại + ghi chú từng cuộc gọi → gợi ý hành động,
// kịch bản, thời điểm tiếp cận kế tiếp để đẩy khách sang bậc kế, tối ưu chuyển đổi → Booking.
function buildAnalysisPrompt(c) {
  const jsonStr = JSON.stringify(buildAnalysisJSON(c), null, 2);
  // Thang phễu dựng ĐỘNG từ CARE_STAGES (khỏi lệch nếu sau này đổi bộ bậc).
  const ladder = CARE_STAGES.join(' → ') + ` (kèm trạng thái kết thúc "${CARE_STAGE_DROPPED}").`;

  // Tính sẵn bậc hiện tại + bậc KẾ cần đẩy tới → cho LLM tiêu điểm cụ thể.
  const cur = c.care_stage || CARE_STAGE_DEFAULT;
  let nextLine;
  if (cur === CARE_STAGE_DROPPED) {
    nextLine = `Khách đang ở trạng thái "${CARE_STAGE_DROPPED}" (đã ngừng chăm). Hãy đánh giá CÓ NÊN mở lại không; nếu có, bước đầu tiên để khơi lại là gì.`;
  } else {
    const idx = CARE_STAGES.indexOf(cur);
    const i = idx === -1 ? 0 : idx;
    if (i >= CARE_STAGES.length - 1) {
      nextLine = `Khách đã ở bậc cuối "${CARE_STAGES[CARE_STAGES.length - 1]}" — tập trung GIỮ khách & hoàn tất thủ tục, không cần đẩy bậc.`;
    } else {
      nextLine = `Bậc HIỆN TẠI của khách: "${cur}". Bậc KẾ cần đẩy tới: "${CARE_STAGES[i + 1]}". Mốc CHUYỂN ĐỔI trọng tâm của cả phễu: "Booking".`;
    }
  }

  return [
    '### ROLE',
    'Bạn là chuyên gia tư vấn & huấn luyện bán hàng bất động sản với 15 năm kinh nghiệm',
    'tại thị trường Việt Nam, chuyên sâu phân khúc nhà ở xã hội (social housing). Thế mạnh',
    'của bạn là ĐỌC diễn biến chăm sóc qua lịch sử cuộc gọi/ghi chú và vạch nước đi tiếp',
    'theo để ĐẨY khách tiến bậc trong phễu bán hàng, tối ưu tỉ lệ chuyển đổi (conversion).',
    '',
    '### CONTEXT',
    'Tôi là sale đang bán các dự án nhà ở xã hội khu vực Hải Phòng / Hưng Yên. Dưới đây là',
    'dữ liệu một khách hàng lấy từ CRM cá nhân (dạng JSON). Một số trường có thể null vì',
    'khách chưa cung cấp đủ — xử lý linh hoạt, không suy diễn quá đà khi thiếu dữ liệu.',
    '',
    'Phễu chăm sóc của tôi theo thứ tự tăng dần:',
    ladder,
    '"Booking" (khách đặt cọc giữ chỗ) là MỐC CHUYỂN ĐỔI quan trọng nhất tôi đang nhắm tới.',
    nextLine,
    '',
    'Hai trường QUAN TRỌNG NHẤT để bạn bám vào:',
    '- `trang_thai_ban_hang.tien_do_cham_soc`: khách đang ở bậc nào của phễu.',
    '- `ghi_chu.lich_su_cham_soc`: diễn biến qua từng mốc + GHI CHÚ cụ thể mỗi lần gọi/chăm',
    '  (mối bận tâm, lời từ chối, lý do chần chừ...). Đây là tín hiệu thật, hãy trích dẫn lại.',
    '',
    'Dữ liệu khách hàng:',
    '```json',
    jsonStr,
    '```',
    '',
    '### TASK',
    'Phân tích TẬP TRUNG VÀO TIẾN ĐỘ CHUYỂN ĐỔI và trả về:',
    '1. Chẩn đoán giai đoạn: khách đang ở bậc nào, có vẻ đã ở đó bao lâu, và các TÍN HIỆU',
    '   tiến/lùi đọc được từ lịch sử ghi chú — nêu rõ ghi chú/mốc nào cho thấy điều gì, kèm',
    '   độ tin cậy (thấp/trung bình/cao). Kèm 1-2 câu về kiểu ra quyết định của khách nếu suy ra được.',
    '2. Rào cản đang GIỮ khách lại, chưa cho tiến sang bậc kế (đích gần nhất hướng tới "Booking"). Phân',
    '   loại rào cản: tài chính / niềm tin-tâm lý / thiếu thông tin / thời điểm / người ảnh hưởng.',
    '3. HÀNH ĐỘNG TIẾP THEO cụ thể để đẩy khách sang bậc kế — ghi rõ theo nhãn:',
    '   • Kênh (gọi / nhắn Zalo / mời đi xem dự án / gặp trực tiếp)',
    '   • Thời điểm gọi hợp lý (bám công việc & diễn biến gần nhất) + tần suất follow-up',
    '   • Mục tiêu nhỏ CẦN ĐẠT trong lần chạm kế tiếp (1 kết quả đo được, vd hẹn được lịch xem căn)',
    '4. Kịch bản tiếp cận lần tới (hội thoại mẫu, tự nhiên như người thật, không sáo rỗng',
    '   telesale): mở đầu 3-4 câu BÁM ghi chú gần nhất + gọi đúng anh/chị theo giới tính;',
    '   2-3 câu hỏi/câu chốt để nhích khách sang bậc kế; 1 cách xử lý lời từ chối hay gặp ở bậc này.',
    '5. Cảnh báo rớt: dấu hiệu nào cho thấy nên hạ ưu tiên hoặc chuyển "Loại", và mốc thời gian nên xem lại.',
    '',
    '### FORMAT',
    'Trả lời bằng tiếng Việt, heading rõ cho từng mục (1-5). Mục 1, 2, 5 dạng bullet; mục 3',
    'gạch đầu dòng có nhãn như trên; mục 4 trình bày dạng hội thoại mẫu. Bám sát ghi chú THẬT',
    'trong dữ liệu, tránh khuyên chung chung.',
    '',
    '### CONSTRAINTS',
    '- Nếu trường dữ liệu là null/thiếu, ghi rõ "chưa đủ dữ liệu về [X]" thay vì bịa.',
    '- Nếu `lich_su_cham_soc` trống hoặc quá ít: nói rõ chưa đủ dữ liệu để đọc diễn biến, và',
    '  đề xuất bước KHAI THÁC đầu tiên để lấy tín hiệu, thay vì suy đoán tính cách vô căn cứ.',
    '- Không cam kết pháp lý/tài chính thay tôi (lãi suất, điều kiện vay cụ thể) — chỉ gợi ý hướng.',
    '- Toàn bộ chỉ mang tính tham khảo, không thay thế đánh giá trực tiếp của tôi khi gặp khách.',
    '- Giữ câu trả lời dưới 450 từ, thực dụng, đi thẳng vào hành động đẩy chuyển đổi.',
  ].join('\n');
}

$('#detail-ai-export-btn')?.addEventListener('click', () => {
  const c = allCustomers.find((x) => x.id === detailId);
  if (!c) return;
  copyText(buildAnalysisPrompt(c));
  showToast('Đã copy prompt phân tích — dán vào ChatGPT / Claude / Gemini');
});

// ------------------------------------------------- OCR: NHẬP TỪ ẢNH --------
// Gửi ảnh cho Worker (giữ key Gemini) → nhận JSON field → TỰ ĐIỀN form, KHÔNG lưu
// thẳng. Bắt buộc user rà lại (nhất là SĐT) rồi mới bấm Lưu.

// Thu nhỏ ảnh về tối đa maxDim px + nén JPEG. Trả cả base64 (gửi Gemini) lẫn blob
// (lưu vào Storage) — nhẹ payload, nhanh, đỡ quota, tối ưu dung lượng lưu trữ.
async function fileToScaled(file, maxDim = 1600, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return { base64: dataUrl.split(',')[1], blob, mime: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Điền các field OCR trả về vào form (chỉ field có giá trị; bỏ qua giá trị lạ).
function applyOcrToForm(d) {
  if (!d || typeof d !== 'object') return;
  const f = $('#customer-form');
  if (d.phone) f.phone.value = normalizeOcrPhone(d.phone);
  // Tên: viết hoa chữ ĐẦU mỗi từ ("ngo thi minh thu" / "NGO THI MINH THU" → "Ngo Thi Minh Thu").
  if (d.full_name) f.full_name.value = toTitleCaseName(d.full_name);
  if (['nam', 'nữ', 'khác'].includes(d.gender)) f.gender.value = d.gender;
  if (d.dob && /^\d{4}-\d{2}-\d{2}$/.test(d.dob)) setDobInput(d.dob);
  if (['đã kết hôn', 'chưa kết hôn'].includes(d.marital_status)) f.marital_status.value = d.marital_status;
  if (OCCUPATIONS.includes(d.occupation)) f.occupation.value = d.occupation;
  if (d.income) f.income.value = String(d.income).trim();
  if (d.residence) f.residence.value = String(d.residence).trim();
  // Loại căn: khớp option có sẵn bất kể dấu cách/phẩy/gạch ("3N, 2WC" ↔ "3N-2WC");
  // khớp → chọn giá trị chuẩn, không khớp → "Khác" + giữ nguyên chữ OCR.
  // (canonicalAptType giữ '+' để phân biệt "2N+" với "2N"; setFormAptType theo danh sách đang hiện)
  if (d.apt_type) setFormAptType(String(d.apt_type).trim());
  if (d.apt_area != null && Number(d.apt_area) > 0) { f.apt_area.value = Number(d.apt_area); areaAuto = false; } // ảnh ghi rõ → coi như nhập tay
  if (d.apt_code) f.apt_code.value = String(d.apt_code).trim();
  if (d.building_code) f.building_code.value = String(d.building_code).trim();
  if (d.apt_price != null && !isNaN(Number(d.apt_price))) f.apt_price.value = Number(d.apt_price);
  if (d.interest_level != null && !isNaN(Number(d.interest_level))) {
    const lv = Math.max(0, Math.min(100, Math.round(Number(d.interest_level))));
    f.interest_level.value = lv;
    updateInterestUI(lv);
  }
  // Dự án: chỉ chọn tên trùng danh sách có sẵn (tên lạ để user tự thêm).
  if (Array.isArray(d.projects)) {
    for (const name of d.projects) {
      if (projectOptions.some((o) => o.name === name) && !selectedProjects.includes(name)) selectedProjects.push(name);
    }
    renderProjSelect();
  }
  // Thời gian đăng ký = mốc tin nhắn khách gửi cho page. Gemini trả THÔ: giờ (message_time)
  // và ngày/tháng/năm (message_day/month/year) NẾU ảnh có kèm. App tự quy ra ngày cụ thể:
  //  1) Ảnh có ngày (Messenger chỉ kèm ngày khi KHÔNG phải hôm nay) → dùng đúng ngày đó. Năm:
  //     lấy từ ảnh nếu có; không có → năm nay, nhưng nếu ngày đó rơi vào TƯƠNG LAI (vd giờ đang
  //     đầu tháng 1 mà ảnh ghi tháng 12) → lùi 1 năm.
  //  2) Ảnh CHỈ có giờ → mặc định HÔM NAY.
  //  3) Chỉ có giờ mà giờ đó lại MUỘN hơn hiện tại (FB lỗi không kèm ngày) → coi là HÔM QUA.
  if (d.message_time && /^\d{1,2}:\d{2}$/.test(String(d.message_time).trim())) {
    const [hh, mm] = String(d.message_time).trim().split(':').map(Number);
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      const now = new Date();
      const day = Number(d.message_day), mon = Number(d.message_month);
      let cand;
      if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
        let year = Number(d.message_year);
        if (!(year >= 2000 && year <= 2100)) {                 // ảnh không ghi năm → suy
          year = now.getFullYear();
          if (new Date(year, mon - 1, day, hh, mm) > now) year -= 1; // ngày ở tương lai → năm ngoái
        }
        cand = new Date(year, mon - 1, day, hh, mm, 0, 0);
      } else {
        cand = new Date(now); cand.setHours(hh, mm, 0, 0);     // không có ngày → hôm nay
        if (cand > now) cand.setDate(cand.getDate() - 1);      // giờ > hiện tại → hôm qua
      }
      f.registered_at.value = toLocalDatetimeInput(cand);
    }
  }
  // Ghi chú OCR: giữ tạm, sẽ thêm thành 1 note sau khi tạo khách (xem handleFormSubmit).
  pendingOcrNote = (d.note && String(d.note).trim()) || null;
  fillTypicalArea(); // OCR đã chọn loại căn/dự án → tự điền diện tích (nếu ảnh không ghi)
}

// Chuẩn hoá SĐT từ OCR: bỏ ký tự thừa; "+84..." → "0..."; nếu không bắt đầu bằng
// "0" và chưa đủ 10 chữ số thì thêm "0" đầu. (SĐT là master key nên chuẩn hoá bằng
// code cho chắc, không phó thác hẳn cho AI.)
// Chuẩn hoá SĐT (master key) — dùng CHUNG cho OCR lẫn mọi lần lưu khách:
//  - Bỏ dấu cách/chấm/gạch ("0123 456 789" → "0123456789").
//  - "+84..." hoặc "84..."(11 số) → "0...".  - Thiếu "0" đầu → thêm.
//  - Giá trị cuối KHÔNG có dấu cách. Số nước ngoài/khác không khớp → giữ nguyên.
function normalizePhoneVN(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, ''); // giữ chữ số và dấu +
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  p = p.replace(/\D/g, ''); // bỏ nốt dấu + còn sót
  // SĐT VN dạng mã quốc gia thiếu dấu "+": "84" + 9 số = 11 chữ số → đổi "84" thành "0".
  if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
  // Thiếu số 0 đầu (vd "912345678") → thêm vào. Số nước ngoài/khác không khớp → giữ nguyên.
  if (!p.startsWith('0') && p.length < 10) p = '0' + p;
  return p;
}
// Tên cũ giữ làm alias để không phải sửa chỗ gọi trong OCR.
const normalizeOcrPhone = normalizePhoneVN;

// Khoá so trùng TÊN: bỏ khoảng trắng thừa + không phân biệt hoa/thường (GIỮ dấu tiếng
// Việt — tên khác dấu là người khác, không gộp nhầm).
function normalizeNameKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Viết hoa chữ đầu mỗi từ trong tên (giữ dấu tiếng Việt), gộp khoảng trắng thừa.
function toTitleCaseName(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

let lastOcrFile = null; // ảnh OCR gần nhất — để nút "↻ Thử lại" gọi lại khi đọc thất bại
async function handleOcrImage(file) {
  if (!file) return;
  lastOcrFile = file;
  const status = $('#ocr-status');
  const retryBtn = $('#ocr-retry-btn');
  if (retryBtn) retryBtn.hidden = true; // đang thử → giấu nút, chỉ hiện lại nếu lỗi
  const workerUrl = (window.APP_CONFIG.WORKER_URL || '').replace(/\/+$/, '');
  if (!workerUrl) { status.textContent = '⚠️ Chưa cấu hình WORKER_URL.'; return; }
  status.textContent = '⏳ Đang đọc ảnh...';
  $('#ocr-overlay').hidden = false; // lớp phủ hiệu ứng quét (ẩn lại ở finally)
  try {
    // maxDim 1024 (thay vì 1600): nhẹ payload + Gemini xử lý nhanh hơn → đỡ timeout (524).
    const { base64, blob, mime } = await fileToScaled(file, 1024);
    pendingOcrImage = blob; // giữ ảnh nén để lưu thành tài liệu reg_image khi Lưu khách
    const { data: { session } } = await sb.auth.getSession();
    const token = session && session.access_token;
    if (!token) throw new Error('Chưa đăng nhập');
    const res = await fetch(`${workerUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: base64, mime }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) {
      const extra = out.detail ? ` — ${String(out.detail).slice(0, 200)}` : '';
      throw new Error((out.error || `Lỗi ${res.status}`) + extra);
    }
    applyOcrToForm(out.data || {});
    status.textContent = '✅ Đã điền — KIỂM TRA kỹ SĐT rồi mới Lưu.';
  } catch (e) {
    console.warn('OCR lỗi:', e);
    status.textContent = '⚠️ Đọc ảnh thất bại: ' + (e.message || 'lỗi không rõ');
    if (retryBtn && lastOcrFile) retryBtn.hidden = false; // cho thử lại ngay cùng ảnh đó
  } finally {
    $('#ocr-overlay').hidden = true;
  }
}

// ==================== MODAL CHỌN ẢNH (dùng chung: OCR + avatar) ====================
// Mở từ "Nhập từ ảnh" (mode 'ocr') hoặc "Sửa ảnh" (mode 'avatar'). Người dùng chọn file
// / dán ảnh (nút Dán = ảnh mới nhất; Ctrl/Cmd+V / Windows+V / Maccy = CHỌN ảnh cũ, qua
// paste router). Có ảnh → tự ĐÓNG modal + trả ảnh về đúng luồng (OCR hoặc avatar preview).
let imgPickerMode = null; // 'ocr' | 'avatar' | null
function openImagePicker(mode) {
  imgPickerMode = mode;
  const dlg = $('#img-picker');
  $('#imgp-status').textContent = '';
  $('#imgp-file-input').value = '';
  if (!dlg.open) dlg.showModal();
}
function closeImagePicker() {
  const dlg = $('#img-picker');
  if (dlg.open) dlg.close();
}
// Nhận ảnh (từ file / dán) → đóng modal → định tuyến theo mode đang mở.
function onImagePicked(blob) {
  if (!blob) return;
  const mode = imgPickerMode;
  imgPickerMode = null;
  closeImagePicker();
  if (mode === 'ocr') handleOcrImage(blob);
  else if (mode === 'avatar') avatarPreview(blob);
  else if (mode === 'cover') coverPreview(blob);
}
// Nút "Dán ảnh" trong modal: đọc ảnh MỚI NHẤT qua Clipboard API (fallback 1 chạm).
async function imgPickerPasteBtn() {
  const status = $('#imgp-status');
  // App Android: WebView không có quyền đọc clipboard → đọc qua plugin native ClipboardImage.
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && typeof cap.nativePromise === 'function') {
    try {
      const r = await cap.nativePromise('ClipboardImage', 'read', {});
      if (r && r.data) {
        const bin = atob(r.data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        onImagePicked(new Blob([bytes], { type: r.mime || 'image/png' }));
      } else {
        status.textContent = 'ℹ️ Clipboard chưa có ảnh — copy 1 ảnh (hoặc chụp màn hình rồi bấm Sao chép) rồi bấm lại, hoặc dùng "Chọn từ máy".';
      }
      return;
    } catch (e) {
      console.warn('Đọc clipboard (native) lỗi:', e);
      // APK cũ chưa có plugin → rơi xuống cách của trình duyệt bên dưới.
      if (!/not implemented|not available|UNIMPLEMENTED/i.test(String(e && (e.message || e.code || e)))) {
        status.textContent = '⚠️ Không đọc được ảnh trong clipboard — thử "Chọn từ máy".';
        return;
      }
    }
  }
  if (!navigator.clipboard || !navigator.clipboard.read) {
    status.textContent = 'ℹ️ Trình duyệt không đọc được clipboard — dùng Ctrl/Cmd+V.';
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const t = item.types.find((x) => x.startsWith('image/'));
      if (t) { onImagePicked(await item.getType(t)); return; }
    }
    status.textContent = 'ℹ️ Clipboard chưa có ảnh — copy 1 ảnh (hoặc chụp màn hình) rồi bấm lại, hoặc Ctrl/Cmd+V.';
  } catch (e) {
    console.warn('Đọc clipboard lỗi:', e);
    status.textContent = '⚠️ Không đọc được clipboard (chặn quyền?) — thử Ctrl/Cmd+V.';
  }
}

// ------------------------------------------------------------ DETAIL ------

let detailId = null; // khách đang xem ở trang chi tiết
let editingHistoryAt = null; // mốc lịch sử đang sửa note (theo 'at'), null = không sửa
let addingCareNote = false;  // đang mở ô "+ Thêm ghi chú" dưới bậc hiện tại?
let editingNoteAt = null; // ghi chú tự nhập đang sửa (theo 'at'), null = không sửa

// Chuỗi HTML các "chấm" tiến độ: 7 chấm, tô tới bậc hiện tại. Tất cả các chấm đã tô
// mang CÙNG 1 màu = màu của BẬC HIỆN TẠI (vd bậc 4 → 4 chấm cùng màu vàng xanh; bậc 7
// → 7 chấm cùng màu xanh lá). Chấm chưa đạt bậc → xám. Cùng màu với vòng tiến độ ngoài card.
function stageDotsHtml(stage) {
  // Bậc 'Loại' → dấu ✕ đỏ (không vẽ 7 chấm phễu).
  if (stage === CARE_STAGE_DROPPED) return `<span class="stage-x">✕</span>`;
  const level = careLevel(stage);
  const color = careColor(stage);
  let out = '';
  for (let i = 1; i <= 7; i++) {
    out += `<span class="dot" style="background:${i <= level ? color : '#dcd9cf'}"></span>`;
  }
  return out;
}

// 5 chấm mức quan tâm (mỗi chấm ~20%). Chấm đã tô mang MÀU THEO MỐC hiện tại
// (nguội/ấm/nóng/rất nóng) — cùng quy ước màu với tag mức quan tâm ngoài card.
function interestDotsHtml(interest) {
  const filled = Math.round((interest || 0) / 20);
  const color = interestTier(interest).color;
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="dot" style="background:${i <= filled ? color : '#dcd9cf'}"></span>`;
  }
  return out;
}

// Giá VNĐ → "1,2 tỷ" / "800 triệu" cho dễ đọc.
function formatPrice(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' triệu';
  return n.toLocaleString('vi-VN') + ' đ';
}

// "YYYY-MM-DD" → "DD/MM/YYYY".
function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

// Timestamp tương đối kiểu "2 giờ trước" cho "lần cập nhật cuối" trên card.
// Xa hơn 1 tuần thì hiện ngày DD/MM/YYYY cho gọn.
function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return formatDate(iso.slice(0, 10));
}

// Thời điểm cho mốc lịch sử, kiểu "2h30, 30/8/2026" (giờ địa phương).
function formatLogTime(iso) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${dt.getHours()}h${mm}, ${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
}

// Khoảng cách giữa 2 mốc, kiểu "2 ngày 23 giờ" / "3 giờ 15 phút" / "40 phút".
function formatDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return 'chưa tới 1 phút';
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d} ngày ${h} giờ` : `${d} ngày`;
  if (h > 0) return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
  return `${m} phút`;
}

// Viết hoa chữ cái đầu (hiển thị 'nam' → 'Nam').
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const DASH = '—'; // giá trị trống

// RULE hiển thị trang chi tiết: thuộc tính "chưa xác định" (null/rỗng/placeholder gạch)
// thì KHÔNG hiển thị. Dùng chung cho mọi section (cá nhân, căn hộ, và section mới sau này).
function isBlank(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || s === DASH || s === '-' || s === '—';
}
// Render danh sách "Nhãn: giá trị" dạng inline (ngăn nhau bằng ·). Bỏ mục chưa xác định.
// pairs: [[nhãn, giá trị], ...]
function renderInlineKV(el, pairs) {
  el.innerHTML = pairs
    .filter(([, v]) => !isBlank(v))
    .map(([k, v]) => `<span class="pi-item"><span class="pi-label">${k}:</span> ${escapeHtml(String(v))}</span>`)
    .join(' <span class="pi-sep">·</span> ');
}
// Như renderInlineKV nhưng theo NHÓM: mỗi nhóm 1 dòng inline "·", các nhóm cách nhau
// bằng đường ngăn mảnh. Thuộc tính trống → bỏ; cả nhóm rỗng → bỏ luôn dòng (kiểu C).
function renderGroupedKV(el, groups) {
  // value có thể là chuỗi (sẽ escape) HOẶC { html } = HTML tin cậy (đã tự escape phần
  // biến, dùng cho ghi chú nhỏ như "(30 tuổi)" cạnh ngày sinh).
  const isHtmlVal = (v) => v && typeof v === 'object' && typeof v.html === 'string';
  const blank = (v) => isHtmlVal(v) ? v.html.trim() === '' : isBlank(v);
  const valHtml = (v) => isHtmlVal(v) ? v.html : escapeHtml(String(v));
  el.innerHTML = groups
    .map((pairs) => {
      const inner = pairs
        .filter(([, v]) => !blank(v))
        .map(([k, v]) => `<span class="pi-item"><span class="pi-label">${k}:</span> ${valHtml(v)}</span>`)
        .join(' <span class="pi-sep">·</span> ');
      return inner ? `<div class="pi-group">${inner}</div>` : '';
    })
    .join('');
}
// Render bảng KV (mỗi NHÓM = 1 dòng). Nhóm có nhiều cặp → gộp "A | B" trên 1 dòng cho dễ so
// sánh; cặp nào chưa xác định thì bỏ, cả nhóm rỗng thì bỏ luôn dòng đó.
// groups: [ [[nhãn, giá trị], ...], ... ]
function renderTableKV(el, groups) {
  el.innerHTML = groups
    .map((group) => {
      const present = group.filter(([, v]) => !isBlank(v));
      if (!present.length) return '';
      const k = present.map(([l]) => l).join(' | ');
      const v = present.map(([, val]) => val).join(' | ');
      return `<tr><th>${k}</th><td>${escapeHtml(String(v))}</td></tr>`;
    })
    .join('');
}

// Hồ sơ Nâng cao ở trang chi tiết: gộp theo nhóm, mỗi field có giá trị = 1 dòng bảng.
// Field số → hiển thị dạng VNĐ (formatPrice). Ẩn field trống; cả section rỗng → ẩn luôn.
function formatAdvValue(fld, v) {
  if (v == null || String(v).trim() === '') return null;
  return fld.type === 'number' ? formatPrice(v) : String(v);
}
function renderDetailAdvanced(c) {
  const adv = (c && c.advanced && typeof c.advanced === 'object') ? c.advanced : {};
  let html = '', anyShown = false;
  for (const g of ADVANCED_GROUPS) {
    const rows = g.fields
      .map((fld) => [fld.label, formatAdvValue(fld, adv[fld.key])])
      .filter(([, v]) => !isBlank(v));
    if (!rows.length) continue;
    anyShown = true;
    html += `<div class="adv-group-title">${escapeHtml(g.title)}</div>`
      + `<table class="detail-table"><tbody>`
      + rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('')
      + `</tbody></table>`;
  }
  const section = $('#detail-advanced-section');
  if (!anyShown) { section.hidden = true; section.open = false; $('#detail-advanced').innerHTML = ''; return; }
  $('#detail-advanced').innerHTML = html;
  section.hidden = false;
  section.open = false; // luôn gập lại mỗi lần mở khách
}

function openDetail(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!c) return;
  // Lead (lớp 1) chưa có trang hồ sơ riêng → mở hộp "Khách mới" (ghi cuộc gọi / Đạt / Loại).
  if (!isQualified(c)) { openLeadSheet(id); return; }
  detailId = id;
  applyTeamDetail(c); // chỉ xem / nút Giao khách (js/team.js)
  editingHistoryAt = null; // mở khách mới → thoát chế độ sửa note cũ
  addingCareNote = false;  // thoát chế độ thêm ghi chú
  editingTaskAt = null;    // và thoát chế độ sửa/thêm việc

  // Tên + tuổi (chữ nhỏ, không đậm) — tuổi CHỈ hiện khi có năm sinh (YYYY).
  const nameAge = ageFromDob(c.dob);
  $('#detail-name').innerHTML = escapeHtml(c.full_name || '(chưa có tên)')
    + (nameAge != null ? ` <span class="detail-name-age">${nameAge} tuổi</span>` : '');
  renderDetailAvatar(c); // ảnh đại diện (hoặc chữ cái) bên trái tên
  renderDetailCover(c);  // ảnh bìa (hoặc cover mặc định)
  $('#detail-stickybar-name').textContent = c.full_name || '(chưa có tên)';
  $('#detail-stickybar').classList.remove('is-visible'); // mở khách mới → bắt đầu ở đỉnh, ẩn thanh mini
  $('#detail-phone').textContent = c.phone || DASH;
  $('#detail-call-btn').href = c.phone ? `tel:${normalizePhone(c.phone)}` : '#';
  $('#detail-call-btn').dataset.callId = c.id; // js/calls.js: bấm gọi → quay lại app tự mở hộp ghi
  const zaloHref = zaloLink(c.phone);
  const zaloBtn = $('#detail-zalo-btn');
  zaloBtn.href = zaloHref;
  // Link web mở tab mới; link app native (zalo://) mở app tại chỗ (bỏ target để khỏi tab trắng).
  if (zaloHref.startsWith('http')) { zaloBtn.target = '_blank'; zaloBtn.rel = 'noopener'; }
  else { zaloBtn.removeAttribute('target'); zaloBtn.removeAttribute('rel'); }

  // Tiến độ
  $('#detail-stage-dots').innerHTML = stageDotsHtml(c.care_stage);
  $('#detail-stage-dots').style.color = careColor(c.care_stage);
  $('#detail-stage-text').textContent = careLabel(c.care_stage);
  // Trạng thái liên lạc (độc lập; ẩn nếu chưa đặt). Kèm cảnh báo "nghi mất liên lạc".
  const contactBadge = $('#detail-contact-badge');
  if (contactBadge) {
    if (c.contact_status) {
      contactBadge.hidden = false;
      const warn = contactLostWarning(c) ? ' ⚠' : '';
      $('#detail-contact-text').textContent = c.contact_status + warn;
      $('#detail-contact-text').style.color = contactColor(c.contact_status);
      $('#detail-contact-text').title = contactLostWarning(c) ? 'Đã >7 ngày chưa tương tác — kiểm tra lại' : '';
    } else {
      contactBadge.hidden = true;
    }
  }
  // Mức quan tâm
  const interest = c.interest_level ?? 0;
  $('#detail-interest-dots').innerHTML = interestDotsHtml(interest);
  $('#detail-interest-text').textContent = interest + '%';

  // Lịch gọi + badge đếm ngược (bấm badge để "đã gọi"/"hẹn lại").
  renderDetailCall(c);
  renderDetailCalls(c);

  // Ghi chú (note tự động + note tự nhập, dạng bullet)
  editingNoteAt = null;
  renderDetailNotes(c);
  $('#detail-note-add-form').hidden = true;
  $('#detail-note-add-btn').hidden = false;
  $('#detail-note-add-input').value = '';

  // Căn hộ quan tâm — nhóm nhiều cặp gộp 1 dòng ("Mã căn | Mã toà"...) cho dễ so sánh.
  // Cặp/dòng nào chưa xác định thì tự ẩn (xem renderTableKV).
  renderTableKV($('#detail-apt'), [
    [['Dự án', (Array.isArray(c.projects) && c.projects.length) ? c.projects.join(', ') : null]],
    [['Loại căn', canonicalAptType(c.apt_type) || null]],
    [['Diện tích', c.apt_area != null ? c.apt_area + ' m²' : null]],
    [['Hướng', c.apt_direction || null], ['Tầng', c.apt_floor != null ? c.apt_floor : null]],
    [['Mã căn', c.apt_code || null], ['Mã toà', c.building_code || null]],
    [['Ngân sách', formatPrice(c.finance)], ['Giá', formatPrice(c.apt_price)]],
    [['Mục đích', c.purpose || null]],
  ]);
  // Tính khoản vay: đóng bảng tính của khách trước, nạp phương án đã lưu (js/loan/loan-crm.js).
  if (window.LoanCRM) LoanCRM.onOpenDetail(c);

  // Thông tin cá nhân — mỗi mục "Nhãn: giá trị", ngăn nhau bằng dấu · (ẩn mục chưa xác định).
  // Nguồn khách luôn có giá trị (mặc định Quảng cáo) nên luôn hiện.
  renderGroupedKV($('#detail-personal'), [
    [ // Nhóm 1
      ['Giới tính', c.gender ? capitalize(c.gender) : null],
      ['Hôn nhân', c.marital_status ? capitalize(c.marital_status) : null],
    ],
    [ // Nhóm 2: ngày sinh + tử vi (Mệnh, Cung, Cầm tinh — đều suy từ ngày sinh)
      ['Ngày sinh', c.dob ? dobWithAge(c.dob) : null],
      ['Mệnh', c.menh ? c.menh.replace(/^Mệnh\s+/, '') : null],
      ['Cung', cungOf(c)],
      ['Cầm tinh', camTinhOf(c)],
    ],
    [ // Nhóm 3
      ['Công việc', c.occupation || null],
      ['Thu nhập', c.income || null],
      ['Thường trú', c.residence || null],
      ['Nguồn khách', sourceDisplay(c.source)],
      ['Chiến dịch', campaignOf(c) || null],
    ],
  ]);

  // Timeline lịch sử: nút "+ Thêm ghi chú" nay nằm ngay trong bậc hiện tại (xem
  // renderCareHistory) nên không còn khối riêng bên dưới.
  renderCareHistory(c.care_stage_history, c.registered_at || c.created_at);

  // Hồ sơ Nâng cao (gập; chỉ hiện field có giá trị; ẩn cả section nếu trống).
  renderDetailAdvanced(c);

  // Tài liệu (online-only, CHỈ XEM) — nạp danh sách, mục thu gọn mặc định.
  loadDetailDocs(c.id);

  showDetailScreen();
  window.scrollTo(0, 0);
}

// Timeline lịch sử chăm sóc — CẤU TRÚC PHÂN CẤP:
//   • BẬC (care stage) = node cấp cao nhất: chấm + khối tên bậc + timestamp lúc vào bậc.
//   • Mỗi CẬP NHẬT trong bậc = 1 GHI CHÚ con (có timestamp riêng). Note đi kèm lúc đổi
//     bậc là ghi chú đầu tiên của bậc; các lần "+ Thêm ghi chú" sau là ghi chú kế tiếp.
//   • Giữa 2 bậc hiện KHOẢNG THỜI GIAN. Nút "+ Thêm ghi chú" chỉ ở BẬC HIỆN TẠI (mới
//     nhất) — thêm note tạo mốc "bây giờ" nên chỉ thuộc bậc đang ở.
// Bậc ĐẦU TIÊN 'Đăng kí mới' dùng luôn mốc "thời gian đăng ký" (registered_at) làm
// timestamp — không tách riêng node "Bắt đầu đăng ký" nữa (data integrity).
function renderCareHistory(history, registeredAt) {
  const section = $('#detail-history-section');
  const box = $('#detail-history');
  const flat = Array.isArray(history) ? [...history] : [];
  if (flat.length === 0) { section.hidden = true; box.innerHTML = ''; return; }
  section.hidden = false;
  flat.sort((a, b) => (a.at || '').localeCompare(b.at || '')); // thời gian tăng dần

  // GOM thành node theo bậc: đổi bậc → node mới; cùng bậc liên tiếp → gộp làm ghi chú.
  const nodes = [];
  for (const e of flat) {
    const prev = nodes[nodes.length - 1];
    if (prev && prev.stage === e.stage) {
      prev.entries.push(e);
    } else {
      nodes.push({ stage: e.stage, at: e.at, entries: [e] });
    }
  }
  // CHUẨN HOÁ: mọi timeline PHẢI bắt đầu bằng bậc 'Đăng kí mới' tại mốc đăng ký.
  //  • Node đầu đã là 'Đăng kí mới' → chỉ gắn lại mốc = thời gian đăng ký.
  //  • Node đầu KHÁC (khách cũ / tạo thẳng ở bậc cao hơn) → CHÈN 1 node 'Đăng kí mới'
  //    tổng hợp ở đầu. Đây là sửa ở TẦNG HIỂN THỊ (không đổi care_stage_history gốc):
  //    mốc = thời gian đăng ký, kẹp không muộn hơn mốc bậc kế tiếp để khoảng thời gian
  //    giữa 2 bậc không bị âm. (nodes chắc chắn ≥1 vì flat rỗng đã return ở trên.)
  if (nodes[0].stage === CARE_STAGE_DEFAULT) {
    if (registeredAt) nodes[0].at = registeredAt;
  } else {
    let at = registeredAt || nodes[0].at || '';
    if (nodes[0].at && at && at > nodes[0].at) at = nodes[0].at;
    nodes.unshift({ stage: CARE_STAGE_DEFAULT, at, entries: [] });
  }

  let html = '';
  nodes.forEach((node, ni) => {
    const isLast = ni === nodes.length - 1;
    const color = careColor(node.stage);

    // Ghi chú con: mỗi entry CÓ note → 1 dòng ghi chú (kèm timestamp + nút sửa ✎).
    let notesItems = '';
    node.entries.forEach((entry) => {
      const at = escapeHtml(entry.at || '');
      if (entry.at === editingHistoryAt) {
        notesItems += `
          <div class="cs-note cs-note-editing">
            <input class="cs-note-input" type="text" placeholder="Ghi chú..." />
            <button class="btn-small" data-hist-save="${at}">Lưu</button>
            <button class="btn-small" data-hist-cancel="${at}">Huỷ</button>
          </div>`;
      } else if (entry.note) {
        notesItems += `
          <div class="cs-note">
            <span class="cs-note-body">${escapeHtml(entry.note)}</span>
            <span class="cs-note-right"><span class="cs-note-time">${escapeHtml(formatLogTime(entry.at))}</span><button class="cs-note-btn" data-hist-edit="${at}" title="Sửa ghi chú">✎</button></span>
          </div>`;
      }
    });
    // Nút/ô "+ Thêm ghi chú" chỉ ở bậc HIỆN TẠI (node cuối).
    // Đặt TRONG khối ghi chú, căn "＋" thẳng hàng với CHẤM của các note (xem CSS).
    if (isLast) {
      notesItems += addingCareNote
        ? `
          <div class="cs-addnote cs-note-editing">
            <input class="cs-note-input cs-addnote-input" type="text" placeholder="Nhập ghi chú mới cho bậc này..." />
            <button class="btn-small" data-note-add-save>Lưu</button>
            <button class="btn-small" data-note-add-cancel>Huỷ</button>
          </div>`
        : `<button class="cs-note-addbtn" data-note-add>＋ Thêm ghi chú</button>`;
    }
    const notesBlock = notesItems ? `<div class="cs-notes">${notesItems}</div>` : '';

    // Khoảng thời gian tới bậc kế tiếp — DẤU NGẮT (divider) giữa 2 bậc, tách hẳn
    // khỏi cột ghi chú để không bị đọc lướt như 1 note.
    let gapHtml = '';
    if (!isLast) {
      const gap = new Date(nodes[ni + 1].at) - new Date(node.at);
      gapHtml = `<div class="cs-gap"><span class="cs-gap-pill">${CLOCK_SVG} ${escapeHtml(formatDuration(gap))} sau</span></div>`;
    }

    html += `
      <div class="cs-node${isLast ? ' cs-node-last' : ''}" style="--ring:${color}">
        <span class="cs-stage-dot"></span>
        <div class="cs-stage-head">
          <span class="cs-stage">${escapeHtml(node.stage)}</span>
          <span class="cs-stage-time">${escapeHtml(formatLogTime(node.at))}</span>
        </div>
        ${notesBlock}
        ${gapHtml}
      </div>`;
  });
  box.innerHTML = html;

  // Đang SỬA 1 ghi chú → nạp note cũ vào ô + focus (con trỏ cuối chuỗi).
  if (editingHistoryAt) {
    const inp = box.querySelector('.cs-note-input:not(.cs-addnote-input)');
    const entry = flat.find((e) => e.at === editingHistoryAt);
    if (inp) {
      inp.value = entry && entry.note ? entry.note : '';
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }
  // Đang THÊM ghi chú → focus ô nhập.
  if (addingCareNote) {
    const inp = box.querySelector('.cs-addnote-input');
    if (inp) inp.focus();
  }
  // Quyết định timestamp cùng dòng hay xuống dòng cho note timeline (đo sau layout).
  requestAnimationFrame(relayoutNoteTimestamps);
}

// Vẽ lại riêng phần lịch sử của khách đang xem (sau khi đổi trạng thái sửa).
function rerenderCareHistory() {
  const c = allCustomers.find((x) => x.id === detailId);
  renderCareHistory(c ? c.care_stage_history : [], c ? (c.registered_at || c.created_at) : null);
}

// Lưu note đã sửa của 1 mốc rồi vẽ lại.
async function saveHistoryNote(at, note) {
  if (detailId) {
    await CRM.updateCareHistoryNote(detailId, at, note);
    allCustomers = await CRM.list();
  }
  editingHistoryAt = null;
  rerenderCareHistory();
}

// Thêm 1 ghi chú mới cho BẬC HIỆN TẠI (tạo 1 mốc cùng bậc, có timestamp "bây giờ").
async function saveNewCareNote(note) {
  addingCareNote = false;
  if (!detailId || !note) { rerenderCareHistory(); return; } // trống → chỉ đóng ô
  await CRM.addCareLog(detailId, note);
  await refreshList();     // cập nhật mốc "cập nhật cuối" trên card danh sách
  openDetail(detailId);    // vẽ lại chi tiết (timeline + card)
}

// Bấm trong timeline: ✎ → sửa note; Lưu/Huỷ (sửa); + Thêm ghi chú → mở ô; Lưu/Huỷ (thêm).
$('#detail-history')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-hist-edit]');
  if (editBtn) { editingHistoryAt = editBtn.dataset.histEdit; addingCareNote = false; rerenderCareHistory(); return; }
  const saveBtn = e.target.closest('[data-hist-save]');
  if (saveBtn) {
    const inp = $('#detail-history .cs-note-input');
    saveHistoryNote(saveBtn.dataset.histSave, inp ? inp.value.trim() || null : null);
    return;
  }
  const cancelBtn = e.target.closest('[data-hist-cancel]');
  if (cancelBtn) { editingHistoryAt = null; rerenderCareHistory(); return; }
  const addBtn = e.target.closest('[data-note-add]');
  if (addBtn) { addingCareNote = true; editingHistoryAt = null; rerenderCareHistory(); return; }
  const addSaveBtn = e.target.closest('[data-note-add-save]');
  if (addSaveBtn) {
    const inp = $('#detail-history .cs-addnote-input');
    saveNewCareNote(inp ? inp.value.trim() || null : null);
    return;
  }
  const addCancelBtn = e.target.closest('[data-note-add-cancel]');
  if (addCancelBtn) { addingCareNote = false; rerenderCareHistory(); }
});

// Trong ô nhập: Enter = Lưu, Esc = Huỷ (phân biệt ô THÊM và ô SỬA).
$('#detail-history')?.addEventListener('keydown', (e) => {
  if (e.target.classList.contains('cs-addnote-input')) {
    if (e.key === 'Enter') { e.preventDefault(); saveNewCareNote(e.target.value.trim() || null); }
    else if (e.key === 'Escape') { e.preventDefault(); addingCareNote = false; rerenderCareHistory(); }
    return;
  }
  if (!e.target.classList.contains('cs-note-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveHistoryNote(editingHistoryAt, e.target.value.trim() || null); }
  else if (e.key === 'Escape') { e.preventDefault(); editingHistoryAt = null; rerenderCareHistory(); }
});

// ---- Ghi chú: note TỰ ĐỘNG (từ care stage) + note tự nhập (bullet, có ngày giờ) ----
function renderDetailNotes(c) {
  const box = $('#detail-notes');
  const autoEntry = autoNoteEntryFromHistory(c.care_stage_history);
  // Note tự nhập: sắp MỚI NHẤT LÊN TRÊN (tạo sau = cập nhật hơn), theo mốc 'at'.
  const manual = (Array.isArray(c.notes_manual) ? [...c.notes_manual] : [])
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  let html = '';
  // Note tự động lên đầu (mang tính cập nhật nhất), có nhãn "Tự động" + timestamp của
  // mốc care stage tương ứng, không sửa được.
  if (autoEntry) {
    html += `<div class="note-item note-auto">
        <span class="note-bolt" title="Ghi chú tự động">${BOLT_SVG}</span>
        <span class="note-text">${escapeHtml(autoEntry.note)}</span>
        <span class="note-right"><span class="note-auto-label">tự động</span>${autoEntry.at ? `<span class="note-meta">${escapeHtml(formatLogTime(autoEntry.at))}</span>` : ''}</span>
      </div>`;
  }
  // Note tự nhập xếp sau, mới nhất ở trên (db lưu unshift), có ngày giờ + sửa/xoá.
  for (const n of manual) {
    const at = escapeHtml(n.at || '');
    if (n.at === editingNoteAt) {
      // Chế độ sửa: textarea 1 dòng + 3 nút Lưu / Huỷ / Xoá.
      html += `<div class="note-item note-editing">
          <input class="cs-note-input note-edit-input" type="text" placeholder="Nội dung ghi chú..." />
          <div class="note-edit-btns">
            <button class="btn-small btn-primary" data-note-save="${at}">Lưu</button>
            <button class="btn-small" data-note-cancel="${at}">Huỷ</button>
            <button class="btn-small btn-danger" data-note-del="${at}">Xoá</button>
          </div>
        </div>`;
    } else {
      // Dòng ghi chú: [nội dung] [thời gian] [✎ sửa]. Nút xoá chuyển vào trong chế độ sửa.
      html += `<div class="note-item">
          <span class="note-bullet">•</span>
          <span class="note-text">${escapeHtml(n.text || '')}</span>
          <span class="note-right"><span class="note-meta">${escapeHtml(formatLogTime(n.at))}</span><button class="note-act" data-note-edit="${at}" title="Sửa">✎</button></span>
        </div>`;
    }
  }
  box.classList.toggle('is-empty', !autoEntry && manual.length === 0);
  box.innerHTML = (!autoEntry && manual.length === 0) ? 'Chưa có ghi chú.' : html;

  // Đang sửa 1 ghi chú → nạp nội dung cũ vào input + focus.
  if (editingNoteAt) {
    const inp = box.querySelector('.note-edit-input');
    const entry = manual.find((n) => n.at === editingNoteAt);
    if (inp) { inp.value = entry ? (entry.text || '') : ''; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
  // Quyết định timestamp cùng dòng hay xuống dòng (đo sau khi layout xong).
  requestAnimationFrame(relayoutNoteTimestamps);
}

// Với mỗi ghi chú: nếu nội dung + timestamp KHÔNG vừa 1 dòng (phần nội dung bị wrap >1
// dòng khi timestamp nằm cạnh) → cho timestamp XUỐNG DÒNG riêng, canh phải (.ts-stacked).
// Nếu vừa → giữ cùng dòng, timestamp dính lề phải.
function relayoutTimestampRow(item, bodySel, rightSel) {
  item.classList.remove('ts-stacked');
  const body = item.querySelector(bodySel);
  const right = item.querySelector(rightSel);
  if (!body || !right) return;
  // Đo chiều cao 1 DÒNG thực tế bằng span thăm dò — line-height có thể là 'normal'
  // (đọc qua getComputedStyle ra NaN), nên không dựa vào computed lineHeight.
  const probe = document.createElement('span');
  probe.textContent = 'X';
  probe.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap';
  body.appendChild(probe);
  const oneLine = probe.getBoundingClientRect().height || 16;
  body.removeChild(probe);
  if (body.offsetHeight > oneLine * 1.5) item.classList.add('ts-stacked');
}
// Áp cho CẢ phần "Ghi chú" (note tự nhập/tự động) LẪN note trong care timeline.
// Tính lại khi render/đổi cỡ màn hình.
function relayoutNoteTimestamps() {
  const notesBox = $('#detail-notes');
  if (notesBox) notesBox.querySelectorAll('.note-item').forEach((it) => relayoutTimestampRow(it, '.note-text', '.note-right'));
  const histBox = $('#detail-history');
  if (histBox) histBox.querySelectorAll('.cs-note').forEach((it) => relayoutTimestampRow(it, '.cs-note-body', '.cs-note-right'));
}
// Đổi cỡ màn hình khi đang xem chi tiết → tính lại vị trí timestamp trong ghi chú
// (rAF để đo SAU khi trình duyệt reflow theo bề rộng mới).
window.addEventListener('resize', () => {
  if (detailId && !$('#detail-screen').hidden) requestAnimationFrame(relayoutNoteTimestamps);
});

// Vẽ lại card + phần ghi chú chi tiết sau mỗi thay đổi ghi chú.
async function afterNoteChange() {
  await refreshList(); // cập nhật allCustomers + card danh sách (note tự động/thủ công)
  const c = allCustomers.find((x) => x.id === detailId);
  if (c) renderDetailNotes(c);
}

function openNoteAddForm() {
  $('#detail-note-add-form').hidden = false;
  $('#detail-note-add-btn').hidden = true;
  const inp = $('#detail-note-add-input'); inp.value = ''; inp.focus();
}
function closeNoteAddForm() {
  $('#detail-note-add-form').hidden = true;
  $('#detail-note-add-btn').hidden = false;
}
async function saveNewNote(text) {
  const t = (text || '').trim();
  if (t && detailId) { await CRM.addNote(detailId, t); await afterNoteChange(); }
  closeNoteAddForm();
}
async function saveEditNote(at, text) {
  if (detailId) await CRM.updateNote(detailId, at, (text || '').trim() || null); // trống = xoá
  editingNoteAt = null;
  await afterNoteChange();
}
async function deleteNoteEntry(at) {
  if (!confirm('Xoá ghi chú này?')) return;
  editingNoteAt = null; // thoát chế độ sửa (nút Xoá nằm trong đó)
  if (detailId) { await CRM.deleteNote(detailId, at); await afterNoteChange(); }
}

$('#detail-note-add-btn')?.addEventListener('click', openNoteAddForm);
$('#detail-note-add-cancel')?.addEventListener('click', closeNoteAddForm);
$('#detail-note-add-save')?.addEventListener('click', () => saveNewNote($('#detail-note-add-input').value));
$('#detail-note-add-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveNewNote(e.target.value); }
  else if (e.key === 'Escape') { e.preventDefault(); closeNoteAddForm(); }
});

// Bấm trong danh sách ghi chú: ✎ sửa / ✕ xoá / Lưu / Huỷ.
$('#detail-notes')?.addEventListener('click', (e) => {
  const ed = e.target.closest('[data-note-edit]');
  if (ed) { editingNoteAt = ed.dataset.noteEdit; const c = allCustomers.find((x) => x.id === detailId); if (c) renderDetailNotes(c); return; }
  const sv = e.target.closest('[data-note-save]');
  if (sv) { const inp = $('#detail-notes .note-edit-input'); saveEditNote(sv.dataset.noteSave, inp ? inp.value : ''); return; }
  const cn = e.target.closest('[data-note-cancel]');
  if (cn) { editingNoteAt = null; const c = allCustomers.find((x) => x.id === detailId); if (c) renderDetailNotes(c); return; }
  const dl = e.target.closest('[data-note-del]');
  if (dl) { deleteNoteEntry(dl.dataset.noteDel); return; }
});
$('#detail-notes')?.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('note-edit-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveEditNote(editingNoteAt, e.target.value); }
  else if (e.key === 'Escape') { e.preventDefault(); editingNoteAt = null; const c = allCustomers.find((x) => x.id === detailId); if (c) renderDetailNotes(c); }
});

// ------------------------------------------------- TÀI LIỆU (ảnh/PDF) ------
// Online-only: nạp danh sách từ Supabase khi mở chi tiết; xem qua signed URL.
let detailDocs = []; // cache tài liệu của khách đang xem

async function loadDetailDocs(customerId) {
  const toggle = $('#detail-docs-toggle');
  $('#detail-docs-body').hidden = true;
  detailDocs = [];
  if (!CRM.isOnline()) { toggle.textContent = '📎 Tài liệu (cần mạng)'; toggle.disabled = true; return; }
  toggle.disabled = false;
  toggle.textContent = '📎 Đang tải tài liệu...';
  detailDocs = await CRM.listDocuments(customerId);
  toggle.textContent = `📎 Xem tài liệu (${detailDocs.length})`;
  renderDetailDocs();
}

// Trang chi tiết CHỈ XEM (thêm/sửa/xoá tài liệu chuyển sang trang Sửa khách).
function renderDetailDocs() {
  const box = $('#detail-docs');
  if (!detailDocs.length) { box.innerHTML = '<div class="docs-empty">Chưa có tài liệu.</div>'; return; }
  box.innerHTML = detailDocs.map((d) => docItemHtml(d, 'doc')).join('');
}

// HTML 1 dòng tài liệu. prefix='doc' (chi tiết, chỉ Xem) | 'fdoc' (form, Xem + Xoá).
function docItemHtml(d, prefix) {
  const isImg = (d.mime || '').startsWith('image/');
  const kindLabel = DOC_KIND_LABELS[d.kind] || d.kind;
  const sub = [d.label, formatLogTime(d.created_at)].filter(Boolean).join(' · ');
  const delBtn = prefix === 'fdoc' ? `<button type="button" class="doc-del" data-fdoc-del="${d.id}" title="Xoá">✕</button>` : '';
  return `<div class="doc-item">
      <span class="doc-icon">${isImg ? '🖼️' : '📄'}</span>
      <span class="doc-info"><span class="doc-kind">${escapeHtml(kindLabel)}</span>
        <span class="doc-meta">${escapeHtml(sub)}</span></span>
      <button type="button" class="btn-small" data-${prefix}-view="${d.id}">Xem</button>
      ${delBtn}
    </div>`;
}

// Mở 1 tài liệu: ẢNH/PDF → xem trong app (trình xem nhẹ); định dạng khác → mở tab.
async function openDocSigned(doc) {
  if (!doc) return;
  const mime = doc.mime || '';
  const isImg = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  if (isImg || isPdf) { openFileViewer(doc, isImg); return; }
  // Định dạng khác: mở tab trống trước (tránh chặn popup) rồi gán URL.
  const w = window.open('', '_blank');
  const url = await CRM.signedDocUrl(doc.storage_path, 300);
  if (url && w) w.location = url;
  else if (w) { w.close(); alert('Không lấy được link xem (cần mạng?).'); }
}

// Trình xem nhẹ trong app: <img> cho ảnh (kèm zoom tự làm), <iframe> cho PDF
// (trình duyệt tự render + tự có pinch/trackpad/thanh công cụ zoom của nó).
async function openFileViewer(doc, isImg) {
  const dlg = $('#file-viewer');
  const body = $('#file-viewer-body');
  avatarViewerCid = null; $('#fv-avatar-actions').hidden = true; $('#file-viewer-open').hidden = false; // không phải chế độ avatar
  $('#file-viewer-title').textContent = (DOC_KIND_LABELS[doc.kind] || doc.kind) + (doc.label ? ' · ' + doc.label : '');
  $('#file-viewer-open').onclick = null;
  fvImg = null; fvResetZoom();
  $('#fv-zoom').hidden = !isImg;                    // nút +/− chỉ cho ảnh
  body.classList.toggle('fv-zoomable', isImg);      // ảnh: app tự bắt cử chỉ; PDF: để native
  body.innerHTML = '<div class="fv-loading">Đang tải...</div>';
  if (!dlg.open) dlg.showModal();
  const url = await CRM.signedDocUrl(doc.storage_path, 300);
  if (!url) { body.innerHTML = '<div class="fv-loading">Không tải được (cần mạng?).</div>'; return; }
  body.innerHTML = '';
  const el = document.createElement(isImg ? 'img' : 'iframe');
  el.className = isImg ? 'fv-img' : 'fv-pdf';
  el.src = url; // gán qua thuộc tính, không nhúng vào HTML → an toàn
  body.appendChild(el);
  if (isImg) { fvImg = el; fvResetZoom(); }
  $('#file-viewer-open').onclick = () => window.open(url, '_blank');
}

// ==================== ẢNH ĐẠI DIỆN (avatar) ====================
// Chữ cái đại diện = ký tự đầu của TỪ CUỐI trong tên (vd "Lương Thị Đào" → "Đ").
function lastWordInitial(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || '';
  return last ? last[0].toUpperCase() : '?';
}
// Màu nền cho avatar chữ (theo tên) — giúp phân biệt khách với nhau. Tông đất/rêu/son của app.
const AVATAR_COLORS = ['#B0342A', '#3D6B4F', '#B5892F', '#5B7C99', '#8A5A44', '#6B5B95', '#2C6E6B'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ---- Avatar trên CARD / CHI TIẾT ----
// Avatar nằm ở bucket PUBLIC (customer-avatars) → dựng public URL ĐỒNG BỘ (không cần ký,
// trình duyệt tự cache → hiện gần như tức thì, không nháy chữ cái ở lần sau). Vẽ chữ cái
// làm NỀN + ảnh phủ lên; ảnh lỗi (offline/thiếu file) → tự ẩn, lộ lại chữ cái.
function avatarImgTag(path) {
  const url = CRM.avatarUrl(path);
  if (!url) return '';
  return `<img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
}
function cardAvatarMarkup(c) {
  const bg = avatarColor(c.full_name || '');
  const letter = escapeHtml(lastWordInitial(c.full_name));
  const img = c.avatar_path ? avatarImgTag(c.avatar_path) : '';
  return `<div class="card-avatar" style="background:${bg}">${letter}${img}</div>`;
}
function renderDetailAvatar(c) {
  const el = $('#detail-avatar');
  if (!el) return;
  el.style.background = avatarColor(c.full_name || '');
  el.innerHTML = escapeHtml(lastWordInitial(c.full_name)) + (c.avatar_path ? avatarImgTag(c.avatar_path) : '');
}
// Ảnh bìa: có cover_path → hiện ảnh (object-fit cover); không → ẩn ảnh, để lộ cover mặc định (CSS).
function renderDetailCover(c) {
  const img = $('#detail-cover-img');
  if (!img) return;
  const url = c && c.cover_path ? CRM.coverUrl(c.cover_path) : null;
  if (url) { img.src = url; img.hidden = false; }
  else { img.removeAttribute('src'); img.hidden = true; }
}
// Migrate 1 LẦN (theo user + trình duyệt): chuyển file avatar cũ từ bucket private sang
// bucket public. Chạy NỀN, không chặn UI. Chỉ đặt cờ khi đã chạy xong (online) → offline/
// lỗi thì lần đăng nhập online sau tự thử lại. Không có avatar cũ → no-op nhẹ.
async function maybeMigrateAvatars(userId) {
  const key = 'avatars_migrated_v1_' + userId;
  try { if (localStorage.getItem(key)) return; } catch { /* ignore */ }
  if (!CRM.isOnline()) return; // chưa online → để lần sau (chưa đặt cờ)
  try {
    const r = await CRM.migrateAvatarsToPublicBucket();
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    if (r && r.moved > 0) await refreshList(); // vẽ lại card với ảnh ở bucket mới
  } catch (e) { console.warn('maybeMigrateAvatars lỗi:', e); }
}

// ---- Trình xem + ĐỔI ảnh đại diện / ảnh bìa (dùng chung #file-viewer) ----
let avatarViewerCid = null;   // khách đang mở viewer (dùng chung avatar & cover)
let avatarPendingBlob = null; // ảnh vừa chọn (đã nén) chờ Lưu/Huỷ (dùng chung)
let fvEditMode = 'avatar';    // 'avatar' | 'cover' — quyết định nút Lưu/Huỷ/Xoá thao tác gì

function resetAvatarActionsUI() {
  $('#fv-av-choose').hidden = false;
  $('#fv-av-confirm').hidden = true;
  $('#avatar-status').textContent = '';
}
async function openAvatarViewer(customerId) {
  const c = allCustomers.find((x) => x.id === customerId);
  if (!c) return;
  fvEditMode = 'avatar';
  avatarViewerCid = customerId; avatarPendingBlob = null;
  const dlg = $('#file-viewer');
  $('#file-viewer-title').textContent = 'Ảnh đại diện';
  $('#file-viewer-open').onclick = null;
  fvImg = null; fvResetZoom();
  $('#fv-avatar-actions').hidden = false;
  resetAvatarActionsUI();
  $('#avatar-remove-btn').hidden = !c.avatar_path;
  if (!dlg.open) dlg.showModal();
  await showAvatarInViewer(c);
}
// Hiển thị avatar hiện tại trong viewer: ảnh gốc (có zoom) hoặc placeholder chữ cái.
async function showAvatarInViewer(c) {
  const body = $('#file-viewer-body');
  if (c && c.avatar_path) {
    $('#fv-zoom').hidden = false; $('#file-viewer-open').hidden = false;
    body.classList.add('fv-zoomable');
    const url = CRM.avatarUrl(c.avatar_path); // public URL (đồng bộ)
    body.innerHTML = '';
    const el = document.createElement('img'); el.className = 'fv-img'; el.src = url; el.alt = 'Ảnh đại diện';
    el.onerror = () => { if (avatarViewerCid === c.id) body.innerHTML = '<div class="fv-loading">Không tải được (cần mạng?).</div>'; };
    body.appendChild(el); fvImg = el; fvResetZoom();
    $('#file-viewer-open').onclick = () => window.open(url, '_blank');
  } else {
    // chưa có ảnh → placeholder chữ cái to
    $('#fv-zoom').hidden = true; $('#file-viewer-open').hidden = true;
    body.classList.remove('fv-zoomable'); fvImg = null;
    const ph = document.createElement('div');
    ph.className = 'fv-av-placeholder';
    ph.textContent = lastWordInitial(c && c.full_name);
    ph.style.background = avatarColor((c && c.full_name) || '');
    body.innerHTML = ''; body.appendChild(ph);
  }
}
// Chọn/dán 1 ảnh → nén + xem trước + chuyển sang nút Lưu/Huỷ (CHƯA lưu).
async function avatarPreview(file) {
  if (!file) return;
  const status = $('#avatar-status');
  if (!CRM.isOnline()) { status.textContent = '⚠️ Cần mạng để đổi ảnh.'; return; }
  try {
    status.textContent = '⏳ Đang xử lý ảnh...';
    const { blob } = await fileToScaled(file, 512, 0.9); // avatar không cần to; cover ở khung tròn
    avatarPendingBlob = blob;
    const body = $('#file-viewer-body');
    $('#fv-zoom').hidden = true; $('#file-viewer-open').hidden = true;
    body.classList.remove('fv-zoomable'); fvImg = null;
    body.innerHTML = '';
    const img = document.createElement('img'); img.className = 'fv-img'; img.src = URL.createObjectURL(blob);
    body.appendChild(img);
    $('#fv-av-choose').hidden = true; $('#fv-av-confirm').hidden = false;
    status.textContent = 'Xem trước — bấm "Lưu ảnh" để cập nhật.';
  } catch (e) { console.warn('avatar preview lỗi:', e); status.textContent = '⚠️ Không xử lý được ảnh.'; }
}
async function avatarSave() {
  if (!avatarPendingBlob || !avatarViewerCid) return;
  const status = $('#avatar-status');
  status.textContent = '⏳ Đang lưu...';
  try {
    await CRM.uploadAvatar(avatarViewerCid, avatarPendingBlob);
    allCustomers = await CRM.list();
    avatarPendingBlob = null;
    const c = allCustomers.find((x) => x.id === avatarViewerCid);
    if (detailId === avatarViewerCid && c) renderDetailAvatar(c);
    resetAvatarActionsUI();
    $('#avatar-remove-btn').hidden = false;
    await showAvatarInViewer(c);
    status.textContent = '✅ Đã lưu ảnh đại diện.';
  } catch (e) { console.warn('avatar save lỗi:', e); status.textContent = '⚠️ Lưu thất bại: ' + (e.message || 'lỗi'); }
}
async function avatarCancel() {
  avatarPendingBlob = null;
  resetAvatarActionsUI();
  await showAvatarInViewer(allCustomers.find((x) => x.id === avatarViewerCid));
}
async function avatarRemove() {
  if (!avatarViewerCid) return;
  const status = $('#avatar-status');
  status.textContent = '⏳ Đang gỡ...';
  try {
    await CRM.removeAvatar(avatarViewerCid);
    allCustomers = await CRM.list();
    const c = allCustomers.find((x) => x.id === avatarViewerCid);
    if (detailId === avatarViewerCid && c) renderDetailAvatar(c);
    $('#avatar-remove-btn').hidden = true;
    await showAvatarInViewer(c);
    status.textContent = '✅ Đã gỡ ảnh đại diện.';
  } catch (e) { console.warn('avatar remove lỗi:', e); status.textContent = '⚠️ Gỡ thất bại.'; }
}
// ---- ẢNH BÌA (cover) — dùng lại #file-viewer y như avatar, chỉ khác API + tỉ lệ nén ----
async function openCoverViewer(customerId) {
  const c = allCustomers.find((x) => x.id === customerId);
  if (!c) return;
  fvEditMode = 'cover';
  avatarViewerCid = customerId; avatarPendingBlob = null;
  const dlg = $('#file-viewer');
  $('#file-viewer-title').textContent = 'Ảnh bìa';
  $('#file-viewer-open').onclick = null;
  fvImg = null; fvResetZoom();
  $('#fv-avatar-actions').hidden = false;
  resetAvatarActionsUI();
  $('#avatar-remove-btn').hidden = !c.cover_path;
  if (!dlg.open) dlg.showModal();
  await showCoverInViewer(c);
}
async function showCoverInViewer(c) {
  const body = $('#file-viewer-body');
  if (c && c.cover_path) {
    $('#fv-zoom').hidden = false; $('#file-viewer-open').hidden = false;
    body.classList.add('fv-zoomable');
    const url = CRM.coverUrl(c.cover_path);
    body.innerHTML = '';
    const el = document.createElement('img'); el.className = 'fv-img'; el.src = url; el.alt = 'Ảnh bìa';
    el.onerror = () => { if (avatarViewerCid === c.id) body.innerHTML = '<div class="fv-loading">Không tải được (cần mạng?).</div>'; };
    body.appendChild(el); fvImg = el; fvResetZoom();
    $('#file-viewer-open').onclick = () => window.open(url, '_blank');
  } else {
    // chưa có ảnh bìa → hiện thông báo đang dùng cover mặc định
    $('#fv-zoom').hidden = true; $('#file-viewer-open').hidden = true;
    body.classList.remove('fv-zoomable'); fvImg = null;
    body.innerHTML = '<div class="fv-cover-default">Chưa có ảnh bìa — đang dùng cover mặc định.<br>Bấm "Sửa ảnh" để tải ảnh bìa riêng.</div>';
  }
}
async function coverPreview(file) {
  if (!file) return;
  const status = $('#avatar-status');
  if (!CRM.isOnline()) { status.textContent = '⚠️ Cần mạng để đổi ảnh bìa.'; return; }
  try {
    status.textContent = '⏳ Đang xử lý ảnh...';
    const { blob } = await fileToScaled(file, 1280, 0.85); // cover ngang → cần rộng hơn avatar
    avatarPendingBlob = blob;
    const body = $('#file-viewer-body');
    $('#fv-zoom').hidden = true; $('#file-viewer-open').hidden = true;
    body.classList.remove('fv-zoomable'); fvImg = null;
    body.innerHTML = '';
    const img = document.createElement('img'); img.className = 'fv-img'; img.src = URL.createObjectURL(blob);
    body.appendChild(img);
    $('#fv-av-choose').hidden = true; $('#fv-av-confirm').hidden = false;
    status.textContent = 'Xem trước — bấm "Lưu ảnh" để cập nhật.';
  } catch (e) { console.warn('cover preview lỗi:', e); status.textContent = '⚠️ Không xử lý được ảnh.'; }
}
async function coverSave() {
  if (!avatarPendingBlob || !avatarViewerCid) return;
  const status = $('#avatar-status');
  status.textContent = '⏳ Đang lưu...';
  try {
    await CRM.uploadCover(avatarViewerCid, avatarPendingBlob);
    allCustomers = await CRM.list();
    avatarPendingBlob = null;
    const c = allCustomers.find((x) => x.id === avatarViewerCid);
    if (detailId === avatarViewerCid && c) renderDetailCover(c);
    resetAvatarActionsUI();
    $('#avatar-remove-btn').hidden = false;
    await showCoverInViewer(c);
    status.textContent = '✅ Đã lưu ảnh bìa.';
  } catch (e) { console.warn('cover save lỗi:', e); status.textContent = '⚠️ Lưu thất bại: ' + (e.message || 'lỗi'); }
}
async function coverCancel() {
  avatarPendingBlob = null;
  resetAvatarActionsUI();
  await showCoverInViewer(allCustomers.find((x) => x.id === avatarViewerCid));
}
async function coverRemove() {
  if (!avatarViewerCid) return;
  const status = $('#avatar-status');
  status.textContent = '⏳ Đang gỡ...';
  try {
    await CRM.removeCover(avatarViewerCid);
    allCustomers = await CRM.list();
    const c = allCustomers.find((x) => x.id === avatarViewerCid);
    if (detailId === avatarViewerCid && c) renderDetailCover(c);
    $('#avatar-remove-btn').hidden = true;
    await showCoverInViewer(c);
    status.textContent = '✅ Đã gỡ ảnh bìa.';
  } catch (e) { console.warn('cover remove lỗi:', e); status.textContent = '⚠️ Gỡ thất bại.'; }
}

// Bấm vùng cover (trừ 2 nút nổi Quay lại/Sửa) → mở viewer ảnh bìa.
$('#detail-cover')?.addEventListener('click', (e) => {
  if (e.target.closest('.cover-btn')) return;
  if (detailId) openCoverViewer(detailId);
});
$('#detail-avatar')?.addEventListener('click', () => { if (detailId) openAvatarViewer(detailId); });
// Nút trong #file-viewer DÙNG CHUNG cho avatar & cover — định tuyến theo fvEditMode.
$('#avatar-edit-btn')?.addEventListener('click', () => openImagePicker(fvEditMode)); // 'avatar' | 'cover'
$('#avatar-save-btn')?.addEventListener('click', () => (fvEditMode === 'cover' ? coverSave() : avatarSave()));
$('#avatar-cancel-btn')?.addEventListener('click', () => (fvEditMode === 'cover' ? coverCancel() : avatarCancel()));
$('#avatar-remove-btn')?.addEventListener('click', () => (fvEditMode === 'cover' ? coverRemove() : avatarRemove()));

// ---- Zoom cho ảnh trong trình xem ----
const FV_MIN = 1, FV_MAX = 6;
let fvImg = null, fvZoom = 1, fvTx = 0, fvTy = 0;
let fvPinchDist = 0, fvPinchZoom = 1, fvLastMid = null, fvDrag = null;

const fvClamp = (z) => Math.max(FV_MIN, Math.min(FV_MAX, z));
function fvApply() {
  if (fvImg) fvImg.style.transform = `translate(${fvTx}px, ${fvTy}px) scale(${fvZoom})`;
  $('#fv-zoom-pct').textContent = Math.round(fvZoom * 100) + '%';
  $('#file-viewer-body').classList.toggle('fv-pannable', fvZoom > 1);
}
function fvResetZoom() { fvZoom = 1; fvTx = 0; fvTy = 0; fvApply(); }
function fvSetZoom(z) { fvZoom = fvClamp(z); if (fvZoom === FV_MIN) { fvTx = 0; fvTy = 0; } fvApply(); }
function fvDist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
function fvMid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

$('#file-viewer-close')?.addEventListener('click', () => $('#file-viewer').close());
// Bấm nền tối (ngoài nội dung) → đóng
$('#file-viewer')?.addEventListener('click', (e) => { if (e.target.id === 'file-viewer') $('#file-viewer').close(); });
// Đóng → xoá nội dung + reset zoom (dừng tải, nhẹ bộ nhớ)
$('#file-viewer')?.addEventListener('close', () => {
  fvImg = null; $('#file-viewer-body').innerHTML = '';
  $('#fv-avatar-actions').hidden = true; avatarViewerCid = null; avatarPendingBlob = null; // reset chế độ avatar
});

$('#fv-zoom-in')?.addEventListener('click', () => fvSetZoom(fvZoom + 0.5));
$('#fv-zoom-out')?.addEventListener('click', () => fvSetZoom(fvZoom - 0.5));

const fvBody = $('#file-viewer-body');
// Bấm đúp (chuột) → phóng to nhanh / trả về 100%
fvBody?.addEventListener('dblclick', () => { if (fvImg) fvSetZoom(fvZoom > 1 ? 1 : 2.5); });
// Trackpad Mac/Windows: pinch = wheel + ctrlKey → zoom; cuộn 2 ngón khi đã zoom → di chuyển
fvBody?.addEventListener('wheel', (e) => {
  if (!fvImg) return; // PDF: để native lo
  if (e.ctrlKey) { e.preventDefault(); fvSetZoom(fvZoom * Math.exp(-e.deltaY * 0.01)); }
  else if (fvZoom > 1) { e.preventDefault(); fvTx -= e.deltaX; fvTy -= e.deltaY; fvApply(); }
}, { passive: false });
// Cảm ứng Android: 2 ngón tách/chụm = zoom; 1 ngón kéo (khi đã zoom) = di chuyển
fvBody?.addEventListener('touchstart', (e) => {
  if (!fvImg) return;
  if (e.touches.length === 2) { fvPinchDist = fvDist(e.touches); fvPinchZoom = fvZoom; fvLastMid = fvMid(e.touches); e.preventDefault(); }
  else if (e.touches.length === 1 && fvZoom > 1) { fvDrag = { x: e.touches[0].clientX - fvTx, y: e.touches[0].clientY - fvTy }; }
}, { passive: false });
fvBody?.addEventListener('touchmove', (e) => {
  if (!fvImg) return;
  if (e.touches.length === 2) {
    e.preventDefault();
    fvZoom = fvClamp(fvPinchZoom * (fvDist(e.touches) / (fvPinchDist || 1)));
    const m = fvMid(e.touches);
    if (fvLastMid) { fvTx += m.x - fvLastMid.x; fvTy += m.y - fvLastMid.y; }
    fvLastMid = m;
    if (fvZoom === FV_MIN) { fvTx = 0; fvTy = 0; }
    fvApply();
  } else if (e.touches.length === 1 && fvDrag) {
    e.preventDefault();
    fvTx = e.touches[0].clientX - fvDrag.x; fvTy = e.touches[0].clientY - fvDrag.y; fvApply();
  }
}, { passive: false });
fvBody?.addEventListener('touchend', (e) => { if (e.touches.length === 0) { fvDrag = null; fvLastMid = null; } });
// Chuột kéo (desktop) khi đã zoom = di chuyển (biến riêng, không đụng kéo cảm ứng)
let fvMouseDrag = null;
fvBody?.addEventListener('mousedown', (e) => { if (fvImg && fvZoom > 1) { fvMouseDrag = { x: e.clientX - fvTx, y: e.clientY - fvTy }; e.preventDefault(); } });
window.addEventListener('mousemove', (e) => { if (fvMouseDrag) { fvTx = e.clientX - fvMouseDrag.x; fvTy = e.clientY - fvMouseDrag.y; fvApply(); } });
window.addEventListener('mouseup', () => { fvMouseDrag = null; });

$('#detail-docs-toggle')?.addEventListener('click', () => {
  const body = $('#detail-docs-body');
  body.hidden = !body.hidden;
});
$('#detail-docs')?.addEventListener('click', (e) => {
  const v = e.target.closest('[data-doc-view]');
  if (v) openDocSigned(detailDocs.find((d) => d.id === v.dataset.docView));
});

// ---- Tài liệu trong trang SỬA khách: xem + thêm + xoá ----
let formDocs = [];

async function loadFormDocs(customerId) {
  formDocs = [];
  const box = $('#form-docs');
  if (!CRM.isOnline()) { box.innerHTML = '<div class="docs-empty">Cần mạng để xem/sửa tài liệu.</div>'; return; }
  box.innerHTML = '<div class="docs-empty">Đang tải...</div>';
  formDocs = await CRM.listDocuments(customerId);
  renderFormDocs();
}
// Chỉ hiện tài liệu MỚI NHẤT; các tài liệu cũ hơn gập dưới "Mở rộng" (2 chiều).
function renderFormDocs() {
  const box = $('#form-docs');
  if (!formDocs.length) { box.innerHTML = '<div class="docs-empty">Chưa có tài liệu.</div>'; return; }
  const docs = [...formDocs].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const [latest, ...older] = docs;
  box.innerHTML = docItemHtml(latest, 'fdoc') + (older.length ? `
    <details class="form-more">
      <summary><span class="more-open">Xem thêm ${older.length} tài liệu cũ hơn</span><span class="more-close">Thu gọn</span></summary>
      <div class="docs-list">${older.map((d) => docItemHtml(d, 'fdoc')).join('')}</div>
    </details>` : '');
}
async function deleteFormDoc(id) {
  const doc = formDocs.find((d) => d.id === id);
  if (!doc) return;
  if (!confirm(`Xoá tài liệu "${DOC_KIND_LABELS[doc.kind] || doc.kind}"? Không thể hoàn tác.`)) return;
  try { await CRM.deleteDocument(doc); await loadFormDocs(editingId); }
  catch (e) { alert('Xoá tài liệu lỗi: ' + (e.message || e)); }
}
async function handleFormDocUpload(file) {
  if (!file || !editingId) return;
  const status = $('#form-doc-status');
  status.textContent = '⏳ Đang tải lên...';
  try {
    let toUpload = file; // ảnh nén trước cho nhẹ; PDF giữ nguyên
    if ((file.type || '').startsWith('image/')) toUpload = (await fileToScaled(file)).blob;
    await CRM.uploadDocument(editingId, toUpload, 'khac', file.name || null);
    status.textContent = '';
    await loadFormDocs(editingId);
  } catch (e) {
    status.textContent = '⚠️ Tải lên lỗi: ' + (e.message || e);
  } finally {
    $('#form-doc-file').value = '';
  }
}
$('#form-doc-add-btn')?.addEventListener('click', () => $('#form-doc-file').click());
$('#form-doc-file')?.addEventListener('change', (e) => handleFormDocUpload(e.target.files && e.target.files[0]));
$('#form-docs')?.addEventListener('click', (e) => {
  const v = e.target.closest('[data-fdoc-view]');
  if (v) { openDocSigned(formDocs.find((d) => d.id === v.dataset.fdocView)); return; }
  const d = e.target.closest('[data-fdoc-del]');
  if (d) { deleteFormDoc(d.dataset.fdocDel); return; }
});

// ------------------------------------------------- LỊCH GỌI / NHẮC GỌI ----

// Khung giờ preset: [giờ bắt đầu, phút, giờ kết thúc, phút]
const CALL_SLOTS = { '9-10h': [9, 0, 10, 0], '14-15h': [14, 0, 15, 0], '20-21h': [20, 0, 21, 0] };

function isoDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Date → "YYYY-MM-DDTHH:mm" (giờ địa phương) cho input datetime-local.
function toLocalDatetimeInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtClock(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// Thời lượng còn lại: "30p" (<1h) hoặc "2:00" (>=1h)
function fmtRemainMs(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return min + 'p';
  return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
}
function relDayLabel(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd - t) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  return `${dd.getDate()}/${dd.getMonth() + 1}`;
}
function callScheduleLabel(c) {
  if (!c.next_call_at) return '';
  const s = new Date(c.next_call_at);
  const e = c.next_call_end ? new Date(c.next_call_end) : s;
  const tt = fmtClock(s.getTime()) + (e.getTime() !== s.getTime() ? '–' + fmtClock(e.getTime()) : '');
  return relDayLabel(s) + ' ' + tt;
}

// Trạng thái tag nhắc gọi cho 1 khách. null = không hiện tag.
// Giờ gọi là 1 khung (duration): 'due' kéo dài suốt khung + 30 phút sau khi hết.
function callReminder(c) {
  if (!c.next_call_at) return null;
  const start = new Date(c.next_call_at).getTime();
  const end = c.next_call_end ? new Date(c.next_call_end).getTime() : start;
  const now = Date.now();
  const graceEnd = end + 30 * 60000;
  if (now < start) {
    const remain = start - now;
    if (remain > 24 * 3600 * 1000) return null; // >24h: chưa hiện tag
    return { state: 'soon', text: fmtRemainMs(remain) + ' nữa gọi', sort: start };
  }
  if (now <= graceEnd) return { state: 'due', text: 'đến giờ gọi', sort: start };
  return { state: 'missed', text: 'quên gọi ' + fmtClock(start), sort: start };
}

// Vẽ khu "lịch gọi" ở trang chi tiết: nhãn hẹn + nút đặt/đổi/xoá lịch + BADGE đếm
// ngược (giống card). Badge chỉ hiện khi có lịch trong tầm nhắc; bấm → mở hộp
// thoại "đã gọi / hẹn lại". Gọi lại định kỳ để đếm ngược tự cập nhật.
// Khu "Hành động tiếp theo" (lịch gọi) ở trang chi tiết. Có lịch → thẻ phân cấp
// [Hẹn gọi · badge] / [ngày · giờ] / [lý do], bấm cả thẻ để mở hộp thoại Đã gọi /
// Hẹn lại / Huỷ lịch. Chưa có lịch → nút "＋ Đặt lịch gọi".
// Mục "Cuộc gọi" trong hồ sơ: 5 cuộc gần nhất (mới → cũ), kèm nút ghi chú cho cuộc chưa ghi.
function renderDetailCalls(c) {
  const all = callAttemptsOf(c);
  const shown = all.slice(-5);
  const base = all.length - shown.length;
  $('#detail-calls').innerHTML = shown.length
    ? shown.map((a, k) => callAttemptHtml(a, base + k, base + k > 0 ? all[base + k - 1].at : null, 'cách lần trước ')).reverse().join('')
      + (base > 0 ? `<div class="lead-dim">… và ${base} cuộc cũ hơn</div>` : '')
    : '<div class="lead-dim">Chưa có cuộc gọi nào được ghi.</div>';
}
$('#detail-log-call-btn')?.addEventListener('click', () => { if (detailId && window.CallLog) CallLog.open({ customerId: detailId }); });
$('#detail-calls')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-call-at]'); if (!b || !detailId || !window.CallLog) return;
  CallLog.open({ customerId: detailId, editAt: b.dataset.callAt });
});

function renderDetailCall(c) {
  const card = $('#detail-next-action');
  const tasksWrap = $('#detail-tasks-wrap');
  if (c.next_call_at) {
    // CÓ lịch → thẻ nhắc gọi là "next action". Dòng "khi": "Ngày mai · 09:00–10:00".
    const s = new Date(c.next_call_at);
    const e = c.next_call_end ? new Date(c.next_call_end) : s;
    const tt = fmtClock(s.getTime()) + (e.getTime() !== s.getTime() ? '–' + fmtClock(e.getTime()) : '');
    $('#detail-na-when').textContent = relDayLabel(s) + ' · ' + tt;
    const reasonEl = $('#detail-na-reason');
    reasonEl.textContent = c.next_call_reason || '';
    reasonEl.hidden = !c.next_call_reason;
    // Badge trạng thái đếm ngược. Lịch xa >24h → callReminder null → ẩn badge (thẻ vẫn bấm được).
    const rem = callReminder(c);
    const badge = $('#detail-call-badge');
    if (rem) { badge.hidden = false; badge.className = 'call-tag call-' + rem.state; badge.textContent = rem.text; }
    else { badge.hidden = true; }
    card.className = 'next-action' + (rem ? ' na-' + rem.state : ''); // viền trái theo độ gấp
    card.hidden = false;
    tasksWrap.hidden = true;
  } else {
    // CHƯA có lịch → "Việc tiếp theo": danh sách việc tự do.
    card.hidden = true;
    tasksWrap.hidden = false;
    renderDetailTasks(c);
  }
}

// ---- "Việc tiếp theo": danh sách việc tự do (chỉ hiện khi khách chưa có lịch gọi) ----
let editingTaskAt = null; // null = không sửa; 1 'at' = sửa việc đó; 'new' = đang thêm việc mới
function taskEditorHtml(at, isNew) {
  return `<div class="task-item task-editing">
      <textarea class="task-edit-input" rows="2" placeholder="Nội dung việc cần làm..."></textarea>
      <label class="task-due-field">
        <span>Hạn (tuỳ chọn)</span>
        <input type="datetime-local" class="task-due-input" />
        <button type="button" class="task-act" data-task-due-clear title="Bỏ hạn">✕</button>
      </label>
      <div class="task-edit-btns">
        <button class="btn-small btn-primary" data-task-save="${at}">✓ Lưu</button>
        <button class="btn-small btn-danger" data-task-del="${at}">${isNew ? 'Huỷ' : '🗑 Xoá việc'}</button>
      </div>
    </div>`;
}
// Nhãn hạn việc: "Hôm nay · 14:00" + trạng thái: quá hạn (overdue) · trong hôm nay (today).
function taskDueInfo(due) {
  const d = new Date(due);
  if (isNaN(d)) return null;
  const now = new Date();
  const state = d < now ? 'overdue' : (isoDateLocal(d) === isoDateLocal(now) ? 'today' : '');
  return { label: relDayLabel(d) + ' · ' + fmtClock(d.getTime()), state };
}
function renderDetailTasks(c) {
  const box = $('#detail-tasks');
  const tasks = Array.isArray(c.next_tasks) ? c.next_tasks : [];
  let html = '';
  for (const t of tasks) {
    const at = escapeHtml(t.at || '');
    if (t.at === editingTaskAt) {
      html += taskEditorHtml(at, false);
    } else {
      html += `<div class="task-item">
          <span class="task-bullet">•</span>
          <span class="task-body">
            <span class="task-text">${escapeHtml(t.text || '')}</span>
            ${dueHtml(t.due)}
          </span>
          <button class="task-act" data-task-edit="${at}" title="Sửa việc">✎</button>
        </div>`;
    }
  }
  if (editingTaskAt === 'new') html += taskEditorHtml('new', true);
  function dueHtml(due) {
    const info = due && taskDueInfo(due);
    if (!info) return '';
    const pre = info.state === 'overdue' ? 'Quá hạn · ' : 'Hạn: ';
    return `<span class="task-due${info.state ? ' is-' + info.state : ''}">${pre}${escapeHtml(info.label)}</span>`;
  }
  if (!html) html = '<div class="tasks-empty">Chưa có việc nào.</div>';
  box.innerHTML = html;
  // Đang sửa/thêm → nạp nội dung cũ (nếu sửa) + focus, con trỏ cuối chuỗi.
  if (editingTaskAt) {
    const ta = box.querySelector('.task-edit-input');
    if (ta) {
      const entry = tasks.find((t) => t.at === editingTaskAt);
      ta.value = entry ? (entry.text || '') : '';
      const di = box.querySelector('.task-due-input');
      if (di && entry && entry.due && !isNaN(new Date(entry.due))) di.value = toLocalDatetimeInput(new Date(entry.due));
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }
}
function rerenderTasks() {
  const c = allCustomers.find((x) => x.id === detailId);
  if (c) renderDetailTasks(c);
}
async function afterTaskChange() {
  await refreshList(); // cập nhật allCustomers
  const c = allCustomers.find((x) => x.id === detailId);
  if (c) renderDetailCall(c); // vẽ lại khu next action
}
async function saveTask(at, text, dueLocal) {
  const t = (text || '').trim();
  const due = dueLocal ? new Date(dueLocal).toISOString() : null; // datetime-local (giờ máy) → ISO
  if (at === 'new') {
    if (t && detailId) await CRM.addTask(detailId, t, due); // trống → không thêm
  } else if (detailId) {
    await CRM.updateTask(detailId, at, t || null, due); // trống = xoá
  }
  editingTaskAt = null;
  await afterTaskChange();
}
async function deleteTaskEntry(at) {
  if (at === 'new') { editingTaskAt = null; rerenderTasks(); return; } // "Huỷ" thêm mới
  if (!confirm('Xoá việc này?')) return;
  if (detailId) await CRM.deleteTask(detailId, at);
  editingTaskAt = null;
  await afterTaskChange();
}
$('#detail-task-add-btn')?.addEventListener('click', () => { editingTaskAt = 'new'; rerenderTasks(); });
$('#detail-tasks')?.addEventListener('click', (e) => {
  const ed = e.target.closest('[data-task-edit]');
  if (ed) { editingTaskAt = ed.dataset.taskEdit; rerenderTasks(); return; }
  const sv = e.target.closest('[data-task-save]');
  if (sv) {
    const ta = $('#detail-tasks .task-edit-input'), di = $('#detail-tasks .task-due-input');
    saveTask(sv.dataset.taskSave, ta ? ta.value : '', di ? di.value : '');
    return;
  }
  if (e.target.closest('[data-task-due-clear]')) {
    e.preventDefault(); // nằm trong <label> → không mở lại picker
    const di = $('#detail-tasks .task-due-input'); if (di) di.value = '';
    return;
  }
  const dl = e.target.closest('[data-task-del]');
  if (dl) { deleteTaskEntry(dl.dataset.taskDel); return; }
});

// ---- Dialog đặt lịch gọi (dùng chung) ----
let schedulingId = null, schedTime = null, schedDate = null;
function openScheduler(id, preset) { // preset {reason} = lý do gợi ý (nhịp follow-up)
  schedulingId = id; schedTime = null; schedDate = null;
  $$('#sched-time .sched-opt').forEach((b) => b.classList.remove('is-sel'));
  $$('#sched-date .sched-opt').forEach((b) => b.classList.remove('is-sel'));
  const tc = $('#sched-time-custom'), dc = $('#sched-date-custom');
  tc.hidden = true; tc.value = ''; dc.hidden = true; dc.value = '';
  const tm = new Date(); tm.setDate(tm.getDate() + 1); dc.min = isoDateLocal(tm); // custom phải sau hôm nay
  // Lý do gắn với lịch hiện có → nạp lại khi "Đổi lịch"; khách chưa có lịch → trống.
  const c = allCustomers.find((x) => x.id === id);
  $('#sched-reason').value = (preset && preset.reason) || (c && c.next_call_reason) || '';
  $('#sched-error').textContent = '';
  $('#schedule-modal').showModal();
}
async function saveSchedule() {
  const err = $('#sched-error'); err.textContent = '';
  if (!schedTime) { err.textContent = 'Chọn giờ gọi.'; return; }
  if (!schedDate) { err.textContent = 'Chọn ngày gọi.'; return; }
  let base = new Date(); base.setHours(0, 0, 0, 0);
  if (schedDate === 'tomorrow') base.setDate(base.getDate() + 1);
  else if (schedDate === 'custom') {
    const v = $('#sched-date-custom').value;
    if (!v) { err.textContent = 'Chọn ngày cụ thể.'; return; }
    const d = new Date(v + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d <= today) { err.textContent = 'Ngày phải sau hôm nay.'; return; }
    base = d;
  }
  let sh, sm, eh, em;
  if (schedTime === 'custom') {
    const v = $('#sched-time-custom').value;
    if (!v) { err.textContent = 'Nhập giờ cụ thể.'; return; }
    [sh, sm] = v.split(':').map(Number); eh = sh; em = sm; // 1 mốc
  } else { [sh, sm, eh, em] = CALL_SLOTS[schedTime]; }
  const start = new Date(base); start.setHours(sh, sm, 0, 0);
  const end = new Date(base); end.setHours(eh, em, 0, 0);
  // Lịch hẹn phải ở TƯƠNG LAI: lấy mốc KẾT THÚC khung giờ so với hiện tại (vd bây giờ
  // 9:30, hẹn 9–10h hôm nay → mốc 10:00 > 9:30 → hợp lệ). Khung đã kết thúc → chặn.
  if (end.getTime() <= Date.now()) {
    err.textContent = 'Khung giờ này đã qua. Chọn khung giờ kết thúc sau thời điểm hiện tại.';
    return;
  }
  const reason = $('#sched-reason').value.trim() || null; // optional
  await CRM.update(schedulingId, { next_call_at: start.toISOString(), next_call_end: end.toISOString(), next_call_reason: reason });
  await refreshList();
  $('#schedule-modal').close();
  if (detailId && !$('#detail-screen').hidden) openDetail(detailId);
}
$('#sched-time')?.addEventListener('click', (e) => {
  const b = e.target.closest('.sched-opt'); if (!b) return;
  schedTime = b.dataset.time;
  $$('#sched-time .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
  $('#sched-time-custom').hidden = schedTime !== 'custom';
  if (schedTime === 'custom') $('#sched-time-custom').focus();
});
$('#sched-date')?.addEventListener('click', (e) => {
  const b = e.target.closest('.sched-opt'); if (!b) return;
  schedDate = b.dataset.date;
  $$('#sched-date .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
  $('#sched-date-custom').hidden = schedDate !== 'custom';
  if (schedDate === 'custom') $('#sched-date-custom').focus();
});
$('#sched-save')?.addEventListener('click', saveSchedule);
$('#sched-cancel')?.addEventListener('click', () => $('#schedule-modal').close());

// ---- GỢI Ý LỊCH KHI ĐỔI BẬC / VỪA ĐẠT (nhịp theo bậc ở js/followup.js) ----
// Chỉ hỏi khi khách CHƯA có lịch hẹn ở tương lai. 3 nút: đặt lịch gợi ý / chọn giờ khác / bỏ qua.
let fuState = null;
let pendingFollowup = null; // {id, stage} — form lưu xong mới hỏi (sau khi đóng form)
function offerFollowup(id, stage) {
  const c = allCustomers.find((x) => x.id === id);
  if (!c || !window.FOLLOWUP || !isQualified(c)) return;
  if (c.next_call_at && Date.parse(c.next_call_at) > Date.now()) return; // đã có lịch
  const sug = FOLLOWUP.forStage(c, stage || c.care_stage); if (!sug) return;
  fuState = { id, sug };
  $('#fu-sub').textContent = `${c.full_name || ''} · ${careLabel(stage || c.care_stage)}`;
  $('#fu-when').textContent = '📅 ' + sug.label;
  $('#fu-reason').value = sug.reason;
  $('#followup-modal').showModal();
}
$('#fu-accept')?.addEventListener('click', async () => {
  if (!fuState) return;
  const { id, sug } = fuState; fuState = null;
  await CRM.update(id, { next_call_at: sug.start.toISOString(), next_call_end: sug.end.toISOString(), next_call_reason: $('#fu-reason').value.trim() || sug.reason });
  $('#followup-modal').close();
  await refreshList();
  if (detailId === id && !$('#detail-screen').hidden) openDetail(id);
  showToast('Đã hẹn gọi ' + sug.label);
});
$('#fu-change')?.addEventListener('click', () => {
  if (!fuState) return;
  const id = fuState.id; fuState = null;
  const reason = $('#fu-reason').value.trim();
  $('#followup-modal').close();
  openScheduler(id, { reason });
});
$('#fu-skip')?.addEventListener('click', () => { fuState = null; $('#followup-modal').close(); });
$('#fu-close')?.addEventListener('click', () => { fuState = null; $('#followup-modal').close(); });

// ---- Dialog xác nhận gọi (bấm vào tag nhắc gọi) ----
let callActionId = null;
function openCallAction(id) {
  const c = allCustomers.find((x) => x.id === id); if (!c) return;
  callActionId = id;
  $('#callact-title').textContent = 'Gọi: ' + (c.full_name || '(chưa tên)');
  $('#callact-sub').textContent = c.next_call_at ? ('Lịch hẹn: ' + callScheduleLabel(c)) : '';
  const reasonEl = $('#callact-reason');
  reasonEl.textContent = c.next_call_reason ? ('Lý do: ' + c.next_call_reason) : '';
  reasonEl.hidden = !c.next_call_reason;
  $('#callact-note').value = ''; // ô ghi chú luôn trống mỗi lần mở
  $('#call-action-modal').showModal();
}
// Dấu thời gian cho ghi chú hành động gọi: "hh:mm, dd.mm.yyyy" (giờ địa phương).
function callStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}, ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
// Ghi 1 mốc liên hệ MỚI vào care timeline cho 1 HÀNH ĐỘNG (đã gọi / hẹn lại / huỷ gọi).
// GIỮ NGUYÊN bậc hiện tại (forceLog chỉ thêm mốc, vẫn tự đánh số "lần N" khi hiển thị).
// Note = "[hành động] hh:mm, dd.mm.yyyy" + ". [ghi chú]" nếu có (ô ghi chú chung, không bắt
// buộc). Timestamp chốt NGAY lúc bấm. clearSchedule=true → xoá lịch hẹn (đã gọi / huỷ gọi);
// false → giữ lịch để bước hẹn lại tiếp tục (scheduler sẽ ghi đè). Khách chưa đặt bậc (null)
// coi như bậc 1 'Đăng kí mới' để không tạo mốc trống.
async function logCallAction(prefix, clearSchedule) {
  const id = callActionId;
  const c = allCustomers.find((x) => x.id === id);
  const extra = $('#callact-note').value.trim();
  const note = prefix + ' ' + callStamp(new Date()) + (extra ? '. ' + extra : '');
  const stage = (c && c.care_stage) || CARE_STAGE_DEFAULT;
  const payload = { care_stage: stage };
  if (clearSchedule) { payload.next_call_at = null; payload.next_call_end = null; payload.next_call_reason = null; }
  await CRM.update(id, payload, { careStageNote: note, forceLog: true });
  await refreshList();
}
// 3 nút — mỗi nút ghi 1 mốc kèm ghi chú (nếu có), rồi: đã gọi/huỷ gọi → xoá lịch & đóng;
// hẹn lại → giữ lịch, đóng rồi mở scheduler để chọn lịch mới.
$('#callact-done')?.addEventListener('click', async () => {
  await logCallAction('đã gọi', true);
  $('#call-action-modal').close();
  if (detailId && !$('#detail-screen').hidden) openDetail(detailId);
});
$('#callact-cancel')?.addEventListener('click', async () => {
  await logCallAction('huỷ gọi', true);
  $('#call-action-modal').close();
  if (detailId && !$('#detail-screen').hidden) openDetail(detailId);
});
$('#callact-resched')?.addEventListener('click', async () => {
  const id = callActionId;
  await logCallAction('hẹn lại', false);
  $('#call-action-modal').close();
  openScheduler(id);
});
$('#callact-close')?.addEventListener('click', () => $('#call-action-modal').close());
// Bấm thẻ "Hành động tiếp theo" (trang chi tiết) → hộp thoại Đã gọi / Hẹn lại / Huỷ gọi.
$('#detail-next-action')?.addEventListener('click', () => { if (detailId) openCallAction(detailId); });

// Cập nhật đếm ngược định kỳ: danh sách (card) + badge trang chi tiết.
setInterval(() => {
  if (!currentUser) return;
  if (!$('#app-screen').hidden && !$('#list-view').hidden) renderList();
  if (!$('#app-screen').hidden && !$('#lead-view').hidden) renderLeads();
  if (!$('#detail-screen').hidden && detailId) {
    const c = allCustomers.find((x) => x.id === detailId);
    if (c) renderDetailCall(c);
  }
  renderNotifications(); // "đến giờ gọi" tự nổi lên theo thời gian + cập nhật badge
}, 30000);

// ------------------------------------------------- KHÁCH MỚI (LỚP 1) ------
// Lead = khách chưa xác nhận quan tâm (qualified_at trống). Mỗi lần gọi ghi 1 dòng vào
// call_attempts {at, result, note}; khoảng cách giữa các lần + giờ gọi TỰ suy từ `at`.
// Đạt → lớp 2 (trang chủ, có hồ sơ). Loại → giữ kèm lý do để đánh giá campaign/landing.

function leadMatchesFilter(c, ctx = searchCtx(), range = presetRange(leadDatePreset)) {
  if (isQualified(c)) return false;
  if (leadAptTypeFilter && (CRMSearch.apartmentGroup(c.apt_type) || 'missing') !== leadAptTypeFilter) return false;
  const st = leadStatus(c);
  if (leadFilter === 'open' && st === 'dropped') return false;
  if (leadFilter === 'dropped' && st !== 'dropped') return false;
  if (leadSrcFilter && !sourceListOf(c.source).includes(leadSrcFilter)) return false;
  if (range) {
    const t = Date.parse(c.registered_at || c.created_at || '');
    if (isNaN(t) || t < range.start || t >= range.end) return false;
  }
  return matchesSearch(c, ctx);
}

// Khoảng thời gian cho preset Hôm nay / Tuần này / Tháng này (null = tất cả).
function presetRange(p) {
  const now = new Date();
  if (p === 'today') { const s = new Date(now); s.setHours(0, 0, 0, 0); return { start: s.getTime(), end: s.getTime() + 86400000 }; }
  if (p === 'week') { const s = mondayOf(now); const e = new Date(s); e.setDate(e.getDate() + 7); return { start: s.getTime(), end: e.getTime() }; }
  if (p === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() };
  return null;
}
function leadSortCompare(key, a, b) {
  if (key === 'name') return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
  if (key === 'reg') return (a.registered_at || a.created_at || '').localeCompare(b.registered_at || b.created_at || '');
  if (key === 'attempts') return callAttemptsOf(a).length - callAttemptsOf(b).length;
  return 0;
}
// Sắp theo tiêu chí đang chọn (bỏ chọn hết → dùng mặc định). Lịch hẹn gọi ĐẾN GIỜ vẫn đẩy
// lên đầu như tab Tiềm năng.
function orderLeads(list) {
  const keys = leadSort.length ? leadSort : LEAD_DEFAULT_SORT;
  const ctx = searchCtx();
  const arr = [...list].sort((a, b) => {
    const relevance = searchOrder(a,b,ctx); if (relevance) return relevance;
    for (const { key, dir } of keys) {
      const d = leadSortCompare(key, a, b);
      if (d !== 0) return (dir === 'asc' ? 1 : -1) * d;
    }
    return 0;
  });
  const due = (c) => { const r = !c.disqualified_at && callReminder(c); return r && r.state !== 'soon'; };
  return ctx ? arr : [...arr.filter(due), ...arr.filter((c) => !due(c))];
}

function leadStatusTag(c) {
  const st = leadStatus(c);
  if (st === 'dropped') return `<span class="lead-tag lead-tag-dropped">✕ ${escapeHtml(dropReasonLabel(c.disqualify_reason))}</span>`;
  if (st === 'new') return '<span class="lead-tag lead-tag-new">Chưa gọi</span>';
  const n = callAttemptsOf(c).length;
  return `<span class="lead-tag${hasTalked(c) ? ' lead-tag-talked' : ''}">Đã gọi ${n} lần</span>`;
}

function renderLeads() {
  const leads = allCustomers.filter((c) => !isQualified(c) && isMine(c)); // khách mới MÌNH phụ trách
  // Badge tab = VIỆC CẦN LÀM NGAY: lead đăng ký HÔM QUA + HÔM NAY, chưa loại, CHƯA GỌI lần nào (gọi sớm dễ bắt máy).
  // Gọi xong → số giảm; hết → badge ẩn. (Đếm hết lead làm số luôn to → bị "nhờn", mất tác dụng nhắc.)
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 1); // 0h hôm qua
  const urgent = leads.filter((c) => !c.disqualified_at && !callAttemptsOf(c).length
    && Date.parse(c.registered_at || c.created_at || '') >= since.getTime()).length;
  const badge = $('#lead-count-badge');
  if (badge) {
    badge.textContent = urgent > 99 ? '99+' : String(urgent);
    badge.hidden = urgent === 0;
    badge.title = `${urgent} khách đăng ký hôm qua/hôm nay chưa gọi`;
  }
  const tabBadge = $('#cust-tab-badge'); // cùng số trên tab Khách hàng (nhìn thấy từ Tổng quan)
  if (tabBadge) { tabBadge.textContent = badge ? badge.textContent : String(urgent); tabBadge.hidden = urgent === 0; tabBadge.title = badge ? badge.title : ''; }
  if (!$('#cust-subtabs').hidden) syncCustSubtabs();
  const view = $('#lead-view');
  if (!view || view.hidden) return; // tab đang ẩn → chỉ cập nhật badge

  const ctx = searchCtx(), range = presetRange(leadDatePreset);
  const fullList = orderLeads(leads.filter((c) => leadMatchesFilter(c, ctx, range)));
  const list = fullList.slice(0, searchPages.leads * SEARCH_PAGE_SIZE);
  syncLeadFilterUI();
  $('#lead-result-count').textContent = `${fullList.length} khách · Khách mới${searchCtx() ? ' · theo độ liên quan' : ''}`;
  $('#lead-search-more').hidden = list.length >= fullList.length;
  $('#lead-search-more').textContent = `Xem thêm (${fullList.length - list.length} khách)`;
  $('#lead-empty').hidden = list.length !== 0;
  $('#lead-list').innerHTML = list.map((c) => {
    const attempts = callAttemptsOf(c);
    const last = attempts[attempts.length - 1];
    const rem = (c.disqualified_at || !isMine(c)) ? null : callReminder(c);
    const meta = [
      sourceDisplay(c.source),
      campaignOf(c),
      (Array.isArray(c.projects) && c.projects.length) ? c.projects.join(', ') : '',
      c.apt_type ? canonicalAptType(c.apt_type) : '',
    ].filter(Boolean).map(escapeHtml).join(' · ');
    const lastLine = last
      ? `Lần cuối: ${escapeHtml(callResultLabel(last))}${last.duration != null ? ' · ' + escapeHtml(formatCallDuration(last.duration)) : ''} · ${escapeHtml(timeAgo(last.at))}`
      : `Đăng ký ${escapeHtml(timeAgo(c.registered_at || c.created_at))}`;
    const zaloHref = zaloLink(c.phone);
    const zaloAttr = zaloHref.startsWith('http') ? 'target="_blank" rel="noopener"' : '';
    return `
      <div tabindex="0" class="lead-card${c.disqualified_at ? ' is-dropped' : ''}" data-id="${c.id}">
        <div class="card-head">
          <div class="card-name">${hlName(c, ctx)}</div>
          <div class="card-head-right">
            ${ownerTagHtml(c)}
            ${rem ? `<span class="call-tag call-${rem.state}">${escapeHtml(rem.text)}</span>` : ''}
            ${leadStatusTag(c)}
          </div>
        </div>
        <div class="phone-row">
          <span class="phone-number">${hlPhone(c, ctx)}</span>
          <a class="card-phone" href="tel:${normalizePhone(c.phone)}" data-call-id="${c.id}" aria-label="Gọi ${escapeHtml(c.phone || '')}">${PHONE_SVG}</a>
          <a class="card-zalo" href="${zaloHref}" ${zaloAttr} data-id="${c.id}" aria-label="Nhắn Zalo"><img class="ic-zalo" src="/icons/zalo.png" alt="Zalo" /></a>
        </div>
        ${meta ? `<div class="lead-card-meta">${meta}</div>` : ''}
        ${snipsHtml(c, ctx, 'card-snip')}
        <div class="lead-card-last">${lastLine}</div>
      </div>`;
  }).join('');
}

// ---- Hộp chi tiết lead ----
let leadSheetId = null, leadDropReason = null;

function openLeadSheet(id) {
  const c = allCustomers.find((x) => x.id === id); if (!c) return;
  leadSheetId = id; leadDropReason = null;
  renderLeadSheet(c);
  const dlg = $('#lead-modal');
  if (!dlg.open) dlg.showModal();
}

function renderLeadSheet(c) {
  const dropped = !!c.disqualified_at;
  applyTeamLead(c); // chỉ xem / nút Giao khách (js/team.js)
  $('#lead-name').textContent = c.full_name || '(chưa có tên)';
  $('#lead-phone').textContent = c.phone || '';
  $('#lead-call-btn').href = c.phone ? `tel:${normalizePhone(c.phone)}` : '#';
  $('#lead-call-btn').dataset.callId = c.id;
  $('#lead-call-btn').innerHTML = PHONE_SVG;
  const zb = $('#lead-zalo-btn');
  zb.href = zaloLink(c.phone); zb.dataset.id = c.id;
  // Thông tin nhanh: kênh, chiến dịch, cách nhập, dự án, loại căn, thời gian đăng ký.
  const reg = c.registered_at || c.created_at;
  const rows = [
    ['Kênh', sourceDisplay(c.source)],
    ['Chiến dịch', campaignOf(c)],
    ['Dự án', (Array.isArray(c.projects) && c.projects.length) ? c.projects.join(', ') : ''],
    ['Căn quan tâm', [c.apt_type ? canonicalAptType(c.apt_type) : '', c.apt_code || ''].filter(Boolean).join(' · ')],
    ['Đăng ký', reg ? formatLogTime(reg) : ''], // giờ + ngày cụ thể (thẻ ngoài danh sách đã có "… trước")
  ].filter(([, v]) => v);
  $('#lead-meta').innerHTML = rows.map(([k, v]) => `<div><span class="lead-k">${escapeHtml(k)}</span> ${escapeHtml(v)}</div>`).join('');

  const dropEl = $('#lead-dropped');
  dropEl.hidden = !dropped;
  if (dropped) {
    dropEl.innerHTML = `<b>Đã loại:</b> ${escapeHtml(dropReasonLabel(c.disqualify_reason))}` +
      (c.disqualify_note ? ` — ${escapeHtml(c.disqualify_note)}` : '') +
      ` <span class="lead-dim">(${escapeHtml(formatLogTime(c.disqualified_at))})</span>`;
  }

  // Nhật ký gọi: lần N · giờ gọi · kết quả · cách lần trước (lần 1: cách lúc đăng ký).
  const attempts = callAttemptsOf(c);
  $('#lead-attempts').innerHTML = attempts.length
    ? attempts.map((a, i) => callAttemptHtml(a, i, i === 0 ? reg : attempts[i - 1].at, i === 0 ? 'sau đăng ký ' : 'cách lần trước ')).join('')
    : '<div class="lead-dim">Chưa gọi lần nào.</div>';

  // Gợi ý loại khi gọi nhiều lần không được.
  const sug = $('#lead-suggest');
  const done = attempts.filter((a) => a.result); // chỉ tính cuộc đã ghi kết quả
  const showSug = !dropped && done.length >= LEAD_UNREACHABLE_SUGGEST && !hasTalked(c);
  sug.hidden = !showSug;
  if (showSug) {
    sug.innerHTML = `Đã gọi ${done.length} lần chưa liên lạc được. <button type="button" class="btn-small" id="lead-suggest-drop">Loại: Không liên lạc được</button>`;
  }

  // Nút ghi cuộc gọi (ẩn khi đã loại) → hộp dùng chung js/calls.js.
  $('#lead-log-box').hidden = dropped;
  $('#lead-drop-box').hidden = true;

  // Thông tin đăng ký (vd landing page ghi vào notes) + ghi chú tự nhập + ghi chú cũ trong timeline.
  const notes = [];
  if (c.notes) notes.push(escapeHtml(c.notes));
  for (const n of (Array.isArray(c.notes_manual) ? c.notes_manual : [])) if (n && n.text) notes.push(escapeHtml(n.text));
  for (const h of (Array.isArray(c.care_stage_history) ? c.care_stage_history : [])) if (h && h.note) notes.push(escapeHtml(h.note));
  $('#lead-notes').innerHTML = notes.length ? '<div class="sched-label">Ghi chú</div>' + notes.map((t) => `<div class="lead-note">• ${t}</div>`).join('') : '';

  // Nút: Đạt chỉ bật khi đã có lần "Nói chuyện được".
  const canQualify = hasTalked(c);
  $('#lead-qualify-btn').hidden = dropped;
  // Chưa đủ điều kiện → "khoá mềm" (KHÔNG dùng disabled: nút disabled không nhận hover/bấm). Lời nhắc
  // hiện khi rê chuột (máy tính) hoặc bấm vào (máy tính + điện thoại) — xem CSS .lead-act-qualify.is-locked.
  const qb = $('#lead-qualify-btn');
  qb.classList.toggle('is-locked', !canQualify);
  qb.classList.remove('tip-open');
  qb.setAttribute('aria-disabled', String(!canQualify));
  $('#lead-drop-btn').hidden = dropped;
  $('#lead-reopen-btn').hidden = !dropped;
}

function currentLead() { return allCustomers.find((x) => x.id === leadSheetId); }
async function afterLeadChange() {
  await refreshList();
  const c = currentLead();
  if (c && $('#lead-modal').open) renderLeadSheet(c);
}


async function qualifyLead() {
  const c = currentLead(); if (!c || !hasTalked(c)) return;
  const n = callAttemptsOf(c).length;
  await CRM.update(c.id, {
    qualified_at: new Date().toISOString(),
    care_stage: QUALIFIED_STAGE,
    // Đạt → mức quan tâm lên mốc bậc 'Đang chăm sóc' (60%), giữ nếu đang cao hơn.
    interest_level: Math.max(c.interest_level || 0, STAGE_INTEREST[QUALIFIED_STAGE]),
    disqualified_at: null, disqualify_reason: null, disqualify_note: null,
  }, { careStageNote: `Đạt — xác nhận quan tâm sau ${n} lần gọi` });
  $('#lead-modal').close();
  await refreshList();
  showToast('Đã chuyển vào danh sách chăm sóc');
  openDetail(c.id);
  offerFollowup(c.id, QUALIFIED_STAGE); // gợi ý cuộc gọi đầu tiên ở lớp chăm sóc
}

function showDropBox(preset) {
  leadDropReason = preset || null;
  const all = Object.keys(LEAD_DROP_REASONS);
  const order = [...LEAD_DROP_TOP, ...all.filter((k) => !LEAD_DROP_TOP.includes(k))];
  $('#lead-reason-opts').innerHTML = order.map((k) =>
    `<button type="button" class="sched-opt${LEAD_DROP_TOP.includes(k) ? ' is-top' : ''}${leadDropReason === k ? ' is-sel' : ''}" data-reason="${k}">${escapeHtml(LEAD_DROP_REASONS[k])}</button>`).join('');
  $('#lead-drop-note').value = '';
  $('#lead-drop-error').textContent = '';
  $('#lead-drop-box').hidden = false;
  $('#lead-log-box').hidden = true;
  $('#lead-drop-box').scrollIntoView({ block: 'nearest' });
}

async function saveLeadDrop() {
  const c = currentLead(); if (!c) return;
  const note = $('#lead-drop-note').value.trim() || null;
  if (!leadDropReason) { $('#lead-drop-error').textContent = 'Chọn lý do loại.'; return; }
  if (leadDropReason === 'khac' && !note) { $('#lead-drop-error').textContent = 'Lý do “Khác” cần mô tả thêm.'; return; }
  await CRM.update(c.id, {
    disqualified_at: new Date().toISOString(),
    disqualify_reason: leadDropReason,
    disqualify_note: note,
    next_call_at: null, next_call_end: null, next_call_reason: null,
  });
  $('#lead-modal').close();
  await refreshList();
  showToast('Đã loại — vẫn lưu để đánh giá campaign');
}

async function reopenLead() {
  const c = currentLead(); if (!c) return;
  await CRM.update(c.id, { disqualified_at: null, disqualify_reason: null, disqualify_note: null });
  await afterLeadChange();
}

$('#lead-list')?.addEventListener('click', (e) => {
  if (e.target.closest('a')) return; // gọi / Zalo → để link chạy bình thường
  const card = e.target.closest('.lead-card');
  if (card) openLeadSheet(card.dataset.id);
});
// ---- Thanh công cụ tab Khách mới (cùng kiểu tab Tiềm năng) ----
const LEAD_POPS = [['#lead-status-pop', '#lead-status-btn'], ['#lead-filter-panel', '#lead-filter-btn'], ['#lead-sort-panel', '#lead-sort-btn']];
function closeLeadPops(except) {
  for (const [pop, btn] of LEAD_POPS) {
    if (pop === except) continue;
    $(pop).hidden = true; $(btn).classList.remove('is-open'); $(btn).setAttribute('aria-expanded', 'false');
  }
}
function toggleLeadPop(pop, btn) {
  const willOpen = $(pop).hidden;
  closeLeadPops(pop);
  $(pop).hidden = !willOpen; $(btn).classList.toggle('is-open', willOpen); $(btn).setAttribute('aria-expanded', String(willOpen));
}
function syncLeadFilterUI() {
  renderAptTypeFilter('lead-apt-presets', leadAptTypeFilter);
  $('#lead-src-presets').innerHTML = [['', 'Tất cả'], ...Object.entries(SOURCES)].map(([code, label]) =>
    `<button type="button" class="date-preset${code === leadSrcFilter ? ' is-sel' : ''}" data-src="${code}">${escapeHtml(label)}</button>`).join('');
  $$('#lead-date-presets .date-preset').forEach((b) => b.classList.toggle('is-sel', b.dataset.preset === leadDatePreset));
  const active = !!leadSrcFilter || leadDatePreset !== 'all' || !!leadAptTypeFilter;
  $('#lead-filter-dot').hidden = !active;
  $('#lead-clear-filter').hidden = !active;
}
function resetLeadFilters() { leadSrcFilter = ''; leadDatePreset = 'all'; leadAptTypeFilter = ''; resetSearchPages(); renderLeads(); }
function renderLeadSortOptions() {
  $('#lead-sort-options').innerHTML = LEAD_SORT_ATTRS.map((a) => {
    const dir = leadSortDraft[a.key];
    return `<div class="sort-row">
        <span class="sort-row-name">${a.name}</span>
        <span class="sort-tris" data-key="${a.key}">
          <button type="button" class="tri-btn tri-up${dir === 'asc' ? ' is-on' : ''}" data-dir="asc" aria-label="${a.name} tăng"></button>
          <button type="button" class="tri-btn tri-down${dir === 'desc' ? ' is-on' : ''}" data-dir="desc" aria-label="${a.name} giảm"></button>
        </span>
      </div>`;
  }).join('');
}
$('#lead-status-btn')?.addEventListener('click', (e) => { e.stopPropagation(); toggleLeadPop('#lead-status-pop', '#lead-status-btn'); });
$('#lead-status-pop')?.addEventListener('click', (e) => {
  const opt = e.target.closest('.status-opt'); if (!opt) return;
  e.stopPropagation();
  leadFilter = opt.dataset.value;
  $('#lead-status-label').textContent = opt.textContent;
  $$('#lead-status-pop .status-opt').forEach((o) => o.classList.toggle('is-sel', o === opt));
  closeLeadPops();
  renderLeads();
});
$('#lead-filter-btn')?.addEventListener('click', (e) => { e.stopPropagation(); toggleLeadPop('#lead-filter-panel', '#lead-filter-btn'); });
$('#lead-filter-panel')?.addEventListener('click', (e) => {
  e.stopPropagation(); // panel render lại nút → giữ panel mở
  const apt = e.target.closest('[data-apt-group]');
  if (apt) { leadAptTypeFilter = apt.dataset.aptGroup; resetSearchPages(); renderLeads(); return; }
  const src = e.target.closest('[data-src]');
  if (src) { leadSrcFilter = src.dataset.src; renderLeads(); return; }
  const d = e.target.closest('[data-preset]');
  if (d) { leadDatePreset = d.dataset.preset; renderLeads(); }
});
$('#lead-filter-apply')?.addEventListener('click', () => closeLeadPops());
$('#lead-filter-reset')?.addEventListener('click', resetLeadFilters);
$('#lead-clear-filter')?.addEventListener('click', resetLeadFilters);
$('#lead-sort-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if ($('#lead-sort-panel').hidden) { leadSortDraft = Object.fromEntries(leadSort.map((x) => [x.key, x.dir])); renderLeadSortOptions(); }
  toggleLeadPop('#lead-sort-panel', '#lead-sort-btn');
});
$('#lead-sort-panel')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const tri = e.target.closest('.tri-btn'); if (!tri) return;
  const key = tri.closest('.sort-tris').dataset.key, dir = tri.dataset.dir;
  if (leadSortDraft[key] === dir) delete leadSortDraft[key]; else leadSortDraft[key] = dir;
  renderLeadSortOptions();
});
$('#lead-sort-apply')?.addEventListener('click', () => {
  leadSort = LEAD_SORT_ATTRS.filter((a) => leadSortDraft[a.key]).map((a) => ({ key: a.key, dir: leadSortDraft[a.key] }));
  closeLeadPops(); renderLeads();
});
$('#lead-sort-reset')?.addEventListener('click', () => {
  leadSort = LEAD_DEFAULT_SORT.map((x) => ({ ...x }));
  leadSortDraft = Object.fromEntries(leadSort.map((x) => [x.key, x.dir]));
  renderLeadSortOptions(); renderLeads();
});
// Bấm ra ngoài → đóng mọi pop của tab Khách mới.
document.addEventListener('click', (e) => { if (!e.target.closest('#lead-view .tool-pop')) closeLeadPops(); });
$('#add-lead-btn')?.addEventListener('click', () => openForm(null));
$('#add-dash-btn')?.addEventListener('click', () => openForm(null));
$('#lead-reason-opts')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-reason]'); if (!b) return;
  leadDropReason = b.dataset.reason;
  $$('#lead-reason-opts .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
  $('#lead-drop-error').textContent = '';
});
$('#lead-log-call-btn')?.addEventListener('click', () => { if (leadSheetId && window.CallLog) CallLog.open({ customerId: leadSheetId }); });
$('#lead-attempts')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-call-at]'); if (!b || !leadSheetId || !window.CallLog) return;
  CallLog.open({ customerId: leadSheetId, editAt: b.dataset.callAt });
});
$('#lead-qualify-btn')?.addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (b.classList.contains('is-locked')) {
    // Bấm khi chưa đủ điều kiện → bật bong bóng nhắc vài giây.
    b.classList.add('tip-open');
    clearTimeout(b._tipTimer);
    b._tipTimer = setTimeout(() => b.classList.remove('tip-open'), 3000);
    return;
  }
  qualifyLead();
});
$('#lead-drop-btn')?.addEventListener('click', () => showDropBox(null));
$('#lead-suggest')?.addEventListener('click', (e) => { if (e.target.closest('#lead-suggest-drop')) showDropBox('khong_lien_lac_duoc'); });
$('#lead-drop-cancel')?.addEventListener('click', () => { $('#lead-drop-box').hidden = true; $('#lead-log-box').hidden = false; });
$('#lead-drop-save')?.addEventListener('click', saveLeadDrop);
$('#lead-reopen-btn')?.addEventListener('click', reopenLead);
$('#lead-edit-btn')?.addEventListener('click', () => { const id = leadSheetId; $('#lead-modal').close(); openForm(id); });
$('#lead-close')?.addEventListener('click', () => $('#lead-modal').close());

// ------------------------------------------ TÌM NHANH Ở TỔNG QUAN ------
// Kết quả gộp 2 lớp: Tiềm năng (đã xác nhận) và Khách mới (lead) — kể cả khách đã xong/đã
// loại (có nhãn). Bấm 1 khách → chuyển sang ĐÚNG tab của khách đó và mở khách luôn.
const DASH_SEARCH_LIMIT = 30; // mỗi nhóm
function dashSearchRow(c) {
  const lead = !isQualified(c);
  let tag;
  if (lead) tag = leadStatusTag(c);
  else if (c.care_stage === CARE_STAGE_DROPPED) tag = `<span class="lead-tag lead-tag-dropped">✕ ${escapeHtml(careLabel(c.care_stage))}</span>`;
  else if (c.care_stage === 'Kí HĐMB') tag = '<span class="tag tag-won">✓ Đã chốt</span>';
  else tag = `<span class="lead-tag">${escapeHtml(careLabel(c.care_stage))}</span>`;
  const meta = [sourceDisplay(c.source), (Array.isArray(c.projects) && c.projects.length) ? c.projects.join(', ') : '']
    .filter(Boolean).map(escapeHtml).join(' · ');
  const dim = c.disqualified_at || isCareDone(c.care_stage);
  const ctx = searchCtx(); // từ khoá: chữ → tô tên + đoạn trích; toàn số → tô SĐT
  return `<button type="button" class="search-row${dim ? ' is-dim' : ''}" data-search-open="${c.id}">
      <span class="search-row-main">
        <span class="search-row-name">${hlName(c, ctx)}</span>
        <span class="search-row-meta">${hlPhone(c, ctx)}${meta ? ' · ' + meta : ''}</span>
        ${snipsHtml(c, ctx, 'search-row-snip')}
      </span>
      ${tag}
    </button>`;
}
function renderDashSearch() {
  const ctx = searchCtx();
  const hits = allCustomers.filter((c) => matchesSearch(c, ctx));
  // Đang chăm/cần gọi lên trước, đã xong/đã loại xuống cuối; trong nhóm: tên A→Z.
  const order = (a, b) => searchOrder(a, b, ctx) || (Number(!!a.disqualified_at || isCareDone(a.care_stage)) - Number(!!b.disqualified_at || isCareDone(b.care_stage)))
    || (a.full_name || '').localeCompare(b.full_name || '', 'vi');
  const groups = [
    ['Đang chăm', hits.filter((c) => isMine(c) && isQualified(c)).sort(order), 'qualified'],
    ['Khách mới', hits.filter((c) => isMine(c) && !isQualified(c)).sort(order), 'new'],
    ['Khách nhóm', hits.filter((c) => !isMine(c)).sort(order), 'team'],
  ];
  const total = hits.length;
  $('#dash-search').innerHTML = `<div class="search-total">${total ? `Tìm thấy ${total} khách` : 'Không tìm thấy khách nào.'}</div>` +
    groups.filter(([, list]) => list.length).map(([title, list, group]) => `
      <section class="search-group">
        <div class="search-group-title">${title} <span>${list.length}</span></div>
        ${list.slice(0, DASH_SEARCH_LIMIT * searchPages[group]).map(dashSearchRow).join('')}
        ${list.length > DASH_SEARCH_LIMIT * searchPages[group] ? `<button type="button" class="btn-ghost search-more" data-search-more="${group}">Xem thêm (${list.length - DASH_SEARCH_LIMIT * searchPages[group]} khách)</button>` : ''}
      </section>`).join('');
}
// Bấm kết quả → sang tab tương ứng (giữ nguyên từ khoá để tab đó cũng lọc đúng khách) + mở khách.
$('#dash-search')?.addEventListener('click', (e) => {
  const more = e.target.closest('[data-search-more]'); if (more) { searchPages[more.dataset.searchMore]++; renderDashSearch(); return; }
  const row = e.target.closest('[data-search-open]'); if (!row) return;
  const c = allCustomers.find((x) => x.id === row.dataset.searchOpen); if (!c) return;
  if (!isMine(c)) { // khách đồng nghiệp phụ trách → nhóm Khách nhóm, xem mọi người + mọi tiến độ
    ownerScope = 'all'; stageFilter = ''; progressFilter = 'all';
    $('#progress-label').textContent = 'Tất cả';
    $$('#progress-pop .status-opt').forEach((o) => o.classList.toggle('is-sel', o.dataset.value === 'all'));
    showTeamView(); openDetail(c.id);
  } else if (isQualified(c)) {
    // Khách đã xong (chốt/không chốt) bị ẩn ở bộ lọc mặc định → chuyển bộ lọc sang "Tất cả".
    if (isCareDone(c.care_stage) && progressFilter === 'active') {
      progressFilter = 'all';
      $('#progress-label').textContent = 'Tất cả';
      $$('#progress-pop .status-opt').forEach((o) => o.classList.toggle('is-sel', o.dataset.value === 'all'));
    }
    showListView(); renderList();
    openDetail(c.id);
  } else {
    // Lead đã loại bị ẩn ở "Cần gọi" → chuyển dropdown sang "Tất cả".
    if (c.disqualified_at && leadFilter === 'open') {
      leadFilter = 'all';
      $('#lead-status-label').textContent = 'Tất cả';
      $$('#lead-status-pop .status-opt').forEach((o) => o.classList.toggle('is-sel', o.dataset.value === 'all'));
    }
    showLeadView();
    openLeadSheet(c.id);
  }
});

// ------------------------------------------------- GỢI Ý NHẬP (thay datalist) ------
// <datalist> trên Android WebView do hệ thống vẽ riêng → trong hộp thoại có cuộn bị lệch chỗ, nhấp nháy, lúc
// mờ lúc rõ. Thay bằng danh sách TỰ VẼ ngay dưới ô nhập (cuộn theo form). Tự áp cho MỌI <input list="…">
// (kể cả ô sinh động trong Giỏ hàng): lần đầu focus → chuyển list sang data-suggest, đọc <option> của datalist
// (value + chữ phụ) làm nguồn. Chọn 1 mục → đặt giá trị + bắn 'input' & 'change' (để tự điền phía sau chạy).
const SUGGEST_MAX = 60;
let suggestBox = null, suggestInput = null, suggestMute = false;
function suggestOptions(input) {
  const dl = document.getElementById(input.dataset.suggest || '');
  if (!dl) return [];
  const q = removeVietnameseTones(input.value.trim());
  const all = [...dl.querySelectorAll('option')].map((o) => ({ value: o.value, sub: (o.textContent || o.label || '').trim() }));
  const hit = q ? all.filter((o) => removeVietnameseTones(o.value + ' ' + o.sub).includes(q)) : all;
  return hit.filter((o) => o.value !== input.value || q === '').slice(0, SUGGEST_MAX);
}
function closeSuggest() {
  if (suggestBox) suggestBox.remove();
  suggestBox = null; suggestInput = null;
}
function openSuggest(input) {
  const opts = suggestOptions(input);
  if (!opts.length) { closeSuggest(); return; }
  if (!suggestBox || suggestInput !== input) {
    closeSuggest();
    suggestBox = document.createElement('div');
    suggestBox.className = 'suggest-box';
    suggestBox.setAttribute('role', 'listbox');
    const host = input.parentElement;
    host.classList.add('suggest-host');
    host.appendChild(suggestBox);
    suggestInput = input;
    // mousedown: chặn ô nhập mất focus (danh sách không bị đóng giữa chừng); click: chọn mục.
    suggestBox.addEventListener('mousedown', (e) => e.preventDefault());
    suggestBox.addEventListener('click', (e) => {
      const it = e.target.closest('[data-v]'); if (!it || !suggestInput) return;
      const inp = suggestInput;
      inp.value = it.dataset.v;
      closeSuggest();
      suggestMute = true; // sự kiện tự bắn dưới đây không được mở lại danh sách
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      suggestMute = false;
    });
  }
  suggestBox.style.top = (input.offsetTop + input.offsetHeight + 4) + 'px';
  suggestBox.style.left = input.offsetLeft + 'px';
  suggestBox.style.width = input.offsetWidth + 'px';
  suggestBox.innerHTML = opts.map((o) =>
    `<div class="suggest-item" role="option" data-v="${escapeHtml(o.value)}"><span class="suggest-v">${escapeHtml(o.value)}</span>${o.sub ? `<span class="suggest-sub">${escapeHtml(o.sub)}</span>` : ''}</div>`).join('');
}
document.addEventListener('focusin', (e) => {
  const inp = e.target;
  if (!(inp instanceof HTMLInputElement)) return;
  if (inp.hasAttribute('list')) { inp.dataset.suggest = inp.getAttribute('list'); inp.removeAttribute('list'); }
  if (inp.dataset.suggest) openSuggest(inp);
});
document.addEventListener('input', (e) => { if (!suggestMute && e.target.dataset && e.target.dataset.suggest && e.target === document.activeElement) openSuggest(e.target); });
document.addEventListener('focusout', (e) => { if (e.target === suggestInput) setTimeout(() => { if (document.activeElement !== suggestInput) closeSuggest(); }, 120); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && suggestBox) { e.stopPropagation(); closeSuggest(); } }, true);

// ---------------------------------------------------------- DASHBOARD -----

// Chuyển tab giữa danh sách khách, bảng tổng quan và bảng tính vay.
// Thứ bậc điều hướng: tab chính (dashboard / list "Tiềm năng" / leads "Khách mới") ở header;
// công cụ (loan...) mở từ menu tài khoản, không có tab — màn công cụ có nút ← về Tổng quan.
// Ô tìm kiếm hiện ở 3 tab chính (không hiện ở màn công cụ).
const SEARCH_VIEWS = ['dashboard', 'list', 'leads']; // Tổng quan: tìm → trang kết quả tạm
// Tab "Khách hàng" (D-004) có 3 NHÓM: 'care' Đang chăm (#list-view) · 'leads' Khách mới (#lead-view) ·
// 'team' Khách nhóm (#list-view, khách đồng nghiệp phụ trách — js/team.js). custGroup = nhóm đang xem;
// bấm tab Khách hàng → mở lại nhóm xem gần nhất.
let custGroup = 'care';
const LS_CUST_GROUP = 'crm_cust_group';
function setActiveView(name) { // 'list' | 'leads' | 'dashboard' | 'loan'
  $('.topbar').classList.toggle('no-search', !SEARCH_VIEWS.includes(name));
  $('#list-view').hidden = name !== 'list';
  $('#lead-view').hidden = name !== 'leads';
  closeLeadPops();
  $('#dashboard-view').hidden = name !== 'dashboard';
  $('#loan-view').hidden = name !== 'loan';
  const isCust = name === 'list' || name === 'leads';
  $('#tab-customers').classList.toggle('is-active', isCust);
  $('#tab-dashboard').classList.toggle('is-active', name === 'dashboard');
  $('#cust-subtabs').hidden = !isCust;
  if (isCust) {
    try { localStorage.setItem(LS_CUST_GROUP, custGroup); } catch { /* bỏ qua */ }
    syncCustSubtabs();
  }
}
function syncCustSubtabs() {
  $$('#cust-subtabs .cust-subtab').forEach((b) => {
    const on = b.dataset.group === custGroup;
    b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on));
  });
  const others = allCustomers.filter((c) => !isMine(c));
  $('#sub-team').hidden = !(hasTeam() || others.length);
  $('#sub-care-count').textContent = String(allCustomers.filter((c) => isMine(c) && isQualified(c) && !isCareDone(c.care_stage)).length);
  $('#sub-team-count').textContent = others.length ? String(others.length) : '';
}
function showListView() { custGroup = 'care'; setActiveView('list'); renderList(); }      // Đang chăm
function showTeamView() { custGroup = 'team'; setActiveView('list'); renderList(); }      // Khách nhóm
function showLeadView() { custGroup = 'leads'; setActiveView('leads'); renderLeads(); }   // Khách mới
function showCustomerGroup(g) {
  if (g === 'leads') showLeadView();
  else if (g === 'team' && !$('#sub-team').hidden) showTeamView();
  else showListView();
}
function showDashboardView() { setActiveView('dashboard'); renderDashboard(); }
function showLoanView() { setActiveView('loan'); if (window.LoanCRM) LoanCRM.mountTab(); } // js/loan/loan-crm.js

// ---- helper nhỏ ----
function pctOf(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }
function daysSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return isNaN(t) ? Infinity : Math.floor((Date.now() - t) / 86400000);
}
function mondayOf(d) {
  const dt = new Date(d); dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // lùi về thứ Hai
  return dt;
}
function lastNWeeks(n) {
  const start = mondayOf(new Date());
  return Array.from({ length: n }, (_, i) => {
    const w = new Date(start); w.setDate(w.getDate() - (n - 1 - i) * 7); return w;
  });
}
function ddmm(d) { return `${d.getDate()}/${d.getMonth() + 1}`; }

// Bar ngang dùng chung: items = [{label, value, sub?, color?}]
function hbars(items, opts = {}) {
  if (!items.length) return `<div class="dash-empty">${opts.empty || 'Chưa có dữ liệu'}</div>`;
  const mx = opts.max || Math.max(...items.map((i) => i.value), 1);
  return `<div class="hbars">` + items.map((i) => `
    <div class="hbar-row">
      <div class="hbar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(pctOf(i.value, mx), 2)}%;background:${i.color || 'var(--teal-light)'}"></div></div>
      <div class="hbar-val">${opts.fmt ? opts.fmt(i.value) : i.value}${i.sub ? `<span class="hbar-sub"> ${escapeHtml(i.sub)}</span>` : ''}</div>
    </div>`).join('') + `</div>`;
}

// Cột dọc (khách mới theo tuần)
function vbars(values, labels, color) {
  const mx = Math.max(...values, 1);
  return `<div class="vbars">` + values.map((v, i) => `
    <div class="vbar-col">
      <div class="vbar-val">${v || ''}</div>
      <div class="vbar" style="height:${Math.round((v / mx) * 66) + 3}px;background:${color || 'var(--teal-light)'}"></div>
      <div class="vbar-x">${escapeHtml(labels[i])}</div>
    </div>`).join('') + `</div>`;
}

// Đường xu hướng (SVG) cho điểm quan tâm TB theo tuần (thang 0–100)
function sparkline(values, labels) {
  const pts = values.map((v, i) => ({ x: i, v }));
  const defined = pts.filter((p) => p.v != null);
  if (defined.length < 1) return '<div class="dash-empty">Chưa đủ dữ liệu</div>';
  const W = 280, H = 90, pad = 10, n = values.length;
  const X = (i) => pad + (n > 1 ? i * (W - 2 * pad) / (n - 1) : (W - 2 * pad) / 2);
  const Y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const path = defined.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const dots = defined.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3" fill="var(--terracotta)"/>`).join('');
  const xlabels = labels.map((l, i) => `<text x="${X(i).toFixed(1)}" y="${H - 1}" class="spark-x">${escapeHtml(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="spark">
    <line x1="${pad}" y1="${Y(50)}" x2="${W - pad}" y2="${Y(50)}" class="spark-mid"/>
    <path d="${path}" fill="none" stroke="var(--terracotta)" stroke-width="2"/>${dots}${xlabels}</svg>`;
}

function dashCard(title, bodyHtml, hint, extraClass) {
  return `<div class="dash-card${extraClass ? ' ' + extraClass : ''}">
    <h3>${escapeHtml(title)}</h3>
    ${hint ? `<p class="dash-hint">${escapeHtml(hint)}</p>` : ''}
    ${bodyHtml}
  </div>`;
}

// ================= TỔNG QUAN = "BÀN LÀM VIỆC" CỦA SALE (thiết kế lại 2026-10-07) =================
// Thứ tự trên màn: (1) 4 chỉ số nhanh → (2) VIỆC HÔM NAY (danh sách gọi theo ưu tiên) →
// (3) lịch hẹn 7 ngày · pipeline đang chăm · hiệu suất tuần → (4) Phân tích (thu gọn, các
// biểu đồ báo cáo cũ). Tham chiếu: Follow Up Boss (Smart Lists, speed to lead), Salesforce
// (pipeline theo bậc), LionDesk (nhắc sinh nhật / chăm lại khách cũ). Chỉ dùng dữ liệu đã có.
const DASH_GROUP_LIMIT = 5;            // mỗi nhóm việc hiện tối đa N dòng, còn lại "Xem thêm"
const DASH_IDLE_WARM_DAYS = 14;        // Tiềm năng (không nóng) bao lâu chưa liên hệ thì nhắc
const DASH_LEAD_RETRY_H = 24;          // lead chưa nói chuyện được: gọi lại sau N giờ
const DASH_BIRTHDAY_DAYS = 7;          // nhắc sinh nhật trong N ngày tới
const LS_DASH_ANALYTICS = 'crm_dash_analytics_open';
const dashExpanded = new Set();        // các nhóm việc đang mở "Xem thêm"
function dashHotMin() { return (window.NOTIF && NOTIF.config.hotInterestMin) || 60; }
function dashIdleHotDays() { return (window.NOTIF && NOTIF.config.idleDays) || 7; }

// Mốc liên hệ cuối (ms): định nghĩa chung ở NOTIF.lastInteractionAt + thêm các lần gọi.
function lastTouchMs(c) {
  const base = window.NOTIF ? NOTIF.lastInteractionAt(c) : Date.parse(c.updated_at);
  const calls = callAttemptsOf(c);
  const lastCall = calls.length ? Date.parse(calls[calls.length - 1].at) : NaN;
  const t = Math.max(isNaN(base) || base == null ? 0 : base, isNaN(lastCall) ? 0 : lastCall);
  return t || null;
}
function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function startOfDayMs(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
// "Hôm nay 14:00" / "Hôm qua 09:30" / "Mai 10:00" / "T6 10/10 10:00"
function dashWhen(ms) {
  const diff = Math.round((startOfDayMs(ms) - startOfDayMs(Date.now())) / 86400000);
  const day = diff === 0 ? 'Hôm nay' : diff === -1 ? 'Hôm qua' : diff === 1 ? 'Mai'
    : `${VI_WD_SHORT[new Date(ms).getDay()]} ${ddmm(new Date(ms))}`;
  return `${day} ${hhmm(ms)}`;
}
// Số ngày tới sinh nhật kế tiếp (0 = hôm nay), null nếu thiếu ngày/tháng.
function daysToBirthday(c) {
  const p = c.dob && window.LunarUtil ? LunarUtil.parseDob(c.dob) : null;
  if (!p || !p.month || !p.day) return null;
  const t0 = startOfDayMs(Date.now()), y = new Date().getFullYear();
  let next = new Date(y, p.month - 1, p.day).getTime();
  if (next < t0) next = new Date(y + 1, p.month - 1, p.day).getTime();
  return Math.round((next - t0) / 86400000);
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Thời gian từ lúc khách đăng ký → cuộc gọi đầu tiên (ms), null nếu chưa gọi / dữ liệu lệch.
function speedToLeadMs(c) {
  const calls = callAttemptsOf(c); if (!calls.length) return null;
  const reg = Date.parse(c.registered_at || c.created_at), first = Date.parse(calls[0].at);
  return (isNaN(reg) || isNaN(first) || first < reg) ? null : first - reg;
}

// 1 dòng việc: bấm tên → mở khách; nút gọi (tel: + data-call-id → hộp ghi cuộc gọi khi quay lại).
function dashActRow(c, sub, tone, withZalo) {
  const tel = normalizePhone(c.phone || '');
  const tag = isQualified(c) ? careLabel(c.care_stage) : 'Khách mới';
  return `<div class="act-row${tone ? ' is-' + tone : ''}">
      <button type="button" class="act-main" data-open="${c.id}">
        <span class="act-name">${escapeHtml(c.full_name || '(chưa tên)')}<span class="act-tag">${escapeHtml(tag)}</span></span>
        <span class="act-sub">${escapeHtml(sub)}</span>
      </button>
      ${withZalo && tel ? `<a class="act-zalo card-zalo" href="${zaloLink(c.phone)}" data-id="${c.id}" aria-label="Nhắn Zalo"><img class="ic-zalo" src="/icons/zalo.png" alt="Zalo" /></a>` : ''}
      ${tel ? `<a class="act-call" href="tel:${tel}" data-call-id="${c.id}" aria-label="Gọi ${escapeHtml(c.full_name || '')}">${PHONE_SVG}</a>` : ''}
    </div>`;
}

// Gom các nhóm việc hôm nay. Mỗi khách chỉ nằm ở nhóm "liên hệ" đầu tiên nó khớp
// (trừ 'Cuộc gọi chưa ghi chú' và 'Sinh nhật' — là việc khác loại, được trùng).
function dashActionGroups(all) {
  const now = Date.now();
  const tomorrow0 = startOfDayMs(now) + 86400000;
  const hotMin = dashHotMin();
  const callStart = (c) => (c.next_call_at ? Date.parse(c.next_call_at) : NaN);
  const hasFutureCall = (c) => callStart(c) > now;
  const openLeads = all.filter((c) => !isQualified(c) && !c.disqualified_at);
  const activeQ = all.filter((c) => isQualified(c) && !isCareDone(c.care_stage));
  const leadsWithCall = (fn) => openLeads.filter((c) => !hasFutureCall(c)).filter(fn);
  const lastCallOf = (c) => { const a = callAttemptsOf(c); return a[a.length - 1]; };

  const groups = [
    {
      key: 'due', title: 'Đến giờ / quá giờ hẹn gọi', tone: 'urgent', contact: true,
      items: all.filter((c) => !c.disqualified_at && callStart(c) <= now)
        .sort((a, b) => callStart(a) - callStart(b))
        .map((c) => ({ c, sub: `Hẹn ${dashWhen(callStart(c))}${c.next_call_reason ? ' · ' + c.next_call_reason : ''}` })),
    },
    {
      key: 'today', title: 'Hẹn gọi còn lại hôm nay', contact: true,
      items: all.filter((c) => !c.disqualified_at && callStart(c) > now && callStart(c) < tomorrow0)
        .sort((a, b) => callStart(a) - callStart(b))
        .map((c) => ({ c, sub: `${hhmm(callStart(c))}${c.next_call_reason ? ' · ' + c.next_call_reason : ''}` })),
    },
    {
      key: 'new', title: 'Khách mới chưa gọi', tone: 'hot', contact: true,
      hint: 'Gọi càng sớm sau khi khách đăng ký, khả năng nghe máy càng cao.',
      items: leadsWithCall((c) => !callAttemptsOf(c).length)
        .sort((a, b) => (b.registered_at || b.created_at || '').localeCompare(a.registered_at || a.created_at || ''))
        .map((c) => {
          const reg = Date.parse(c.registered_at || c.created_at);
          const proj = Array.isArray(c.projects) && c.projects.length ? ' · ' + c.projects.join(', ') : '';
          return { c, sub: `Chờ ${isNaN(reg) ? '?' : formatDuration(now - reg)} · ${sourceDisplay(c.source)}${proj}` };
        }),
    },
    {
      key: 'retry', title: 'Gọi lại khách chưa liên lạc được', contact: true,
      items: leadsWithCall((c) => {
        const calls = callAttemptsOf(c);
        return calls.length && !calls.some((a) => a.result === 'talked')
          && now - Date.parse(calls[calls.length - 1].at) >= DASH_LEAD_RETRY_H * 3600000;
      }).sort((a, b) => callAttemptsOf(a).length - callAttemptsOf(b).length
        || lastCallOf(a).at.localeCompare(lastCallOf(b).at))
        .map((c) => {
          const last = lastCallOf(c);
          return { c, sub: `Đã gọi ${callAttemptsOf(c).length} lần · lần cuối ${formatDuration(now - Date.parse(last.at))} trước · ${callResultLabel(last)}` };
        }),
    },
    {
      key: 'decide', title: 'Đã nói chuyện — chờ phân loại', contact: true,
      hint: 'Bấm Đạt (chuyển sang Đang chăm) hoặc Loại để danh sách Khách mới gọn.',
      items: leadsWithCall((c) => {
        const talked = callAttemptsOf(c).filter((a) => a.result === 'talked');
        return talked.length && now - Date.parse(talked[talked.length - 1].at) >= DASH_LEAD_RETRY_H * 3600000;
      }).map((c) => ({ c, sub: `Nói chuyện lần cuối ${formatDuration(now - Date.parse(lastCallOf(c).at))} trước` })),
    },
    {
      key: 'pending', title: 'Cuộc gọi chưa ghi chú',
      items: all.filter((c) => pendingCallsOf(c).length).map((c) => {
        const p = pendingCallsOf(c);
        return { c, sub: `${p.length} cuộc · gần nhất ${dashWhen(Date.parse(p[p.length - 1].at))}` };
      }),
    },
    {
      key: 'hot', title: 'Khách nóng đang nguội', tone: 'hot', contact: true,
      items: activeQ.filter((c) => !hasFutureCall(c) && (c.interest_level || 0) >= hotMin)
        .map((c) => ({ c, idle: Math.floor((now - (lastTouchMs(c) || now)) / 86400000) }))
        .filter((x) => x.idle >= dashIdleHotDays())
        .sort((a, b) => (b.c.interest_level || 0) - (a.c.interest_level || 0) || b.idle - a.idle)
        .map(({ c, idle }) => ({ c, sub: `Quan tâm ${c.interest_level || 0}% · ${idle} ngày chưa liên hệ` })),
    },
    {
      key: 'warm', title: 'Khách đang chăm lâu chưa liên hệ', contact: true,
      items: activeQ.filter((c) => !hasFutureCall(c) && (c.interest_level || 0) < hotMin)
        .map((c) => ({ c, idle: Math.floor((now - (lastTouchMs(c) || now)) / 86400000) }))
        .filter((x) => x.idle >= DASH_IDLE_WARM_DAYS)
        .sort((a, b) => b.idle - a.idle)
        .map(({ c, idle }) => ({ c, sub: `${idle} ngày chưa liên hệ · quan tâm ${c.interest_level || 0}%` })),
    },
    {
      // Mỗi khách đang chăm phải có bước tiếp theo (Next Step) — nhóm này gom phần còn lại
      // (khách đã nằm ở nhóm trên thì không lặp lại).
      key: 'nonext', title: 'Chưa có việc tiếp theo', contact: true,
      hint: 'Đặt lịch gọi hoặc thêm "Việc tiếp theo" để khách không bị bỏ quên.',
      items: activeQ.filter((c) => !hasFutureCall(c) && !(Array.isArray(c.next_tasks) && c.next_tasks.length))
        .map((c) => ({ c, idle: Math.floor((now - (lastTouchMs(c) || now)) / 86400000) }))
        .sort((a, b) => (b.c.interest_level || 0) - (a.c.interest_level || 0) || b.idle - a.idle)
        .map(({ c, idle }) => ({ c, sub: `Quan tâm ${c.interest_level || 0}% · liên hệ cuối ${idle} ngày trước` })),
    },
    {
      key: 'bday', title: 'Sinh nhật sắp tới', tone: 'info', zalo: true,
      hint: 'Một lời chúc qua Zalo giữ quan hệ — kể cả với khách đã chốt (giới thiệu khách mới).',
      items: all.filter((c) => isQualified(c) && c.care_stage !== CARE_STAGE_DROPPED)
        .map((c) => ({ c, d: daysToBirthday(c) }))
        .filter((x) => x.d != null && x.d <= DASH_BIRTHDAY_DAYS)
        .sort((a, b) => a.d - b.d)
        .map(({ c, d }) => ({ c, sub: d === 0 ? 'Sinh nhật hôm nay 🎂' : `Sinh nhật ${formatDob(c.dob).slice(0, 5)} · còn ${d} ngày` })),
    },
  ];
  const seen = new Set();
  for (const g of groups) {
    if (!g.contact) continue;
    g.items = g.items.filter(({ c }) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }
  return groups;
}

function renderDashboard() {
  const all = ownedCustomers(); // việc / thống kê chỉ tính khách MÌNH phụ trách (js/team.js)
  const box = $('#dashboard-content');
  // Đang gõ tìm ở Tổng quan → hiện trang kết quả tạm thay cho bàn làm việc.
  const q = $('#search-input').value.trim();
  $('#dash-search').hidden = !q;
  box.hidden = !!q;
  if (q) { renderDashSearch(); return; }
  if (!all.length) {
    box.innerHTML = `<div class="dash-card"><div class="dash-empty">Chưa có khách hàng nào. Bấm + để thêm khách đầu tiên.</div></div>`;
    return;
  }
  const now = Date.now();
  const groups = dashActionGroups(all);
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));

  // ---- Mốc tuần / tháng ----
  const wk0 = mondayOf(new Date()).getTime();
  const prevWk0 = wk0 - 7 * 86400000;
  const month0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const inRange = (iso, a, b) => { const t = Date.parse(iso); return !isNaN(t) && t >= a && t < b; };

  // Đếm hoạt động trong khoảng [a, b): khách mới, cuộc gọi, nói chuyện được, lên Tiềm năng, Booking/Kí.
  const activity = (a, b) => {
    const r = { leads: 0, calls: 0, talked: 0, qualified: 0, deals: 0 };
    for (const c of all) {
      if (inRange(c.registered_at || c.created_at, a, b)) r.leads++;
      if (c.qualified_at && inRange(c.qualified_at, a, b)) r.qualified++;
      for (const x of callAttemptsOf(c)) {
        if (!inRange(x.at, a, b)) continue;
        r.calls++; if (x.result === 'talked') r.talked++;
      }
      const hist = Array.isArray(c.care_stage_history) ? c.care_stage_history : [];
      if (hist.some((h) => h && (h.stage === 'Booking' || h.stage === 'Kí HĐMB') && inRange(h.at, a, b))) r.deals++;
    }
    return r;
  };
  const thisWk = activity(wk0, now + 1), lastWk = activity(prevWk0, wk0);

  // Chốt trong tháng: khách có mốc 'Kí HĐMB' từ đầu tháng.
  const closedMonth = all.filter((c) => (Array.isArray(c.care_stage_history) ? c.care_stage_history : [])
    .some((h) => h && h.stage === 'Kí HĐMB' && inRange(h.at, month0, now + 1))).length;
  const bookingNow = all.filter((c) => c.care_stage === 'Booking').length;

  // Speed to lead: trung vị thời gian từ đăng ký → cuộc gọi đầu, khách đăng ký 30 ngày qua.
  const stl = all.filter((c) => inRange(c.registered_at || c.created_at, now - 30 * 86400000, now + 1))
    .map(speedToLeadMs).filter((v) => v != null);
  const stlMed = median(stl);

  const contactTodo = groups.filter((g) => g.contact).reduce((s, g) => s + g.items.length, 0);
  const todo = contactTodo + byKey.pending.items.length;

  // ---- 1) Lời chào + 4 chỉ số nhanh ----
  const d = new Date();
  const hour = d.getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const VI_WD_FULL = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const lunar = window.LunarUtil ? LunarUtil.convertSolar2Lunar(d.getDate(), d.getMonth() + 1, d.getFullYear()) : null;
  const lunarTxt = lunar ? ` · ${lunar.day}/${lunar.month} âm lịch` : '';
  const delta = (a, b) => (a === b ? '' : `<span class="kpi-delta ${a > b ? 'up' : 'down'}">${a > b ? '▲' : '▼'} ${Math.abs(a - b)}</span>`);
  const kpi = (label, value, sub, go, tone) => `
    <button type="button" class="kpi${tone ? ' is-' + tone : ''}" ${go ? `data-go="${go}"` : ''}>
      <span class="kpi-label">${label}</span>
      <span class="kpi-value">${value}</span>
      <span class="kpi-sub">${sub}</span>
    </button>`;
  const headHtml = `
    <div class="dash-head">
      <div>
        <div class="dash-greet">${greet}</div>
        <div class="dash-date">${VI_WD_FULL[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}${lunarTxt}</div>
      </div>
      <div class="dash-head-msg">${todo ? `Hôm nay có <b>${todo}</b> việc cần xử lý` : 'Không còn việc tồn đọng 👍'}</div>
    </div>
    <div class="kpi-strip">
      ${kpi('Việc cần làm', todo, byKey.due.items.length ? `<b class="txt-bad">${byKey.due.items.length} quá giờ hẹn</b>` : 'không có hẹn quá giờ', 'todo', byKey.due.items.length ? 'urgent' : '')}
      ${kpi('Khách mới chờ gọi', byKey.new.items.length, stlMed != null ? `gọi lần đầu sau ~${escapeHtml(formatDuration(stlMed))}` : 'chưa có số liệu phản hồi', 'leads', byKey.new.items.length ? 'hot' : '')}
      ${kpi('Cuộc gọi tuần này', thisWk.calls, `${thisWk.talked} nói chuyện được · tuần trước ${lastWk.calls}`, 'week')}
      ${kpi('Chốt tháng này', closedMonth, `${bookingNow} khách đang Booking`, 'pipeline', closedMonth ? 'good' : '')}
    </div>`;

  // ---- 2) VIỆC HÔM NAY ----
  const shown = groups.filter((g) => g.items.length);
  const todoHtml = shown.length ? shown.map((g) => {
    const open = dashExpanded.has(g.key);
    const rows = (open ? g.items : g.items.slice(0, DASH_GROUP_LIMIT));
    const rest = g.items.length - rows.length;
    return `<section class="act-group${g.tone ? ' is-' + g.tone : ''}">
        <div class="act-group-title"><span>${escapeHtml(g.title)}</span><span class="act-count">${g.items.length}</span></div>
        ${g.hint ? `<div class="act-hint">${escapeHtml(g.hint)}</div>` : ''}
        <div class="act-list">${rows.map((x) => dashActRow(x.c, x.sub, g.tone, g.zalo)).join('')}</div>
        ${rest > 0 ? `<button type="button" class="btn-ghost act-more" data-more="${g.key}">Xem thêm ${rest} khách</button>`
          : (open && g.items.length > DASH_GROUP_LIMIT ? `<button type="button" class="btn-ghost act-more" data-more="${g.key}">Thu gọn</button>` : '')}
      </section>`;
  }).join('') : '<div class="dash-empty">Đã xử lý hết việc hôm nay. Có thể gọi chăm lại khách cũ hoặc nhập thêm khách mới.</div>';
  const todoCard = `<div class="dash-card dash-todo" id="dash-todo">
      <h3>Việc hôm nay</h3>
      <p class="dash-hint">Xếp theo mức ưu tiên: hẹn gọi → khách mới → gọi lại → chăm lại. Bấm tên để mở hồ sơ, bấm 📞 để gọi — gọi xong app tự gợi ý lịch gọi lại.</p>
      ${todoHtml}
    </div>`;

  // ---- 3a) Lịch hẹn 7 ngày tới (sau hôm nay) ----
  const tomorrow0 = startOfDayMs(now) + 86400000;
  const upcoming = all.filter((c) => !c.disqualified_at && c.next_call_at)
    .map((c) => ({ c, t: Date.parse(c.next_call_at) }))
    .filter((x) => x.t >= tomorrow0 && x.t < tomorrow0 + 7 * 86400000)
    .sort((a, b) => a.t - b.t);
  const upHtml = upcoming.length ? `<div class="up-list">` + upcoming.map(({ c, t }) => `
      <button type="button" class="up-row" data-open="${c.id}">
        <span class="up-when">${escapeHtml(dashWhen(t))}</span>
        <span class="up-name">${escapeHtml(c.full_name || '(chưa tên)')}</span>
        ${c.next_call_reason ? `<span class="up-reason">${escapeHtml(c.next_call_reason)}</span>` : ''}
      </button>`).join('') + `</div>`
    : '<div class="dash-empty">Chưa có lịch hẹn nào trong 7 ngày tới.</div>';
  const upCard = dashCard(`Lịch hẹn 7 ngày tới (${upcoming.length})`, upHtml);

  // ---- 3b) Pipeline đang chăm (lớp Tiềm năng, theo bậc hiện tại) ----
  const hotMin = dashHotMin();
  const pipeStages = CARE_STAGES.filter((s) => !LEAD_ONLY_STAGES.includes(s) && !isCareDone(s));
  const activeQ = all.filter((c) => isQualified(c) && !isCareDone(c.care_stage));
  const stageOf = (c) => (pipeStages.includes(c.care_stage) ? c.care_stage : QUALIFIED_STAGE);
  const pipeTotal = activeQ.length || 1;
  const pipeRows = pipeStages.map((s) => {
    const list = activeQ.filter((c) => stageOf(c) === s);
    const value = list.reduce((sum, c) => sum + (Number(c.apt_price) || 0), 0);
    return { s, n: list.length, hot: list.filter((c) => (c.interest_level || 0) >= hotMin).length, value };
  });
  const pipeHtml = `
    <div class="pipe-bar">${pipeRows.filter((r) => r.n).map((r) => `<span style="flex:${r.n};background:${careColor(r.s)}" title="${escapeHtml(r.s)}: ${r.n}"></span>`).join('')}</div>
    <div class="pipe-rows">${pipeRows.map((r) => `
      <button type="button" class="pipe-row" data-stage="${escapeHtml(r.s)}">
        <span class="pipe-dot" style="background:${careColor(r.s)}"></span>
        <span class="pipe-stage">${escapeHtml(r.s)}</span>
        <span class="pipe-hot">${r.hot ? `${r.hot} nóng` : ''}</span>
        <span class="pipe-val">${r.value ? escapeHtml(formatPrice(r.value)) : ''}</span>
        <span class="pipe-n">${r.n}</span>
      </button>`).join('')}</div>
    <div class="pipe-foot">${activeQ.length} khách đang chăm · ${pctOf(activeQ.filter((c) => (c.interest_level || 0) >= hotMin).length, pipeTotal)}% nóng
      · đã chốt ${all.filter((c) => c.care_stage === 'Kí HĐMB').length} · không chốt ${all.filter((c) => isQualified(c) && c.care_stage === CARE_STAGE_DROPPED).length}</div>`;
  const pipeCard = dashCard('Pipeline đang chăm', pipeHtml, 'Bấm 1 bậc để xem danh sách khách ở bậc đó. Giá trị = tổng giá căn đang nhắm.', 'dash-pipe');

  // ---- 3c) Hiệu suất tuần (so với tuần trước) ----
  const perfRow = (label, a, b) => `<div class="perf-row"><span>${label}</span><b>${a}</b><span class="perf-prev">${b}</span>${delta(a, b) || '<span class="kpi-delta"></span>'}</div>`;
  const perfHtml = `<div class="perf">
      <div class="perf-row perf-head"><span></span><span>Tuần này</span><span>Tuần trước</span><span></span></div>
      ${perfRow('Khách mới vào', thisWk.leads, lastWk.leads)}
      ${perfRow('Cuộc gọi', thisWk.calls, lastWk.calls)}
      ${perfRow('Nói chuyện được', thisWk.talked, lastWk.talked)}
      ${perfRow('Chuyển Đang chăm', thisWk.qualified, lastWk.qualified)}
      ${perfRow('Booking / Kí', thisWk.deals, lastWk.deals)}
    </div>
    <div class="perf-foot">Tốc độ gọi khách mới (30 ngày): <b>${stlMed != null ? escapeHtml(formatDuration(stlMed)) : '—'}</b>
      ${stl.length ? `<span class="perf-prev">· ${pctOf(stl.filter((v) => v <= 3600000).length, stl.length)}% gọi trong 1 giờ</span>` : ''}</div>`;
  const perfCard = dashCard('Hiệu suất tuần', perfHtml, 'Tính từ thứ Hai. Tốc độ gọi = trung vị thời gian từ lúc khách đăng ký tới cuộc gọi đầu tiên.', 'dash-perf');

  // ---- 4) PHÂN TÍCH (thu gọn) — các biểu đồ báo cáo ----
  const analytics = renderDashAnalytics(all);
  let anaOpen = false;
  try { anaOpen = localStorage.getItem(LS_DASH_ANALYTICS) === '1'; } catch (_) { /* bỏ qua */ }

  box.innerHTML = `${headHtml}
    <div class="dash-main">
      <div class="dash-main-left">${todoCard}</div>
      <div class="dash-main-right" id="dash-week">${upCard}${pipeCard}${perfCard}</div>
    </div>
    <details class="dash-analytics"${anaOpen ? ' open' : ''}>
      <summary>Phân tích & báo cáo <span>phễu chuyển đổi · nguồn khách · căn hộ quan tâm</span></summary>
      <div class="dash-ana-grid">${analytics.join('')}</div>
    </details>`;
  const det = box.querySelector('.dash-analytics');
  det.addEventListener('toggle', () => { try { localStorage.setItem(LS_DASH_ANALYTICS, det.open ? '1' : '0'); } catch (_) { /* bỏ qua */ } });
}

// Các biểu đồ báo cáo (trước đây là toàn bộ Tổng quan) — nay nằm trong mục "Phân tích" thu gọn.
function renderDashAnalytics(all) {
  const weeks = lastNWeeks(8);
  const wkeys = new Map(weeks.map((w, i) => [w.getTime(), i]));
  const weekIdx = (iso) => { const k = mondayOf(iso).getTime(); return wkeys.has(k) ? wkeys.get(k) : -1; };
  const cards = [];
  const nowMs = Date.now();
  const TERMINAL_STAGES = new Set(['Kí HĐMB', CARE_STAGE_DROPPED]);
  const sCount = {}, sSum = {}, sCnt = {};
  all.forEach((c) => {
    const flat = Array.isArray(c.care_stage_history)
      ? [...c.care_stage_history].sort((a, b) => (a.at || '').localeCompare(b.at || ''))
      : [];
    if (!flat.length) return;
    // Rút gọn thành danh sách LƯỢT: at = mốc VÀO bậc (mốc đầu của chuỗi cùng bậc).
    const runs = [];
    for (const e of flat) {
      const prev = runs[runs.length - 1];
      if (prev && prev.stage === e.stage) continue;
      runs.push({ stage: e.stage, at: e.at });
    }
    // Chuẩn hoá lượt đầu = 'Đăng kí mới' tại mốc đăng ký (giống renderCareHistory):
    // lượt đầu đã đúng bậc → gắn lại mốc; chưa có → chèn 1 lượt tổng hợp ở đầu.
    const regAt = c.registered_at || c.created_at || null;
    if (runs[0].stage === CARE_STAGE_DEFAULT) {
      if (regAt) runs[0].at = regAt;
    } else {
      let at = regAt || runs[0].at;
      if (runs[0].at && at && at > runs[0].at) at = runs[0].at; // không muộn hơn lượt sau
      runs.unshift({ stage: CARE_STAGE_DEFAULT, at });
    }
    const seen = new Set(); // mỗi bậc đếm 1 lần cho 1 khách (phòng khách quay lại bậc cũ)
    for (let i = 0; i < runs.length; i++) {
      const st = runs[i].stage;
      if (!st) continue;
      if (!seen.has(st)) { seen.add(st); sCount[st] = (sCount[st] || 0) + 1; }
      if (TERMINAL_STAGES.has(st)) continue; // bậc thời điểm → không tính thời lượng
      const endMs = (i < runs.length - 1) ? new Date(runs[i + 1].at).getTime() : nowMs;
      const dur = endMs - new Date(runs[i].at).getTime();
      if (dur >= 0) { sSum[st] = (sSum[st] || 0) + dur; sCnt[st] = (sCnt[st] || 0) + 1; }
    }
  });

  // 7 thanh (mỗi bậc 1 thanh, màu theo bậc, opacity giảm để chữ nổi). Chữ CHÌM trong
  // thanh: [Tên bậc] trái · [Thời gian TB] giữa · [Số khách] phải.
  // Trục căn chữ thời gian (căn TRÁI từ trục này): dịch trái NỬA bề rộng chuỗi mẫu
  // '2 ngày 10 giờ' để chuỗi cỡ đó nằm ĐÚNG GIỮA thanh. Đo theo font THỰC của thiết bị
  // (Android/Mac khác nhau) → luôn chuẩn. Bơm vào CSS qua biến --t-shift.
  const _cv = renderDashboard._cv || (renderDashboard._cv = document.createElement('canvas'));
  const _ctx = _cv.getContext('2d');
  _ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`;
  const timeShift = Math.round(_ctx.measureText('2 ngày 10 giờ').width / 2);
  let funnelHtml = `<div class="funnel2" style="--t-shift:${timeShift}px">`;
  const maxCount = sCount[CARE_STAGE_DEFAULT] || 1; // 'Đăng kí mới' = tổng khách → thanh dài nhất
  // % chuyển đổi từ bậc trước sang bậc này (= số khách bậc này / số khách bậc trước) +
  // tìm "nút thắt" (bước rớt nhiều nhất — % thấp nhất mà bậc trước còn khách).
  const convs = CARE_STAGES.map((s, i) => (i === 0 ? null : pctOf(sCount[s] || 0, sCount[CARE_STAGES[i - 1]] || 0)));
  let worst = -1, worstV = 101;
  convs.forEach((v, i) => { if (v != null && (sCount[CARE_STAGES[i - 1]] || 0) > 0 && v < worstV) { worstV = v; worst = i; } });
  CARE_STAGES.forEach((s, i) => {
    // Dòng % chuyển đổi giữa bậc trước và bậc này (không có ở bậc đầu).
    if (i > 0) {
      const bn = i === worst;
      funnelHtml += `<div class="funnel2-conv${bn ? ' is-bottleneck' : ''}">↓ ${convs[i]}%${bn ? ' · nút thắt' : ''}</div>`;
    }
    const n = sCount[s] || 0;
    const avgMs = sCnt[s] ? sSum[s] / sCnt[s] : null;
    const barPct = Math.max(pctOf(n, maxCount), 2);
    const timeTxt = avgMs != null ? escapeHtml(formatDuration(avgMs)) : '';
    funnelHtml += `
      <div class="funnel2-row">
        <div class="funnel2-fill" style="width:${barPct}%;background:${careColor(s)}"></div>
        <div class="funnel2-txt">
          <span class="funnel2-stage">${escapeHtml(s)}</span>
          <span class="funnel2-time">${timeTxt}</span>
          <span class="funnel2-n">${n} khách</span>
        </div>
      </div>`;
  });
  funnelHtml += '</div>';
  const dropped = all.filter((c) => c.care_stage === CARE_STAGE_DROPPED).length;
  if (dropped) funnelHtml += `<div class="funnel-dropped">Đã loại (kết thúc, không chốt): ${dropped} khách</div>`;
  cards.push(dashCard('PHỄU KHÁCH HÀNG', funnelHtml,
    'Thanh dài = nhiều khách (dạng phễu). Mỗi thanh: tên bậc · thời gian TB ở bậc · số khách đã/đang ở bậc. Dòng % = tỉ lệ đi tiếp sang bậc sau (nút thắt = rớt nhiều nhất).'));

  // 2) KHÁCH MỚI THEO TUẦN -----------------------------------------------
  // Tính theo NGÀY ĐĂNG KÝ (registered_at) — đúng nghĩa "khách mới" hơn ngày tạo
  // bản ghi; fallback created_at nếu khách cũ chưa có registered_at.
  const newByWeek = weeks.map(() => 0);
  all.forEach((c) => { const i = weekIdx(c.registered_at || c.created_at); if (i >= 0) newByWeek[i]++; });
  cards.push(dashCard('Khách mới theo tuần', vbars(newByWeek, weeks.map(ddmm)),
    '8 tuần gần nhất (theo ngày đăng ký).'));

  // 4) ĐIỂM QUAN TÂM TRUNG BÌNH + xu hướng --------------------------------
  // Mức quan tâm chỉ có nghĩa ở lớp Tiềm năng (lead chưa đánh giá — mốc 20% chỉ là khởi đầu).
  const withInterest = all.filter((c) => isQualified(c) && c.interest_level != null);
  const avgAll = withInterest.length ? Math.round(withInterest.reduce((s, c) => s + c.interest_level, 0) / withInterest.length) : 0;
  const wSum = weeks.map(() => 0), wCnt = weeks.map(() => 0);
  // Cũng gom theo NGÀY ĐĂNG KÝ để khớp với chart "Khách mới theo tuần" ở trên.
  withInterest.forEach((c) => { const i = weekIdx(c.registered_at || c.created_at); if (i >= 0) { wSum[i] += c.interest_level; wCnt[i]++; } });
  const avgByWeek = weeks.map((w, i) => (wCnt[i] ? Math.round(wSum[i] / wCnt[i]) : null));
  const trendHtml = `<div class="big-stat">${avgAll}%<span class="big-stat-cap">quan tâm TB toàn pipeline</span></div>`
    + `<div class="dash-sub-title">Xu hướng khách mới theo tuần</div>` + sparkline(avgByWeek, weeks.map(ddmm));
  cards.push(dashCard('Mức độ quan tâm trung bình', trendHtml,
    'Đường đi lên = khách mới vào đang "nóng" hơn; đi xuống = "nguội" hơn.'));

  // 5) PHÂN BỔ LOẠI CĂN / TOÀ (TẤT CẢ khách, mọi bậc) --------------------
  // limit: chỉ giữ top-N (bỏ trống = lấy hết). Loại căn để hết → tổng phân bổ = tổng
  // khách (mọi khách đều có loại căn). Mã toà giữ top 6 (toà có thể rất nhiều).
  // normFn: chuẩn hoá giá trị trước khi gộp (vd loại căn: "2N+,2WC" → "2N+, 2WC").
  const tally = (arr, key, limit, normFn) => {
    const m = {};
    arr.forEach((c) => {
      let v = (c[key] && String(c[key]).trim());
      if (v && normFn) v = normFn(v);
      if (v) m[v] = (m[v] || 0) + 1;
    });
    let entries = Object.entries(m).sort((a, b) => b[1] - a[1]);
    if (limit) entries = entries.slice(0, limit);
    return entries.map(([label, value]) => ({ label, value }));
  };
  const aptItems = tally(all, 'apt_type', 0, canonicalAptType);
  const bldItems = tally(all, 'building_code', 6);
  const distHtml = `<div class="dash-sub-title">Loại căn</div>${hbars(aptItems, { empty: 'Chưa có dữ liệu loại căn' })}`
    + `<div class="dash-sub-title">Mã toà</div>${hbars(bldItems, { empty: 'Chưa có dữ liệu mã toà', color: '#8a7bb0' })}`;
  cards.push(dashCard('Căn hộ quan tâm', distHtml,
    'Loại căn/toà "hot" nhất trên TẤT CẢ khách — feedback ngược cho đội dự án nên đẩy bán căn nào.'));

  // NGUỒN KHÁCH: số khách theo kênh + % lên Tiềm năng → biết kênh nào đáng chi tiền.
  const srcMap = {};
  all.forEach((c) => {
    const list = sourceListOf(c.source);
    (list.length ? list : ['?']).forEach((s) => {
      const m = srcMap[s] || (srcMap[s] = { n: 0, q: 0 });
      m.n++; if (isQualified(c)) m.q++;
    });
  });
  const srcItems = Object.entries(srcMap).sort((a, b) => b[1].n - a[1].n)
    .map(([s, m]) => ({ label: s === '?' ? 'Chưa rõ' : sourceLabel(s), value: m.n, sub: `· ${pctOf(m.q, m.n)}% Đạt` }));
  cards.push(dashCard('Nguồn khách', hbars(srcItems, { color: '#8a7bb0' }),
    'Số khách theo kênh và tỉ lệ Đạt (chuyển sang Đang chăm) — kênh nào ra khách thật.'));

  return cards;
}

// Bàn làm việc: mở khách / xem thêm nhóm / lọc theo bậc / nhảy theo chỉ số nhanh.
$('#dashboard-content')?.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) {
    const k = more.dataset.more;
    if (dashExpanded.has(k)) dashExpanded.delete(k); else dashExpanded.add(k);
    renderDashboard(); return;
  }
  const open = e.target.closest('[data-open]');
  // Mở tại chỗ (không đổi tab) để làm xong việc là quay lại đúng danh sách việc.
  if (open) {
    const c = allCustomers.find((x) => x.id === open.dataset.open);
    if (c) { if (isQualified(c)) openDetail(c.id); else openLeadSheet(c.id); }
    return;
  }
  const st = e.target.closest('[data-stage]');
  if (st) {
    progressFilter = 'active'; $('#progress-label').textContent = 'Đang chăm';
    $$('#progress-pop .status-opt').forEach((o) => o.classList.toggle('is-sel', o.dataset.value === 'active'));
    stageFilter = st.dataset.stage; syncStageLabel();
    showListView(); return;
  }
  const go = e.target.closest('[data-go]');
  if (!go) return;
  if (go.dataset.go === 'leads') { showLeadView(); return; }
  const target = { todo: '#dash-todo', week: '.dash-perf', pipeline: '.dash-pipe' }[go.dataset.go];
  const el = target && $(target);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// -------------------------------------------------------------- WIRE UP ---

function populateSelects() {
  // Bộ lọc "Tiến độ" nay là DROPDOWN tuỳ biến (như dropdown Trạng thái).
  // Trang chủ chỉ có khách lớp 2 → không liệt kê bậc thuộc lớp 1 (LEAD_ONLY_STAGES).
  $('#stage-pop').innerHTML = [['', 'Tất cả'], ...CARE_STAGE_OPTIONS.filter((s) => !LEAD_ONLY_STAGES.includes(s)).map((s) => [s, s])]
    .map(([val, label]) =>
      `<button type="button" class="status-opt${val === stageFilter ? ' is-sel' : ''}" data-value="${escapeHtml(val)}" role="option">${escapeHtml(label)}</button>`
    ).join('');
  syncStageLabel();

  renderSortOptions();

  // Form chỉ sửa tiến độ cho khách lớp 2 → bỏ bậc lớp 1 (lead dùng hộp "Khách mới").
  const formStageOptions = ['<option value="">— Chưa xác định —</option>', ...CARE_STAGE_OPTIONS.filter((s) => !LEAD_ONLY_STAGES.includes(s)).map((s) => `<option value="${s}">${s}</option>`)].join('');
  $('#customer-form').care_stage.innerHTML = formStageOptions;

  // Trạng thái liên lạc (độc lập với tiến độ) — dropdown trong form.
  const formContactOptions = ['<option value="">— Chưa xác định —</option>', ...CONTACT_STATUSES.map((s) => `<option value="${s}">${s}</option>`)].join('');
  $('#customer-form').contact_status.innerHTML = formContactOptions;

  // Kênh nguồn khách (SOURCES) trong form. (Bộ lọc kênh tab Khách mới tự dựng ở syncLeadFilterUI.)
  const srcOpts = Object.entries(SOURCES).map(([code, label]) => `<option value="${code}">${escapeHtml(label)}</option>`).join('');
  $('#customer-form').source_channel.innerHTML = srcOpts;
}

// ---- SẮP XẾP: trạng thái + render panel ----
// currentSort = null → MẶC ĐỊNH đa khoá (tiến độ↑ → quan tâm↓ → cập nhật mới nhất → tên A→Z).
// {key,dir} → sắp theo 1 thuộc tính. KHÔNG lưu lại → mỗi lần tải trang tự về mặc định.
// SẮP XẾP ĐA TIÊU CHÍ (multi-key): chọn nhiều tiêu chí, mỗi tiêu chí 1 hướng (tăng/giảm)
// bằng 2 tam giác ▲▼; ưu tiên theo THỨ TỰ hàng (Tiến độ > Quan tâm > Cập nhật > Tên).
// currentSort = mảng {key,dir} ĐANG áp dụng. Không lưu lại → mỗi lần tải trang về mặc định.
const SORT_ATTRS = [
  { key: 'care',     name: 'Tiến độ' },
  { key: 'interest', name: 'Quan tâm' },
  { key: 'updated',  name: 'Cập nhật' },
  { key: 'name',     name: 'Tên' },
];
// Mặc định: tiến độ↑ → quan tâm↓ → cập nhật mới nhất(giảm) → tên A→Z(tăng).
const DEFAULT_SORT = [
  { key: 'care', dir: 'asc' },
  { key: 'interest', dir: 'desc' },
  { key: 'updated', dir: 'desc' },
  { key: 'name', dir: 'asc' },
];
let currentSort = DEFAULT_SORT.map((x) => ({ ...x }));
let sortDraft = {}; // bản nháp trong panel: key -> 'asc'|'desc' (vắng mặt = không chọn)

// currentSort (mảng) → nháp (map) để panel hiển thị đúng trạng thái đang áp dụng.
function sortToDraft() {
  const d = {};
  for (const { key, dir } of currentSort) d[key] = dir;
  return d;
}
function renderSortOptions() {
  $('#sort-options').innerHTML = SORT_ATTRS.map((a) => {
    const dir = sortDraft[a.key]; // undefined | 'asc' | 'desc'
    const up = dir === 'asc' ? ' is-on' : '';
    const dn = dir === 'desc' ? ' is-on' : '';
    return `<div class="sort-row">
        <span class="sort-row-name">${a.name}</span>
        <span class="sort-tris" data-key="${a.key}">
          <button type="button" class="tri-btn tri-up${up}" data-dir="asc" aria-label="${a.name} tăng"></button>
          <button type="button" class="tri-btn tri-down${dn}" data-dir="desc" aria-label="${a.name} giảm"></button>
        </span>
      </div>`;
  }).join('');
}

// ---- Panel công cụ (Bộ lọc / Sắp xếp / Trạng thái): mở/đóng ----
// Đóng các pop "chốc lát" (Sắp xếp + dropdown Trạng thái + dropdown Tiến độ). KHÔNG đóng panel Bộ lọc.
function closeTransientPops() {
  $('#sort-panel').hidden = true; $('#sort-btn').classList.remove('is-open');
  const io = $('#io-menu-pop');
  if (io) { io.hidden = true; $('#io-menu-btn').classList.remove('is-open'); $('#io-menu-btn').setAttribute('aria-expanded', 'false'); }
  const pp = $('#progress-pop');
  if (pp) { pp.hidden = true; $('#progress-btn').classList.remove('is-open'); $('#progress-btn').setAttribute('aria-expanded', 'false'); }
  closeStagePop();
}
function closeStagePop() {
  const sp = $('#stage-pop');
  if (sp) { sp.hidden = true; $('#stage-btn').classList.remove('is-open'); $('#stage-btn').setAttribute('aria-expanded', 'false'); }
}
// Đồng bộ nhãn nút Tiến độ + đánh dấu mục đang chọn theo stageFilter.
function syncStageLabel() {
  const lbl = $('#stage-label');
  if (lbl) lbl.textContent = stageFilter || 'Tất cả';
  $$('#stage-pop .status-opt').forEach((o) => o.classList.toggle('is-sel', o.dataset.value === stageFilter));
}
// Đóng TẤT CẢ (gồm cả panel Bộ lọc). Dùng cho các đóng CHỦ ĐÍCH: bấm icon phễu, nút "Áp dụng".
function closeToolPops() {
  $('#filter-panel').hidden = true; $('#filter-btn').classList.remove('is-open');
  closeTransientPops();
}
// ---- Bộ lọc THỜI GIAN ĐĂNG KÝ ----
const VI_WD_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // getDay() 0=CN..6=T7
function dmyShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
}
function viWdShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : VI_WD_SHORT[d.getDay()];
}
// Khoảng thời gian đang lọc → { start, end } (ms, end LOẠI TRỪ), hoặc null = không lọc.
function dateFilterRange() {
  const now = new Date();
  const p = dateFilter.preset;
  if (p === 'today') {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return { start: s.getTime(), end: s.getTime() + 86400000 };
  }
  if (p === 'week') {
    const s = mondayOf(now);                 // Thứ Hai 00:00 tuần này (helper sẵn có)
    const e = new Date(s); e.setDate(e.getDate() + 7);
    return { start: s.getTime(), end: e.getTime() };
  }
  if (p === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: s.getTime(), end: e.getTime() };
  }
  if (p === 'custom') {
    let start = -Infinity, end = Infinity;
    if (dateFilter.from) { const s = new Date(dateFilter.from + 'T00:00:00'); if (!isNaN(s.getTime())) start = s.getTime(); }
    if (dateFilter.to)   { const e = new Date(dateFilter.to + 'T00:00:00');   if (!isNaN(e.getTime())) end = e.getTime() + 86400000; } // gồm cả ngày "đến"
    if (start === -Infinity && end === Infinity) return null; // custom nhưng chưa chọn ngày → không lọc
    return { start, end };
  }
  return null; // 'all'
}
// ---- Lịch tuỳ biến chọn KHOẢNG ngày (1 bảng). Chọn ngày ÁP LỌC NGAY (real-time);
//      panel chỉ đóng bằng nút "Áp dụng" đáy panel (hoặc bấm lại icon phễu). ----
let calMonth = null; // Date của mùng 1 tháng đang hiển thị
// Vẽ lịch: header đổi tháng + hàng thứ (T2..CN) + lưới ngày. Ngày đầu/cuối tô đậm,
// các ngày GIỮA tô cùng màu nhạt (~½ opacity).
function renderCalendar() {
  const box = $('#filter-date-custom');
  if (!box) return;
  const fromC = dateFilter.from, toC = dateFilter.to;
  // THU GỌN: đã chọn xong khoảng và không đang mở lịch → chỉ hiện thanh tóm tắt (bấm để mở lại).
  if (!calExpanded && fromC) {
    const rangeTxt = toC ? `${viWdShort(fromC)} ${dmyShort(fromC)} → ${viWdShort(toC)} ${dmyShort(toC)}`
                         : `${viWdShort(fromC)} ${dmyShort(fromC)}`;
    box.innerHTML = `<button type="button" class="cal-collapsed" data-cal-expand>
        <span class="cal-col-range">${escapeHtml(rangeTxt)}</span>
        <span class="cal-col-edit">Đổi ▾</span>
      </button>`;
    return;
  }
  if (!calMonth) {
    const base = fromC ? new Date(fromC + 'T00:00:00') : new Date();
    calMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  }
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // số ô trống đầu (bắt đầu từ Thứ Hai)
  const from = dateFilter.from, to = dateFilter.to;
  const hasRange = !!(from && to && to !== from);
  const todayIso = isoDateLocal(new Date());

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="cal-day cal-empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoDateLocal(new Date(y, m, d));
    let cls = 'cal-day';
    if (iso === from && !hasRange) cls += ' is-single';       // chỉ mới chọn 1 đầu → 1 ngày tròn
    else if (iso === from) cls += ' is-start';
    if (iso === to && hasRange) cls += ' is-end';
    if (hasRange && iso > from && iso < to) cls += ' is-range'; // ngày giữa → màu nhạt
    if (iso === todayIso) cls += ' is-today';
    cells += `<button type="button" class="${cls}" data-date="${iso}">${d}</button>`;
  }

  const summary = from
    ? (to ? `${viWdShort(from)} ${dmyShort(from)} → ${viWdShort(to)} ${dmyShort(to)}`
          : `${viWdShort(from)} ${dmyShort(from)} → chọn ngày kết thúc`)
    : 'Chọn ngày bắt đầu';

  box.innerHTML = `
    <div class="cal-summary">${escapeHtml(summary)}</div>
    <div class="cal-head">
      <button type="button" class="cal-nav" data-cal-nav="-1" aria-label="Tháng trước">‹</button>
      <span class="cal-month">Tháng ${m + 1}/${y}</span>
      <button type="button" class="cal-nav" data-cal-nav="1" aria-label="Tháng sau">›</button>
    </div>
    <div class="cal-weekdays"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div>
    <div class="cal-grid">${cells}</div>`;
}
// Chọn 1 ngày: cập nhật khoảng + ÁP LỌC NGAY (không đóng panel). Chưa có/đủ cặp → bắt đầu
// khoảng mới; có ngày đầu → chốt ngày cuối (tự sắp min/max nếu bấm ngược).
function calPick(iso) {
  if (!dateFilter.from || dateFilter.to) { dateFilter.from = iso; dateFilter.to = null; }
  else if (iso < dateFilter.from) { dateFilter.to = dateFilter.from; dateFilter.from = iso; }
  else { dateFilter.to = iso; }
  dateFilter.preset = 'custom';
  if (dateFilter.from && dateFilter.to) calExpanded = false; // chọn xong khoảng → tự thu gọn lịch
  renderCalendar();
  updateFilterDot();
  renderList(); // real-time: danh sách cập nhật ngay theo khoảng đang chọn
}
// Đồng bộ UI preset + hiện/ẩn lịch theo state dateFilter.
function syncDatePresetUI() {
  $$('#filter-date-presets .date-preset').forEach((b) => b.classList.toggle('is-sel', b.dataset.preset === dateFilter.preset));
  const custom = $('#filter-date-custom');
  if (!custom) return;
  if (dateFilter.preset === 'custom') { custom.hidden = false; renderCalendar(); }
  else custom.hidden = true;
}

// Reuse the existing preset buttons; custom bedroom counts appear when present.
let _aptGroupRecords = null, _aptGroups = [];
function renderAptTypeFilter(id, selected) {
  if (_aptGroupRecords !== allCustomers) {
    const groups = new Set(['1N', '2N', '3N']);
    for (const type of [...APT_TYPES, ...allCustomers.map((c) => c.apt_type)]) {
      const group = CRMSearch.apartmentGroup(type);
      if (/^\d+N$/.test(group)) groups.add(group);
    }
    _aptGroups = [...groups]; _aptGroupRecords = allCustomers;
  }
  const groups = new Set(_aptGroups);
  if (/^\d+N$/.test(selected)) groups.add(selected);
  const choices = [['', 'Tất cả'], ['Studio', 'Studio'],
    ...[...groups].sort((a,b) => parseInt(a)-parseInt(b)).map((v) => [v,v]),
    ['other','Khác'], ['missing','Chưa rõ']];
  $('#'+id).innerHTML = choices.map(([value,label]) =>
    `<button type="button" class="date-preset${selected === value ? ' is-sel' : ''}" data-apt-group="${value}" aria-pressed="${selected === value}">${label}</button>`).join('');
}
// Chấm báo "đang có lọc nâng cao" trên icon phễu (tiến độ ≠ tất cả HOẶC quan tâm >0 HOẶC có lọc thời gian).
function isAdvancedFilterActive() {
  const interest = Number($('#filter-min-interest').value || 0);
  return !!(stageFilter || aptTypeFilter || interest > 0 || dateFilterRange() || (custGroup === 'team' && ownerScope !== 'all'));
}
// Đồng bộ 2 chỉ báo "đang có lọc nâng cao": chấm đỏ trên icon phễu + nút "Xoá lọc ✕"
// cạnh dòng "[x] khách hàng". Cả 2 chỉ hiện khi có lọc khác mặc định (giữ UI gọn).
function updateFilterDot() {
  renderAptTypeFilter('filter-apt-presets', aptTypeFilter);
  renderOwnerScope('filter-owner-group', 'filter-owner-presets');
  const active = isAdvancedFilterActive();
  $('#filter-active-dot').hidden = !active;
  const clearBtn = $('#clear-filter-inline');
  if (clearBtn) clearBtn.hidden = !active;
}
// Đưa bộ lọc nâng cao về mặc định (tiến độ = Tất cả, quan tâm ≥ 0%).
function resetAdvancedFilters() {
  aptTypeFilter = ''; ownerScope = 'all'; resetSearchPages();
  stageFilter = '';
  syncStageLabel(); closeStagePop();
  $('#filter-min-interest').value = 0;
  $('#filter-interest-val').textContent = '0';
  dateFilter = { preset: 'all', from: null, to: null };
  calMonth = null; calExpanded = true; // lần mở lịch sau: tháng hiện tại + mở sẵn
  syncDatePresetUI();
  updateFilterDot();
  renderList();
}

// ============ XUẤT / NHẬP EXCEL (SheetJS nạp động khi cần) ============
// Nạp SheetJS 1 lần từ CDN (giống Supabase). CHỈ tải khi bấm Xuất/Nhập → nhẹ lúc khởi động.
let _xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('Không nạp được thư viện Excel.')));
    s.onerror = () => { _xlsxPromise = null; reject(new Error('Không tải được thư viện Excel (cần mạng).')); };
    document.head.appendChild(s);
  });
  return _xlsxPromise;
}

// Catalog thuộc tính dùng CHUNG cho export + import. def = tick sẵn khi export.
const IO_FIELDS = [
  { key: 'full_name',      label: 'Họ tên',              def: true  },
  { key: 'phone',          label: 'Số điện thoại',       def: true  },
  { key: 'gender',         label: 'Giới tính',           def: false },
  { key: 'dob',            label: 'Ngày sinh',           def: false },
  { key: 'marital_status', label: 'Hôn nhân',            def: false },
  { key: 'residence',      label: 'Thường trú',          def: false },
  { key: 'occupation',     label: 'Công việc',           def: false },
  { key: 'income',         label: 'Thu nhập',            def: false },
  { key: 'projects',       label: 'Dự án',               def: true  },
  { key: 'apt_type',       label: 'Loại căn',            def: true  },
  { key: 'registered_at',  label: 'Thời gian đăng kí',   def: false },
  { key: 'interest_level', label: 'Mức quan tâm',        def: false },
  { key: 'care_stage',     label: 'Tiến độ chăm sóc',    def: false },
  { key: 'contact_status', label: 'Trạng thái liên lạc', def: false },
];
const IO_LABEL = Object.fromEntries(IO_FIELDS.map((f) => [f.key, f.label]));

function ioFmtDateTime(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  const p = (n) => ('0' + n).slice(-2);
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Giá trị 1 ô khi XUẤT.
function exportCell(c, key) {
  switch (key) {
    case 'full_name': return c.full_name || '';
    case 'phone': return c.phone || '';
    case 'gender': return c.gender ? capitalize(c.gender) : '';
    case 'dob': return c.dob ? formatDob(c.dob) : '';
    case 'marital_status': return c.marital_status ? capitalize(c.marital_status) : '';
    case 'residence': return c.residence || '';
    case 'occupation': return c.occupation || '';
    case 'income': return c.income || '';
    case 'projects': return Array.isArray(c.projects) ? c.projects.join(', ') : '';
    case 'apt_type': return canonicalAptType(c.apt_type) || '';
    case 'registered_at': return c.registered_at ? ioFmtDateTime(c.registered_at) : '';
    case 'interest_level': return c.interest_level != null ? c.interest_level : '';
    case 'care_stage': return c.care_stage || '';
    case 'contact_status': return c.contact_status || '';
    default: return '';
  }
}

// ---- XUẤT ----
function openExportModal() {
  $('#export-fields').innerHTML = IO_FIELDS.map((f) =>
    `<label><input type="checkbox" value="${f.key}"${f.def ? ' checked' : ''} /> ${escapeHtml(f.label)}</label>`
  ).join('');
  $('#export-count').textContent = `Sẽ xuất ${visibleCustomers().length} khách (theo lọc + sắp xếp hiện tại).`;
  $('#export-status').textContent = '';
  $('#export-modal').showModal();
}
async function doExport() {
  const keys = [...$('#export-fields').querySelectorAll('input:checked')].map((i) => i.value);
  if (!keys.length) { $('#export-status').textContent = '⚠️ Chọn ít nhất 1 cột.'; return; }
  const list = visibleCustomers();
  if (!list.length) { $('#export-status').textContent = '⚠️ Không có khách nào để xuất.'; return; }
  $('#export-status').textContent = '⏳ Đang tạo file…';
  try {
    const XLSX = await loadXLSX();
    const rows = [keys.map((k) => IO_LABEL[k]), ...list.map((c) => keys.map((k) => exportCell(c, k)))];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = keys.map((k) => ({ wch: (k === 'full_name' || k === 'residence') ? 22 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
    const d = new Date(), p = (n) => ('0' + n).slice(-2);
    XLSX.writeFile(wb, `khach-hang-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.xlsx`);
    $('#export-status').textContent = `✅ Đã xuất ${list.length} khách.`;
  } catch (e) { console.warn('export lỗi:', e); $('#export-status').textContent = '⚠️ ' + (e.message || 'Xuất thất bại.'); }
}

// ---- NHẬP ----
const IMPORT_TPL_KEY = 'crm_import_templates'; // 2 mẫu gán cột gần nhất
let importRows = null;   // toàn bộ dòng đọc từ file (array-of-arrays)
let importColCount = 0;

function importColOptions(selected) {
  let html = `<option value=""${selected === '' ? ' selected' : ''}>— Bỏ qua cột này —</option>`;
  for (const f of IO_FIELDS) html += `<option value="${f.key}"${selected === f.key ? ' selected' : ''}>${escapeHtml(f.label)}</option>`;
  html += `<option value="__note"${selected === '__note' ? ' selected' : ''}>Ghi chú</option>`;
  return html;
}
function loadImportTemplates() {
  try { const t = JSON.parse(localStorage.getItem(IMPORT_TPL_KEY) || '[]'); return Array.isArray(t) ? t : []; } catch { return []; }
}
function saveImportTemplate(mapping, headerRow) {
  let tpls = loadImportTemplates().filter((t) => JSON.stringify(t.mapping) !== JSON.stringify(mapping));
  tpls.unshift({ mapping, headerRow, at: new Date().toISOString() });
  try { localStorage.setItem(IMPORT_TPL_KEY, JSON.stringify(tpls.slice(0, 2))); } catch { /* ignore */ }
}
function openImportModal() {
  importRows = null; importColCount = 0;
  $('#import-step-file').hidden = false;
  $('#import-step-map').hidden = true;
  $('#import-status').textContent = '';
  $('#import-file-input').value = '';
  $('#import-modal').showModal();
}
async function onImportFile(file) {
  if (!file) return;
  $('#import-status').textContent = '⏳ Đang đọc file…';
  try {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    importRows = rows.filter((r) => r.some((v) => String(v).trim() !== '')); // bỏ dòng rỗng
    if (!importRows.length) { $('#import-status').textContent = '⚠️ File trống.'; return; }
    importColCount = Math.max(...importRows.map((r) => r.length));
    $('#import-file-name').textContent = `${file.name} — ${importRows.length} dòng, ${importColCount} cột.`;
    renderImportMap();
    $('#import-step-file').hidden = true;
    $('#import-step-map').hidden = false;
    $('#import-status').textContent = '';
  } catch (e) { console.warn('đọc file lỗi:', e); $('#import-status').textContent = '⚠️ ' + (e.message || 'Không đọc được file.'); }
}
// Đoán thuộc tính cho 1 cột theo tên tiêu đề:
//  • khớp label thuộc tính → thuộc tính đó;
//  • có tiêu đề nhưng KHÔNG khớp → mặc định "Ghi chú" (cột dư → ghi chú, theo yêu cầu);
//  • không có tiêu đề (không tick dòng tiêu đề) → để trống, người dùng tự chọn.
function guessColKey(headerText) {
  const s = String(headerText || '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  const f = IO_FIELDS.find((x) => x.label.toLowerCase() === low);
  if (f) return f.key;
  return '__note';
}
function renderImportMap(presetMapping) {
  const headerRow = $('#import-header').checked;
  const headers = headerRow && importRows.length ? importRows[0] : [];
  const sampleRow = importRows[headerRow ? 1 : 0] || [];
  let html = '';
  for (let i = 0; i < importColCount; i++) {
    const sel = presetMapping ? (presetMapping[i] || '') : guessColKey(headers[i]);
    const colName = headerRow && headers[i] ? escapeHtml(String(headers[i])) : `Cột ${i + 1}`;
    const sv = sampleRow[i]; const svt = sv == null ? '' : (sv instanceof Date ? ioFmtDateTime(sv.toISOString()) : String(sv).trim());
    const sample = svt ? `vd: ${escapeHtml(svt.slice(0, 30))}` : 'trống';
    html += `<div class="io-col">
      <div class="io-col-info"><div class="io-col-name">${colName}</div><div class="io-col-sample">${sample}</div></div>
      <select data-col="${i}">${importColOptions(sel)}</select>
    </div>`;
  }
  $('#import-map').innerHTML = html;
  const tpls = loadImportTemplates();
  $('#import-templates').innerHTML = tpls.map((t, idx) => `<button type="button" data-tpl="${idx}">Dùng mẫu gần đây ${idx + 1}</button>`).join('');
}
function currentImportMapping() {
  const m = [];
  $('#import-map').querySelectorAll('select[data-col]').forEach((s) => { m[+s.dataset.col] = s.value; });
  return m;
}
function parseImportDob(raw) {
  const p = (n) => ('0' + n).slice(-2);
  if (raw instanceof Date && !isNaN(raw)) return `${raw.getFullYear()}-${p(raw.getMonth() + 1)}-${p(raw.getDate())}`;
  const s = String(raw || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/); if (m) return `${m[1]}-${p(+m[2])}-${p(+m[3])}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); if (m) return `${m[3]}-${p(+m[2])}-${p(+m[1])}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/); if (m) return `--${p(+m[2])}-${p(+m[1])}`; // chỉ ngày+tháng
  return null;
}
function parseImportDate(raw) {
  if (raw instanceof Date && !isNaN(raw)) return raw.toISOString();
  const s = String(raw || '').trim(); if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[\sT]+(\d{1,2}):(\d{2}))?$/);
  if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)); return isNaN(d) ? null : d.toISOString(); }
  const d = new Date(s); return isNaN(d) ? null : d.toISOString();
}
function parseImportValue(key, raw) {
  const isDate = raw instanceof Date;
  const s = isDate ? raw : String(raw == null ? '' : raw).trim();
  if (!isDate && s === '') return null;
  switch (key) {
    case 'full_name': case 'phone': case 'residence': case 'income': case 'contact_status':
      return String(s).trim() || null;
    case 'gender': { const g = String(s).toLowerCase(); if (['nam', 'male', 'm'].includes(g)) return 'nam'; if (['nữ', 'nu', 'female', 'f'].includes(g)) return 'nữ'; return g ? 'khác' : null; }
    case 'marital_status': { const g = String(s).toLowerCase(); if (g.includes('đã') || g.includes('married')) return 'đã kết hôn'; if (g.includes('chưa') || g.includes('single')) return 'chưa kết hôn'; return null; }
    case 'occupation': { const f = OCCUPATIONS.find((o) => o.toLowerCase() === String(s).toLowerCase()); return f || (String(s).trim() || null); }
    case 'dob': return parseImportDob(raw);
    case 'registered_at': return parseImportDate(raw);
    case 'apt_type': return canonicalAptType(String(s).trim()) || null;
    case 'projects': return String(s).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    case 'interest_level': { const n = Math.round(Number(String(s).replace('%', '').trim())); return isFinite(n) ? Math.max(0, Math.min(100, n)) : null; }
    case 'care_stage': { const st = String(s).trim(); return CARE_STAGE_OPTIONS.find((x) => x.toLowerCase() === st.toLowerCase()) || null; }
    default: return null;
  }
}
async function doImport() {
  if (!importRows) return;
  if (!CRM.isOnline()) { $('#import-status').textContent = '⚠️ Cần mạng để nhập (ghi lên server).'; return; }
  const headerRow = $('#import-header').checked;
  const mapping = currentImportMapping();
  if (!mapping.includes('phone') || !mapping.includes('full_name')) {
    $('#import-status').textContent = '⚠️ Cần gán ít nhất cột "Số điện thoại" và "Họ tên".'; return;
  }
  saveImportTemplate(mapping, headerRow); // lưu mẫu (giữ 2 gần nhất)
  const dataRows = headerRow ? importRows.slice(1) : importRows;
  const headers = importRows[0] || [];
  let added = 0, dup = 0, skipped = 0, err = 0;
  const seen = new Set(allCustomers.map((c) => normalizePhoneVN(c.phone)));
  $('#import-status').textContent = '⏳ Đang nhập…';
  for (const row of dataRows) {
    try {
      const payload = {}; const noteParts = [];
      for (let i = 0; i < mapping.length; i++) {
        const key = mapping[i]; if (!key) continue;
        if (key === '__note') {
          const cell = row[i];
          const t = cell instanceof Date ? ioFmtDateTime(cell.toISOString()) : String(cell == null ? '' : cell).trim();
          if (t) noteParts.push((headerRow && headers[i] ? String(headers[i]) + ': ' : '') + t);
          continue;
        }
        const v = parseImportValue(key, row[i]);
        if (v != null) payload[key] = v;
      }
      const phone = payload.phone ? normalizePhoneVN(payload.phone) : '';
      if (!phone || !payload.full_name) { skipped++; continue; }
      if (seen.has(phone)) { dup++; continue; }
      payload.phone = phone;
      if (payload.dob) {
        payload.menh = window.LunarUtil.calcMenhFromSolarDOB(payload.dob) || null;
        payload.cung = window.LunarUtil.calcCungFromDOB(payload.dob) || null;
      }
      if (payload.interest_level == null) payload.interest_level = INTEREST_DEFAULT_NEW; // mặc định như form
      if (!payload.care_stage) payload.care_stage = CARE_STAGE_DEFAULT;
      if (!payload.source) payload.source = [SOURCE_DEFAULT];
      payload.intake_method = 'import';
      const rec = await CRM.create(payload, {});
      const note = noteParts.join(' · ');
      if (note) await CRM.addNote(rec.id, note);
      seen.add(phone); added++;
    } catch (e) { console.warn('import row lỗi:', e); err++; }
  }
  allCustomers = await CRM.list();
  if (!$('#dashboard-view').hidden) renderDashboard(); else renderList();
  $('#import-status').textContent = `✅ Xong: thêm ${added}, trùng bỏ qua ${dup}, thiếu SĐT/tên ${skipped}` + (err ? `, lỗi ${err}` : '') + '.';
}

document.addEventListener('DOMContentLoaded', () => {
  populateSelects();
  buildAdvancedForm(); // dựng input hồ sơ Nâng cao 1 lần
  boot();
  setTimeout(hideSplash, 8000); // lưới an toàn: nếu boot treo, vẫn bỏ splash sau 8s

  $('#login-form').addEventListener('submit', handleLogin);
  $('#signup-btn').addEventListener('click', handleSignup);
  $('#logout-btn').addEventListener('click', handleLogout);

  // Mẫu tin Zalo: mở modal (từ menu avatar) → sửa tên/nội dung từng mẫu, thêm/xoá mẫu riêng → Lưu.
  const defaultIds = () => defaultZaloTemplates().map((t) => t.id);
  const renderTplEditor = (list) => {
    const ids = defaultIds();
    $('#tpl-list').innerHTML = list.map((t) => `
      <div class="tpl-item" data-id="${escapeHtml(t.id)}">
        <div class="tpl-row">
          <input class="tpl-name" value="${escapeHtml(t.name || '')}" placeholder="Tên mẫu" maxlength="60" />
          ${ids.includes(t.id) ? '' : '<button type="button" class="tpl-del" aria-label="Xoá mẫu">Xoá</button>'}
        </div>
        <textarea class="tpl-text greeting-text" rows="4" placeholder="Nội dung tin nhắn… (để trống = ẩn mẫu này)">${escapeHtml(t.text || '')}</textarea>
      </div>`).join('');
  };
  const readTplEditor = () => $$('#tpl-list .tpl-item').map((el) => ({
    id: el.dataset.id, name: el.querySelector('.tpl-name').value.trim() || 'Mẫu', text: el.querySelector('.tpl-text').value,
  }));
  $('#zalo-greeting-btn').addEventListener('click', () => {
    $('#topbar-menu').classList.remove('open'); // đóng menu avatar
    renderTplEditor(getZaloTemplates());
    $('#greeting-modal').showModal();
  });
  $('#tpl-add').addEventListener('click', () => {
    const list = readTplEditor(); list.push({ id: 'u_' + Date.now(), name: '', text: '' });
    renderTplEditor(list);
    const items = $$('#tpl-list .tpl-item'); items[items.length - 1].querySelector('.tpl-name').focus();
  });
  $('#tpl-list').addEventListener('click', (e) => {
    const d = e.target.closest('.tpl-del'); if (!d) return;
    d.closest('.tpl-item').remove();
  });
  $('#tpl-reset').addEventListener('click', () => {
    if (!confirm('Đưa các mẫu về nội dung mặc định? (Mẫu bạn tự thêm sẽ bị xoá khi bấm Lưu)')) return;
    renderTplEditor(defaultZaloTemplates());
  });
  $('#greeting-cancel').addEventListener('click', () => $('#greeting-modal').close());
  $('#greeting-save').addEventListener('click', () => {
    setZaloTemplates(readTplEditor());
    $('#greeting-modal').close();
    showToast('Đã lưu mẫu tin Zalo');
  });

  $('#add-customer-btn').addEventListener('click', () => openForm(null));
  // Nút 3 chấm (Dữ liệu): mở/đóng menu Nhập/Xuất (mẫu giống Sắp xếp).
  $('#io-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = $('#io-menu-pop').hidden;
    closeToolPops();
    $('#io-menu-pop').hidden = !willOpen;
    $('#io-menu-btn').classList.toggle('is-open', willOpen);
    $('#io-menu-btn').setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  // Xuất Excel (trong menu 3 chấm)
  $('#export-btn').addEventListener('click', () => { closeTransientPops(); openExportModal(); });
  $('#export-close').addEventListener('click', () => $('#export-modal').close());
  $('#export-cancel').addEventListener('click', () => $('#export-modal').close());
  $('#export-do').addEventListener('click', doExport);
  // Nhập Excel (trong menu 3 chấm)
  $('#import-btn').addEventListener('click', () => { closeTransientPops(); openImportModal(); });
  $('#import-close').addEventListener('click', () => $('#import-modal').close());
  $('#import-pick').addEventListener('click', () => $('#import-file-input').click());
  $('#import-file-input').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; onImportFile(f); });
  $('#import-back').addEventListener('click', () => { $('#import-step-map').hidden = true; $('#import-step-file').hidden = false; });
  $('#import-header').addEventListener('change', () => { if (importRows) renderImportMap(); });
  $('#import-do').addEventListener('click', doImport);
  $('#import-templates').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tpl]'); if (!b) return;
    const t = loadImportTemplates()[+b.dataset.tpl];
    if (t) { $('#import-header').checked = !!t.headerRow; renderImportMap(t.mapping); }
  });
  $('#tab-customers').addEventListener('click', () => {
    let g = custGroup; try { g = localStorage.getItem(LS_CUST_GROUP) || g; } catch { /* bỏ qua */ }
    showCustomerGroup(g);
  });
  $('#cust-subtabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]'); if (!b) return;
    closeToolPops(); resetSearchPages(); showCustomerGroup(b.dataset.group);
  });
  $('#tab-dashboard').addEventListener('click', showDashboardView);
  $('#tool-loan-btn').addEventListener('click', () => { $('#topbar-menu').classList.remove('open'); showLoanView(); window.scrollTo(0, 0); });
  $('#loan-back-btn').addEventListener('click', showDashboardView);
  $('#customer-form').building_code.addEventListener('input', refreshAptSuggestions);
  $('#customer-form').apt_code.addEventListener('change', () => { fillFromCatalogUnit(); fillTypicalArea(); }); // xoá/đổi mã căn → diện tích tự điền quay về điển hình
  $('#detail-back-btn').addEventListener('click', closeDetailToList);
  $('#detail-edit-btn').addEventListener('click', () => { if (detailId) openForm(detailId); });
  // Nút trên thanh mini dính đỉnh (kiểu FB) — cùng hành vi với nút nổi trên cover.
  $('#detail-back-btn-sticky').addEventListener('click', closeDetailToList);
  $('#detail-edit-btn-sticky').addEventListener('click', () => { if (detailId) openForm(detailId); });
  // Hiện thanh mini khi CUỘN qua khỏi cover (cover rời khỏi đỉnh viewport). IntersectionObserver
  // theo dõi cover: còn thấy cover → ẩn thanh; cover trôi lên hết → hiện thanh.
  const coverEl = $('#detail-cover');
  if (coverEl && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      const showBar = !entries[0].isIntersecting && !$('#detail-screen').hidden;
      $('#detail-stickybar').classList.toggle('is-visible', showBar);
    }, { threshold: 0, rootMargin: '-4px 0px 0px 0px' });
    io.observe(coverEl);
  }
  $('#detail-schedule-btn').addEventListener('click', () => { if (detailId) openScheduler(detailId); });
  $('#customer-form').addEventListener('submit', async (e) => {
    // Lỗi bất kỳ khi lưu → báo rõ (trước đây lỗi im lặng: bấm Lưu không thấy gì).
    try { await handleFormSubmit(e); }
    catch (err) { console.error('Lưu khách lỗi:', err); alert('⚠️ Không lưu được khách: ' + (err && err.message ? err.message : err)); }
  });
  // Ô sai định dạng nằm trong nhóm "Mở rộng" đang gập → trình duyệt không hiện được thông báo
  // (bấm Lưu im lặng). Tự MỞ nhóm chứa ô đó + cuộn tới để thấy thông báo.
  $('#customer-form').addEventListener('invalid', (e) => {
    let el = e.target.parentElement;
    while (el && el.id !== 'customer-form') { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
  }, true);
  $('#cancel-form-btn').addEventListener('click', closeForm);
  $('#delete-customer-btn').addEventListener('click', () => { if (editingId) confirmDelete(editingId); });
  wireDobInput(); // ô ngày sinh dd/MM/YYYY (tự nhảy đoạn + preview Mệnh/Cung)
  $('#customer-form').care_stage.addEventListener('change', onCareStageChange);
  $('#customer-form').apt_type_select.addEventListener('change', toggleAptOther);
  $('#customer-form').apt_type_select.addEventListener('change', fillTypicalArea);
  $('#customer-form').apt_type_other.addEventListener('change', fillTypicalArea);
  // Sửa tay diện tích / giá → thôi tự điền cho ô đó (giữ số bạn nhập).
  $('#customer-form').apt_area.addEventListener('input', () => {
    areaAuto = false; syncAreaAutoTag();
    // Giá đang tự tính → tính lại theo diện tích vừa sửa (diện tích × đơn giá điển hình).
    const f = $('#customer-form'), a = Number(f.apt_area.value);
    if (priceAuto && lastUnitPrice && a > 0) f.apt_price.value = Math.round(a * lastUnitPrice);
  });
  $('#customer-form').apt_price.addEventListener('input', () => { priceAuto = false; });

  // --- OCR: "Nhập từ ảnh" mở modal Chọn ảnh (chỉ hiện nút nếu đã cấu hình WORKER_URL) ---
  if ((window.APP_CONFIG.WORKER_URL || '').trim()) $('#ocr-row').hidden = false;
  $('#ocr-btn').addEventListener('click', () => openImagePicker('ocr'));
  $('#ocr-retry-btn').addEventListener('click', () => { if (lastOcrFile) handleOcrImage(lastOcrFile); });

  // --- Modal Chọn ảnh (dùng chung OCR + avatar) ---
  $('#imgp-file').addEventListener('click', () => $('#imgp-file-input').click());
  $('#imgp-file-input').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; onImagePicked(f);
  });
  $('#imgp-paste').addEventListener('click', imgPickerPasteBtn);
  $('#imgp-close').addEventListener('click', () => { imgPickerMode = null; closeImagePicker(); });

  // ROUTER DÁN ẢNH bằng PHÍM/PICKER (Ctrl/Cmd+V, Windows+V, Maccy...): các cách này để BẠN
  // CHỌN đúng ảnh rồi OS "paste" → bắn 'paste' event kèm ảnh đó. Chỉ nhận khi modal Chọn
  // ảnh đang mở → đưa ảnh vào đúng luồng. Dán CHỮ (SĐT) vào ô input vẫn chạy bình thường.
  document.addEventListener('paste', (e) => {
    if (!$('#img-picker').open) return; // chỉ khi modal Chọn ảnh đang mở
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const blob = it.getAsFile();
        if (blob) { e.preventDefault(); onImagePicked(blob); return; }
      }
    }
  });

  // --- Dropdown dự án (chọn nhiều / thêm / xoá) ---
  $('#proj-dropdown-btn').addEventListener('click', () => {
    const p = $('#proj-dropdown-panel'); p.hidden = !p.hidden;
  });
  // Tích/bỏ tích 1 dự án (checkbox)
  $('#proj-options').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-projtoggle]');
    if (!cb) return;
    const name = cb.dataset.projtoggle;
    const i = selectedProjects.indexOf(name);
    if (cb.checked && i === -1) selectedProjects.push(name);
    else if (!cb.checked && i !== -1) selectedProjects.splice(i, 1);
    renderProjSelect();
  });
  // Xoá 1 dự án khỏi danh sách (chế độ Quản lý)
  $('#proj-options').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-projdel]');
    if (!del) return;
    const opt = projectOptions.find((o) => o.id === del.dataset.projdel);
    const nUnits = opt ? Catalog.unitsOfProject(opt.id).length : 0;
    const nB = opt ? Catalog.buildingsOf(opt.id).length : 0;
    if (opt && confirm(`Xoá dự án "${opt.name}" khỏi giỏ hàng?` +
        (nB || nUnits ? `\nSẽ xoá luôn ${nB} toà, ${nUnits} căn của dự án này.` : '') +
        '\n(Khách đã lưu không bị ảnh hưởng)')) {
      await removeProjectOption(opt.id);
      selectedProjects = selectedProjects.filter((n) => n !== opt.name);
      renderProjSelect();
    }
  });
  $('#proj-add-btn').addEventListener('click', () => {
    $('#proj-add-row').hidden = false;
    $('#proj-add-btn').hidden = true;
    $('#proj-add-input').value = '';
    $('#proj-add-input').focus();
  });
  // Đóng dropdown khi bấm ra ngoài
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.proj-dropdown')) $('#proj-dropdown-panel').hidden = true;
  });
  $('#proj-manage-btn').addEventListener('click', () => {
    projManageMode = !projManageMode;
    $('#proj-dropdown-panel').hidden = false; // mở panel để thấy nút xoá
    renderProjSelect();
  });
  $('#proj-add-ok').addEventListener('click', async () => {
    const name = $('#proj-add-input').value.trim();
    if (!name) return;
    if (await addProjectOption(name)) {
      if (!selectedProjects.includes(name)) selectedProjects.push(name);
      $('#proj-add-row').hidden = true;
      $('#proj-add-btn').hidden = false;
      renderProjSelect();
    }
  });
  $('#proj-add-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#proj-add-ok').click(); } });
  $('#proj-add-cancel').addEventListener('click', () => { $('#proj-add-row').hidden = true; $('#proj-add-btn').hidden = false; });
  $('#customer-form').interest_level.addEventListener('input', (e) => {
    updateInterestUI(e.target.value);
  });

  let searchTimer;
  const applySearch = () => { resetSearchPages(); renderSearchView(); };
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer); if (e.isComposing) return;
    if (!$('#search-input').value.trim()) applySearch();
    else searchTimer = setTimeout(applySearch, 120);
  });
  $('#search-input').addEventListener('compositionend', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applySearch, 120); });
  $('#list-search-more').addEventListener('click', () => { searchPages.list++; renderList(); });
  $('#lead-search-more').addEventListener('click', () => { searchPages.leads++; renderLeads(); });
  $('#user-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#search-menu').classList.remove('open');
    $('#topbar-menu').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#topbar-menu')) $('#topbar-menu').classList.remove('open');
  });

  // --- Menu đa năng trong ô tìm: mỗi mục "bấm hộ" nút gốc (data-proxy) → dùng lại logic sẵn có ---
  const searchMenu = $('#search-menu');
  const setSearchMenu = (open) => {
    searchMenu.classList.toggle('open', open);
    $('#search-menu-btn').setAttribute('aria-expanded', String(open));
  };
  $('#search-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#topbar-menu').classList.remove('open'); $('#notif-wrap').classList.remove('open'); // 1 popup tại 1 thời điểm
    setSearchMenu(!searchMenu.classList.contains('open'));
  });
  searchMenu.querySelector('.menu-pop').addEventListener('click', (e) => {
    const item = e.target.closest('[data-proxy]');
    if (!item) return;
    e.stopPropagation(); // không để listener "bấm ra ngoài" của nút gốc đóng ngay modal/panel vừa mở
    setSearchMenu(false);
    document.getElementById(item.dataset.proxy)?.click();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-menu')) setSearchMenu(false);
  });

  // --- Chuông thông báo: mở/đóng panel, bấm 1 dòng → về trang khách đó ---
  $('#notif-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#topbar-menu').classList.remove('open'); $('#search-menu').classList.remove('open'); // 1 popup tại 1 thời điểm
    $('#notif-wrap').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notif-wrap')) $('#notif-wrap').classList.remove('open');
  });
  $('#notif-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-notif-open]');
    if (!item) return;
    $('#notif-wrap').classList.remove('open');
    // "Cuộc gọi chưa ghi chú" → mở thẳng hộp ghi cuộc gọi (cuộc mới nhất chưa ghi).
    if (item.dataset.notifRule === 'call_pending' && window.CallLog) { CallLog.openPending(item.dataset.notifOpen); return; }
    openDetail(item.dataset.notifOpen);
  });
  // --- Lọc trạng thái (dropdown tuỳ biến): mở/đóng + chọn 1 mục → áp ngay ---
  $('#progress-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = $('#progress-pop').hidden;
    closeToolPops();
    $('#progress-pop').hidden = !willOpen;
    $('#progress-btn').classList.toggle('is-open', willOpen);
    $('#progress-btn').setAttribute('aria-expanded', String(willOpen));
  });
  $('#progress-pop').addEventListener('click', (e) => {
    const opt = e.target.closest('.status-opt');
    if (!opt) return;
    e.stopPropagation();
    progressFilter = opt.dataset.value;
    $('#progress-label').textContent = opt.textContent;
    $$('#progress-pop .status-opt').forEach((o) => o.classList.toggle('is-sel', o === opt));
    closeToolPops();
    renderList();
  });

  // --- Panel Bộ lọc (icon phễu): mở/đóng + lọc theo tiến độ + mức quan tâm ---
  $('#filter-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = $('#filter-panel').hidden;
    closeToolPops();
    $('#filter-panel').hidden = !willOpen;
    $('#filter-btn').classList.toggle('is-open', willOpen);
  });
  $('#filter-min-interest').addEventListener('input', () => {
    $('#filter-interest-val').textContent = $('#filter-min-interest').value;
    updateFilterDot(); renderList();
  });
  // --- Lọc thời gian đăng ký: chọn preset. Preset thường (Tất cả/Hôm nay/Tuần/Tháng) áp NGAY.
  //     "Tuỳ chọn" chỉ mở lịch (nạp nháp = khoảng đang áp dụng), CHƯA đổi lọc — chờ bấm Áp dụng. ---
  $('#filter-date-presets').addEventListener('click', (e) => {
    const b = e.target.closest('.date-preset'); if (!b) return;
    dateFilter.preset = b.dataset.preset;
    if (b.dataset.preset === 'custom') { calMonth = null; calExpanded = true; } // bấm Tuỳ chọn → mở lịch
    syncDatePresetUI(); updateFilterDot(); renderList();
  });
  $('#filter-date-custom').addEventListener('click', (e) => {
    // Chặn nổi bọt: các nhánh render lại innerHTML → phần tử vừa bấm rời DOM.
    const exp = e.target.closest('[data-cal-expand]');
    if (exp) { e.stopPropagation(); calExpanded = true; renderCalendar(); return; } // mở lại lịch để chỉnh
    const nav = e.target.closest('[data-cal-nav]');
    if (nav) { e.stopPropagation(); calMonth.setMonth(calMonth.getMonth() + Number(nav.dataset.calNav)); renderCalendar(); return; }
    const day = e.target.closest('.cal-day[data-date]');
    if (day) { e.stopPropagation(); calPick(day.dataset.date); }
  });
  // --- Dropdown Tiến độ: mở/đóng + chọn 1 bậc → thu gọn + áp ngay (không đóng panel) ---
  $('#stage-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = $('#stage-pop').hidden;
    closeTransientPops();
    $('#stage-pop').hidden = !willOpen;
    $('#stage-btn').classList.toggle('is-open', willOpen);
    $('#stage-btn').setAttribute('aria-expanded', String(willOpen));
  });
  $('#stage-pop').addEventListener('click', (e) => {
    const opt = e.target.closest('.status-opt'); if (!opt) return;
    e.stopPropagation();
    stageFilter = opt.dataset.value;
    syncStageLabel();
    closeStagePop();
    updateFilterDot(); renderList();
  });
  // Bấm chỗ khác (kể cả trong panel Bộ lọc) → đóng dropdown Tiến độ.
  document.addEventListener('click', (e) => { if (!e.target.closest('#stage-filter')) closeStagePop(); });
  // Bộ lọc đã áp real-time; nút "Áp dụng" đáy panel chỉ đóng panel (chốt phiên xem/gộp lọc).
  $('#filter-apply-btn').addEventListener('click', () => { closeToolPops(); });
  $('#filter-apt-presets').addEventListener('click', (e) => {
    const choice = e.target.closest('[data-apt-group]'); if (!choice) return;
    e.stopPropagation(); aptTypeFilter = choice.dataset.aptGroup;
    resetSearchPages(); updateFilterDot(); renderList();
  });
  $('#filter-reset-btn').addEventListener('click', resetAdvancedFilters);
  // Nút "Xoá lọc ✕" cạnh dòng đếm khách (chỉ hiện khi đang có lọc nâng cao).
  $('#clear-filter-inline').addEventListener('click', resetAdvancedFilters);

  // --- Panel Sắp xếp (icon): đa tiêu chí, chọn xong bấm Áp dụng mới sắp ---
  $('#sort-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = $('#sort-panel').hidden;
    closeToolPops();
    if (willOpen) { sortDraft = sortToDraft(); renderSortOptions(); } // mở → nạp trạng thái đang áp dụng
    $('#sort-panel').hidden = !willOpen;
    $('#sort-btn').classList.toggle('is-open', willOpen);
  });
  // Bấm tam giác ▲/▼ → đổi nháp (KHÔNG sắp ngay). Bấm lại đúng hướng đang bật → bỏ chọn tiêu chí đó.
  $('#sort-options').addEventListener('click', (e) => {
    const tri = e.target.closest('.tri-btn');
    if (!tri) return;
    // Chặn nổi bọt: handler này render lại innerHTML → phần tử vừa click bị tách khỏi DOM,
    // nếu để lọt tới handler "click ngoài" bên dưới nó sẽ tưởng là click ngoài và đóng panel.
    e.stopPropagation();
    const key = tri.closest('.sort-tris').dataset.key;
    const dir = tri.dataset.dir;
    if (sortDraft[key] === dir) delete sortDraft[key];
    else sortDraft[key] = dir;
    renderSortOptions();
  });
  $('#sort-apply-btn').addEventListener('click', () => {
    // Ghép theo THỨ TỰ hàng (ưu tiên Tiến độ > Quan tâm > Cập nhật > Tên).
    currentSort = SORT_ATTRS.filter((a) => sortDraft[a.key]).map((a) => ({ key: a.key, dir: sortDraft[a.key] }));
    renderList();
    closeToolPops();
  });
  $('#sort-reset-btn').addEventListener('click', () => {
    currentSort = DEFAULT_SORT.map((x) => ({ ...x })); // về mặc định đa khoá
    sortDraft = sortToDraft();
    renderSortOptions();
    renderList();
  });

  // Đóng panel Bộ lọc/Sắp xếp khi bấm ra ngoài
  document.addEventListener('click', (e) => {
    // Bấm ra ngoài đóng Sắp xếp + dropdown Trạng thái; RIÊNG panel Bộ lọc giữ nguyên (để gộp
    // nhiều filter + xem danh sách real-time), chỉ đóng khi bấm "Áp dụng" đáy panel hoặc icon phễu.
    if (!e.target.closest('.tool-pop')) closeTransientPops();
  });

  // Header thu gọn khi cuộn xuống (đầy đủ khi ở đầu trang). Có ngưỡng trễ (48/16) tránh
  // rung ở ranh giới; rAF throttle cho mượt. Đóng panel đang mở khi bắt đầu thu gọn.
  const topbarEl = document.querySelector('.topbar');
  const searchInputEl = document.querySelector('#search-input');
  let headerCollapsed = false, scrollTick = false, searchFocused = false;

  // "Đang gõ tìm" = ô tìm ĐANG focus VÀ CÓ ký tự. Chỉ khi đó mới giữ/bung header đầy đủ.
  // (Focus mà ô rỗng, hoặc đã xoá hết ký tự → coi như không gõ → vẫn cho thu gọn.)
  function searchQueryActive() {
    return searchFocused && !!searchInputEl && searchInputEl.value.trim() !== '';
  }

  // Chỉ bật/tắt class — mọi chuyển động do CSS transition lo (ô tìm trượt bằng top/left/right,
  // chữ·tabs·sync·avatar fade + co bằng opacity/max-width/max-height). Xem css/style.css.
  function setHeaderCollapsed(collapsed) {
    if (collapsed === headerCollapsed) return;
    headerCollapsed = collapsed;
    if (collapsed) { closeTransientPops(); $('#notif-wrap')?.classList.remove('open'); } // cuộn → giữ panel Bộ lọc mở
    topbarEl.classList.toggle('collapsed', collapsed);
  }
  function applyHeaderState() {
    scrollTick = false;
    if (searchQueryActive()) return; // đang gõ tìm (có ký tự) → giữ header đầy đủ, không thu gọn
    const y = window.scrollY || 0;
    if (!headerCollapsed && y > 48) setHeaderCollapsed(true);
    else if (headerCollapsed && y < 16) setHeaderCollapsed(false);
  }
  window.addEventListener('scroll', () => {
    if (!scrollTick) { scrollTick = true; requestAnimationFrame(applyHeaderState); }
  }, { passive: true });

  // FIX Android/Chrome: gõ tìm khi header đang THU GỌN, bàn phím ảo đổi viewport làm header
  // sticky (ô tìm absolute) "biến mất", không thấy từ khoá. Cách xử: NGAY KHI ô tìm có ký tự
  // → BUNG header đầy đủ + về đầu trang, và giữ vậy tới khi ô trống lại / rời ô tìm.
  let savedScrollY = null; // vị trí cuộn TRƯỚC khi bắt đầu gõ tìm (để khôi phục khi xoá hết)
  function maybeExpandForSearch() {
    const hasText = !!searchInputEl && searchInputEl.value.trim() !== '';
    if (hasText) {
      // Có ký tự: lần ĐẦU rời khỏi vị trí đang xem → lưu vị trí cuộn, rồi bung + về đầu trang.
      if (savedScrollY === null) savedScrollY = window.scrollY || 0;
      if (headerCollapsed) setHeaderCollapsed(false);
      if (window.scrollY > 0) window.scrollTo(0, 0);
    } else if (savedScrollY !== null) {
      // Xoá hết ký tự → quay lại đúng vị trí cuộn đã lưu lúc bắt đầu gõ.
      const target = savedScrollY; savedScrollY = null;
      // Đưa header về đúng trạng thái ứng với vị trí khôi phục KHÔNG animation trước, rồi mới
      // scroll — vì header sticky chiếm chỗ trong luồng, đổi chiều cao lúc đang cuộn sẽ làm
      // vị trí bị lệch (clamp). Tắt transition tạm → đổi tức thì → chiều cao khớp → cuộn chuẩn.
      topbarEl.classList.add('no-anim');
      setHeaderCollapsed(target > 48);
      void topbarEl.offsetHeight; // ép reflow để chiều cao mới ăn ngay
      window.scrollTo(0, target);
      requestAnimationFrame(() => topbarEl.classList.remove('no-anim'));
    } else {
      applyHeaderState(); // rỗng ngay từ đầu (chưa từng gõ) → theo cuộn bình thường
    }
  }
  if (searchInputEl) {
    // KHÔNG bung khi mới focus mà ô còn rỗng — chỉ bung khi thực sự CÓ ký tự (xem maybeExpandForSearch).
    searchInputEl.addEventListener('focus', () => { searchFocused = true; maybeExpandForSearch(); });
    searchInputEl.addEventListener('blur', () => { searchFocused = false; applyHeaderState(); });
    searchInputEl.addEventListener('input', maybeExpandForSearch);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});

// ------------------------------------------------- KÉO ĐỂ TẢI LẠI ----------
// Ở ĐẦU trang (scrollY<=0), kéo XUỐNG quá ngưỡng → reload TOÀN BỘ trang.
// location.reload() + sw.js network-first ⇒ lấy HTML/JS/CSS mới nhất từ Cloudflare.
// Hỗ trợ 2 kiểu nhập:
//  - Cảm ứng (điện thoại/tablet): touchstart/move/end.
//  - Trackpad/chuột (Mac/Windows): wheel — overscroll LÊN khi đã ở đỉnh trang.
(function setupPullToRefresh() {
  const ind = document.getElementById('ptr-indicator');
  if (!ind) return;
  const txt = ind.querySelector('.ptr-text');
  const HIDDEN = -48;      // mốc khi đang kéo (CSS lúc nghỉ còn đẩy cao hơn để khuất hẳn sau thanh trạng thái)
  const THRESHOLD = 64;    // "độ kéo" (đã giảm tốc) tối thiểu để kích hoạt
  const MAX_VISIBLE = 72;  // px tối đa thanh trượt xuống (cảm giác căng)
  let pulling = false, startY = 0, dist = 0, triggered = false;

  const anyDialogOpen = () => !!document.querySelector('dialog[open]');

  function reset() {
    ind.classList.remove('ready', 'loading');
    ind.style.transition = '';
    ind.style.transform = '';
    txt.textContent = 'Kéo để tải lại';
    dist = 0;
  }
  // Vẽ thanh theo độ kéo d (đã giảm tốc); trả về true nếu đủ ngưỡng.
  function showProgress(d) {
    ind.style.transition = 'none';
    ind.style.transform = `translateY(${Math.min(MAX_VISIBLE, d) + HIDDEN}px)`;
    const ready = d >= THRESHOLD;
    ind.classList.toggle('ready', ready);
    txt.textContent = ready ? 'Thả để tải lại' : 'Kéo để tải lại';
    return ready;
  }
  function triggerReload() {
    if (triggered) return;
    triggered = true;
    ind.classList.remove('ready');
    ind.classList.add('loading');
    ind.style.transition = '';
    txt.textContent = 'Đang tải lại...';
    ind.style.transform = 'translateY(0)';
    setTimeout(() => location.reload(), 300);
  }

  // --- Cảm ứng (điện thoại/tablet) ---
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || e.touches.length !== 1 || anyDialogOpen()) { pulling = false; return; }
    startY = e.touches[0].clientY; pulling = true; dist = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    if (window.scrollY > 0) { reset(); pulling = false; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { reset(); pulling = false; return; }
    dist = Math.min(MAX_VISIBLE, dy * 0.5);
    e.preventDefault(); // chặn nảy mặc định để thanh bám theo ngón tay
    showProgress(dist);
  }, { passive: false });
  window.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    ind.style.transition = '';
    if (dist >= THRESHOLD) triggerReload(); else reset();
  });

  // --- Trackpad/chuột (Mac/Windows): overscroll LÊN ở đỉnh trang ---
  // Kéo 2 ngón xuống (natural scroll) khi đã ở đỉnh → deltaY < 0 → tích luỹ.
  // Bỏ QUÁN TÍNH (momentum/trớn của trackpad-chuột), chỉ tính đoạn kéo CHỦ ĐỘNG:
  //  - START_FLOOR: 1 lần kéo hợp lệ phải BẮT ĐẦU chậm (event đầu < ngưỡng này). Flick
  //    cuộn lên rồi trớn qua đỉnh → khi chạm đỉnh vận tốc đã lớn → event đầu > ngưỡng
  //    → coi là trớn, BỎ QUA cả phiên. (Cũng giống cảm ứng: phải bắt đầu ngay tại đỉnh.)
  //  - Sau khi qua đỉnh của lần kéo, nếu delta tụt < 40% đỉnh → phần còn lại là trớn, ngừng cộng.
  //  - WHEEL_K: quy đổi độ kéo chủ động → tương đương cảm ứng (~128px mới đủ ngưỡng).
  const WHEEL_K = 0.29, START_FLOOR = 24;
  let wheelAccum = 0, wheelPeak = 0, wheelMomentum = false, wheelValid = false, wheelLastT = 0, wheelTimer = null;

  function wheelResetSession() { wheelAccum = 0; wheelPeak = 0; wheelMomentum = false; wheelValid = false; }
  function wheelRetractSoon() {
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelResetSession(); ind.style.transition = ''; reset(); }, 200);
  }

  window.addEventListener('wheel', (e) => {
    if (triggered || anyDialogOpen()) return;
    const now = performance.now();
    const isNew = now - wheelLastT > 120; // ngắt quãng >120ms → lần kéo MỚI
    wheelLastT = now;

    // Rời đỉnh hoặc đang cuộn xuống → huỷ phiên (nên nếu sau đó chạm đỉnh vẫn cùng
    // dòng event thì bị coi là không hợp lệ = trớn của flick).
    if (window.scrollY > 0 || e.deltaY >= 0) { wheelResetSession(); reset(); return; }

    const abs = -e.deltaY;
    if (isNew) { wheelResetSession(); wheelValid = abs < START_FLOOR; } // chốt hợp lệ ngay từ event đầu
    if (!wheelValid) { wheelRetractSoon(); return; }                    // phiên bắt đầu nhanh = trớn → bỏ

    wheelPeak = Math.max(wheelPeak, abs);
    if (!wheelMomentum && abs < wheelPeak * 0.4) wheelMomentum = true;  // đã qua đỉnh, đang decay = trớn

    if (!wheelMomentum) {
      wheelAccum += abs;
      if (showProgress(wheelAccum * WHEEL_K)) { ind.style.transition = ''; triggerReload(); return; }
    }
    wheelRetractSoon();
  }, { passive: true });
})();
