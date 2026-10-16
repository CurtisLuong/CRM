-- ============================================================================
-- SQL/v2/005_units_verified_at.sql — T2.A5 · D-012 · architecture.md §3.4
-- Cột public.units.verified_at: lần cuối sale xác nhận giá/tồn của căn (độ mới, F-06).
--
-- CHỈ THÊM: 1 cột nullable, không default (căn cũ = chưa xác nhận). RLS/GRANT của units giữ nguyên.
-- View v_units KHÔNG đổi (giữ cột cũ); v2 đọc verified_at từ bảng units.
-- Chạy được nhiều lần (idempotent).
-- ============================================================================

alter table public.units add column if not exists verified_at timestamptz;

comment on column public.units.verified_at is 'v2 lần cuối xác nhận giá/tồn (F-06); null = chưa xác nhận';

-- Kiểm tra nhanh (mong đợi: 1 dòng, data_type = timestamp with time zone):
-- select data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'units' and column_name = 'verified_at';
