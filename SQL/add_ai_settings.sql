-- Migration: thêm cột "cài đặt Trợ lý AI" vào bảng user_settings (đồng bộ Mac ↔ Android)
--
-- ai_settings: JSON { model: 'qwen' | 'glm', style: "phong cách viết" | null (null = mặc định) }
--   sửa trong app: hồ sơ khách → thẻ Trợ lý AI → nút Cài đặt (⚙). Xem js/ai.js.
-- CẦN CÓ SẴN bảng user_settings (SQL/add_zalo_greeting_settings.sql — đã chạy nếu mẫu Zalo đang đồng bộ).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- Chưa chạy file này thì app VẪN dùng được: cài đặt AI chỉ lưu trên từng máy, không đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.user_settings
  add column if not exists ai_settings jsonb;
