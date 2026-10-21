/**
 * Tích hợp ngoài (Worker ghi `public.integration_health`, app chỉ đọc) — SQL/v2/007_meta_lead_ads.sql.
 * Nguồn duy nhất của mã dòng, mốc "dữ liệu cũ" và nhãn mức tình trạng (D-023 L3: không hiện mã).
 */
export const META_LEAD_ADS_ID = 'meta_lead_ads';
/** Neo thẻ trong Cài đặt — màn Khách mới dẫn tới `/cai-dat#meta-lead-ads`. */
export const META_LEAD_ADS_ANCHOR = 'meta-lead-ads';

/** Worker quét 5 phút/lần; quá 30 phút không cập nhật = có thể đã ngừng chạy (mất lead). */
export const HEALTH_STALE_MS = 30 * 60 * 1000;
export const HEALTH_STALE_TEXT = 'Chưa nhận được cập nhật từ máy chủ trong 30 phút qua';

export type HealthTone = 'success' | 'warning' | 'danger';
export type IntegrationLevel = { label: string; tone: HealthTone };

export const INTEGRATION_LEVELS: Readonly<Record<'ok' | 'warning' | 'error', IntegrationLevel>> = {
  ok: { label: 'Đang hoạt động', tone: 'success' },
  warning: { label: 'Cần chú ý', tone: 'warning' },
  error: { label: 'Đang lỗi', tone: 'danger' },
};
