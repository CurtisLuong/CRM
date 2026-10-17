/**
 * NGUỒN DUY NHẤT — D-008. Phễu 5 giai đoạn: mục tiêu / hạn mức SLA, quy tắc tự chuyển quá hạn,
 * checklist bậc "Booking & Làm hồ sơ". Port nguyên giá trị từ legacy/js/velocity.js (VELOCITY_CONFIG).
 * Mô tả cho người dùng: docs/funnel-velocity.md. Logic (phaseOf, status, autoAction…): src/domain/velocity.
 *
 * target = mục tiêu lý tưởng (quá → nhãn vàng) · max = hạn mức tối đa (quá → nhãn đỏ, có thể kèm auto).
 * 'Nuôi dài hạn' / 'Kí HĐMB' / 'Loại' → ngoài phễu, không tính SLA.
 */

export const MIN = 60000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export type PhaseKey = 'new_lead' | 'approach' | 'care' | 'visit' | 'booking';

export type Phase = {
  stage?: string;
  label: string;
  target: number;
  max: number;
  targetText: string;
  maxText: string;
  auto?: 'drop' | 'nurture';
  goal?: string;
  rule: string;
};

export type BookingStep = { key: string; label: string; days?: readonly [number, number]; text?: string };

export const VELOCITY_CONFIG = {
  // Tên bậc (care_stage) — khớp CARE_STAGES (src/config/stages.ts) + ràng buộc DB.
  stageBooking: 'Booking & Làm hồ sơ',
  stageNurture: 'Nuôi dài hạn',
  stageWon: 'Kí HĐMB',
  // Bậc cũ đã gộp (khách cũ / lịch sử cũ) → bậc mới.
  legacyStages: { 'Hỗ trợ hồ sơ': 'Booking & Làm hồ sơ', Booking: 'Booking & Làm hồ sơ' },

  phases: {
    new_lead: {
      label: 'Đăng kí mới',
      target: 30 * MIN,
      max: 4 * HOUR,
      targetText: '< 30 phút',
      maxText: '4 giờ',
      rule: 'Cảnh báo. Khách đăng ký sau 22h → tính từ 7h sáng hôm sau.',
    },
    approach: {
      label: 'Đang tiếp cận',
      target: 2 * DAY,
      max: 7 * DAY,
      targetText: '1–2 ngày',
      maxText: '7 ngày',
      auto: 'drop',
      rule: 'Tối đa gọi 5 lần; quá 7 ngày chưa liên lạc được → tự chuyển Loại "Không liên lạc được".',
    },
    care: {
      stage: 'Đang chăm sóc',
      label: 'Đang chăm sóc',
      target: 10 * DAY,
      max: 20 * DAY,
      targetText: '7–10 ngày',
      maxText: '20 ngày',
      auto: 'nurture',
      goal: 'Chốt lịch xem sa bàn / nhà mẫu / dự án / văn phòng bán hàng',
      rule: 'Quá 20 ngày → tự chuyển Nuôi dài hạn, rút khỏi phễu chính.',
    },
    visit: {
      stage: 'Xem dự án',
      label: 'Xem dự án',
      target: 7 * DAY,
      max: 14 * DAY,
      targetText: '7 ngày',
      maxText: '14 ngày',
      goal: 'Chốt Booking',
      rule: 'Cảnh báo.',
    },
    booking: {
      stage: 'Booking & Làm hồ sơ',
      label: 'Booking & Làm hồ sơ',
      target: 45 * DAY,
      max: 75 * DAY,
      targetText: '45 ngày',
      maxText: '2,5 tháng',
      goal: 'Hoàn tất hồ sơ → Ký HĐMB',
      rule: 'Theo dõi 4 bước hồ sơ bên dưới.',
    },
  } satisfies Record<PhaseKey, Phase>,
  // Thứ tự phễu (5 giai đoạn) — milestone Ký HĐMB đứng sau, không tính giờ.
  order: ['new_lead', 'approach', 'care', 'visit', 'booking'] as const satisfies readonly PhaseKey[],

  // Giờ tính SLA khách mới: đăng ký trong [start, end) tính ngay; ngoài khung → dời tới resumeAt.
  workHours: { start: 6, end: 22, resumeAt: 7 },

  // Checklist bậc Booking & Làm hồ sơ. days = [mục tiêu, hạn] tính từ bước trước xong (bước 1 từ lúc vào bậc).
  bookingSteps: [
    { key: 'cu_tru', label: 'Xác nhận cư trú', days: [3, 5], text: '3–5 ngày' },
    { key: 'dk_nha_o', label: 'Xác nhận điều kiện nhà ở', days: [12, 15], text: '~15 ngày sau bước 1' },
    { key: 'tham_dinh', label: 'CĐT/Sở thẩm định đạt', days: [5, 7], text: '5–7 ngày' },
    { key: 'tb_ky', label: 'Thông báo ký HĐMB' },
  ] satisfies readonly BookingStep[],

  // Tự xử lý quá hạn chỉ tính đồng hồ từ mốc này (khách cũ không bị chuyển hàng loạt khi cập nhật).
  autoSince: '2026-10-10T00:00:00+07:00',
  autoUndoDays: 3, // số ngày còn hiện nút "Hoàn tác" sau khi app tự chuyển
  nurtureRecallMonths: 3, // vào Nuôi dài hạn → hẹn gọi lại sau N tháng (3–6)
  dropReason: 'khong_lien_lac_duoc',
} as const;
