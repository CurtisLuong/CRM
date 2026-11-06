-- ============================================================================
-- SQL/v2/013_catalog_fee.sql — LF-01 (Curtis 06/11) · D-012
-- Phí mỗi căn (đ/căn, số tiền cố định) theo 3 cấp như giá: dự án → toà → căn; cấp con có giá trị
-- thì ghi đè cấp cha. Máy tính vay: Giá dự kiến = giá thuần + phí + VAT + KPBT; phí đóng ở đợt 1,
-- khách tự trả (ngân hàng không cho vay phần phí).
--
-- CHỈ THÊM: 1 cột nullable, không default, ở 3 bảng (null = theo cấp cha; cả 3 null = phí 0).
-- RLS/GRANT của projects/buildings/units giữ nguyên. View v_buildings/v_units KHÔNG đổi.
-- Chạy được nhiều lần (idempotent).
-- ============================================================================

alter table public.projects  add column if not exists fee bigint check (fee >= 0);
alter table public.buildings add column if not exists fee bigint check (fee >= 0);
alter table public.units     add column if not exists fee bigint check (fee >= 0);

comment on column public.projects.fee  is 'Phí mỗi căn của dự án (đ/căn) — máy tính vay: cộng vào Giá dự kiến, đóng đợt 1';
comment on column public.buildings.fee is 'Phí mỗi căn của toà (đ/căn) — trống = theo dự án';
comment on column public.units.fee     is 'Phí riêng của căn (đ/căn) — trống = theo toà → dự án';

-- Kiểm tra nhanh (mong đợi: 3 dòng, data_type = bigint):
-- select table_name, data_type from information_schema.columns
--  where table_schema = 'public' and column_name = 'fee' and table_name in ('projects', 'buildings', 'units');
