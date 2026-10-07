-- Migration: thêm cột "mẫu tin Zalo" vào bảng user_settings (đồng bộ mẫu giữa Mac ↔ Android)
--
-- zalo_templates: mảng JSON các mẫu tin [{id, name, text}] — sửa trong app: menu avatar →
--   "Mẫu tin Zalo". Mẫu 'chao' vẫn lưu ở cột zalo_greeting cũ (app bản cũ dùng chung).
-- CẦN CHẠY TRƯỚC: SQL/add_zalo_greeting_settings.sql (tạo bảng user_settings + RLS/GRANT).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- Chưa chạy file này thì app VẪN dùng được: mẫu chỉ lưu trên từng máy, không đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.user_settings
  add column if not exists zalo_templates jsonb;
