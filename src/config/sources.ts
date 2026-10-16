/**
 * NGUỒN DUY NHẤT — D-001 (quy tắc source chốt 2026-10-06). Kênh khách đến từ đâu.
 * Port nguyên giá trị từ legacy/js/app.js. Mã: snake_case <nền tảng>_<loại>; thêm kênh = thêm 1 dòng.
 * Cách nhập (tay/ảnh/Excel/API) KHÔNG ở đây mà ở cột intake_method.
 */

export const SOURCES: Readonly<Record<string, string>> = {
  facebook_ads: 'Facebook Ads',
  website: 'Landing page',
  referral: 'Khách quen / giới thiệu',
  // google_ads: 'Google Ads',
  // tiktok_ads: 'TikTok Ads',
};

export const SOURCE_DEFAULT = 'facebook_ads';

// Mã cũ trước 2026-10-06 (thiết bị chưa cập nhật có thể còn ghi) → mã kênh mới.
export const SOURCE_LEGACY: Readonly<Record<string, string>> = {
  manual: 'facebook_ads',
  ocr: 'facebook_ads',
  landing: 'website',
};
