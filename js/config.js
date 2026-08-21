/**
 * config.js — Điền thông tin project Supabase của anh vào đây.
 *
 * Lấy 2 giá trị này trong Supabase Dashboard:
 *   Project Settings > API > Project URL
 *   Project Settings > API > Project API keys > anon public
 *
 * File này KHÔNG chứa bí mật nguy hiểm (anon key được thiết kế để
 * lộ ra ở client, bảo mật thật sự nằm ở Row Level Security trong schema.sql).
 */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://nrqccwamwctihivpxjww.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_HE8KI3vgqwYXDE2ymypc7A_y8UrCJQn',
  // URL của Cloudflare Worker "cổng nhập liệu" (xem worker/README.md). Để RỖNG
  // thì nút "📷 Nhập từ ảnh" (OCR) tự ẩn — dán URL vào đây sau khi deploy Worker.
  WORKER_URL: 'https://intake-worker.luongninja.workers.dev',
};
