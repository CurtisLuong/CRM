-- ============================================================================
-- SQL/v2/004_user_settings_ui_state.sql — T2.A5 · D-012 · architecture.md §3.4
-- Cột public.user_settings.ui_state: trạng thái giao diện v2 đồng bộ đa thiết bị
-- (tệp khách đã lưu, tín hiệu đã ẩn/hoãn, cấu hình sức làm).
--
-- CHỈ THÊM: 1 cột nullable, default {}. RLS/GRANT của user_settings giữ nguyên
-- (SQL/add_zalo_greeting_settings.sql: mỗi người chỉ đọc/ghi dòng của mình).
-- Chạy được nhiều lần (idempotent).
-- ============================================================================

alter table public.user_settings add column if not exists ui_state jsonb default '{}'::jsonb;

comment on column public.user_settings.ui_state is 'v2 trạng thái giao diện: tệp đã lưu, tín hiệu ẩn/hoãn, sức làm';

-- Kiểm tra nhanh (mong đợi: 1 dòng, data_type = jsonb):
-- select data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'user_settings' and column_name = 'ui_state';
