/**
 * NGUỒN DUY NHẤT — D-008 (phễu 5 giai đoạn), D-001 (2 lớp khách). Bậc chăm sóc, trạng thái liên lạc,
 * mức quan tâm. Port nguyên giá trị từ đầu legacy/js/app.js. Giá trị LƯU (care_stage, contact_status)
 * không bao giờ đổi nghĩa (D-012); chỉ nhãn hiển thị nằm ở CARE_STAGE_DISPLAY.
 */

// Phễu 5 giai đoạn (thứ tự). Bậc 1–2 thuộc lớp 1 "Khách mới".
export const CARE_STAGES = [
  'Đăng kí mới',
  'Đang tiếp cận',
  'Đang chăm sóc',
  'Xem dự án',
  'Booking & Làm hồ sơ',
] as const;

// Bậc mặc định cho khách MỚI.
export const CARE_STAGE_DEFAULT = 'Đăng kí mới';

// 3 trạng thái NGOÀI phễu: Kí HĐMB = milestone chốt (giữ tên cũ để khỏi đổi dữ liệu) ·
// Nuôi dài hạn = hẹn 3–6 tháng · Loại = kết thúc không chốt (hiển thị "Không chốt").
export const CARE_STAGE_WON = 'Kí HĐMB';
export const CARE_STAGE_NURTURE = 'Nuôi dài hạn';
export const CARE_STAGE_DROPPED = 'Loại';
export const CARE_STAGE_BOOKING = 'Booking & Làm hồ sơ';

// Bậc cũ đã gộp → bậc mới (khách cũ + lịch sử cũ).
export const CARE_STAGE_LEGACY: Readonly<Record<string, string>> = {
  'Hỗ trợ hồ sơ': CARE_STAGE_BOOKING,
  Booking: CARE_STAGE_BOOKING,
};

// Danh sách cho ô chọn: 5 bậc + 3 trạng thái ngoài phễu.
export const CARE_STAGE_OPTIONS = [...CARE_STAGES, CARE_STAGE_NURTURE, CARE_STAGE_WON, CARE_STAGE_DROPPED] as const;

// Thứ tự HIỂN THỊ ở ô chọn/lọc bậc (Curtis 2026-10-22): Nuôi dài hạn là nhánh rẽ của Đang chăm sóc
// (cùng cấp, không tính SLA), không phải bậc sau Booking. CARE_STAGE_OPTIONS giữ thứ tự cũ để khớp v1.
export const CARE_STAGE_PICKER_ORDER = [
  'Đăng kí mới',
  'Đang tiếp cận',
  'Đang chăm sóc',
  CARE_STAGE_NURTURE,
  'Xem dự án',
  CARE_STAGE_BOOKING,
  CARE_STAGE_WON,
  CARE_STAGE_DROPPED,
] as const;

// Bậc nhánh: hiện ngay dưới bậc gốc, thụt vào, kèm dòng giải thích.
export const CARE_STAGE_BRANCH: Readonly<Record<string, { of: string; hint: string }>> = {
  [CARE_STAGE_NURTURE]: { of: 'Đang chăm sóc', hint: 'Nhánh của Đang chăm sóc · không tính SLA' },
};

// "Chăm sóc đã xong" — mặc định ẩn khỏi dashboard.
export const CARE_DONE_STAGES = [CARE_STAGE_WON, CARE_STAGE_DROPPED] as const;

// Nhãn HIỂN THỊ (giá trị lưu giữ nguyên tên gốc).
export const CARE_STAGE_DISPLAY: Readonly<Record<string, string>> = {
  [CARE_STAGE_DROPPED]: 'Không chốt',
  [CARE_STAGE_WON]: 'Đã ký HĐMB',
};

// Bậc lặp lại được nhiều lần (ghi thêm lần liên hệ mà vẫn ở nguyên bậc).
export const CARE_STAGES_REPEATABLE = ['Đăng kí mới', 'Đang tiếp cận'] as const;

// Lớp khách (D-001): Đạt → set qualified_at, chuyển bậc này. Bậc lớp 1 ẩn ở trang chủ.
export const QUALIFIED_STAGE = 'Đang chăm sóc';
export const LEAD_ONLY_STAGES = ['Đăng kí mới', 'Đang tiếp cận'] as const;

// Mức quan tâm mặc định của khách mới (khớp default cột DB — SQL/interest_default_20.sql).
export const INTEREST_DEFAULT_NEW = 20;

// Đổi bậc → TỰ set mức quan tâm (chỉ các bậc dưới; kéo tay ghi đè).
export const STAGE_INTEREST: Readonly<Record<string, number>> = {
  'Đang chăm sóc': 60,
  'Xem dự án': 75,
  [CARE_STAGE_BOOKING]: 90,
  [CARE_STAGE_WON]: 100,
  [CARE_STAGE_DROPPED]: 0,
};

// Trạng thái liên lạc (cột contact_status) — độc lập với care_stage.
export const CONTACT_STATUSES = [
  'Chưa gọi được',
  'Hẹn gọi lại',
  'Chờ kết bạn Zalo',
  'Phản hồi tốt',
  'Mất liên lạc',
] as const;

// 4 bậc mức quan tâm, xếp min giảm dần (find() lấy bậc đầu tiên đạt).
// color = tên token màu của v1 (giữ nguyên để so với v1; giao diện v2 map sang token DS v3).
export type InterestTier = { key: string; label: string; color: string; min: number; flames: number };
export const INTEREST_TIERS: readonly InterestTier[] = [
  { key: 'ratnong', label: 'Rất nóng', color: 'var(--text)', min: 80, flames: 3 },
  { key: 'nong', label: 'Nóng', color: 'var(--text-secondary)', min: 60, flames: 2 },
  { key: 'am', label: 'Ấm', color: 'var(--text-secondary)', min: 35, flames: 1 },
  { key: 'nguoi', label: 'Nguội', color: 'var(--text-muted)', min: 0, flames: 0 },
];
