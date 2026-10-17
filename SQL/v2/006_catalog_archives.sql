-- ============================================================================
-- SQL/v2/006_catalog_archives.sql — T3.8 · D-012
-- Soft archive for project catalog rows. Existing RLS policies and grants
-- already allow owner-scoped UPDATE; they remain unchanged.
-- Additive only: no rows are deleted or rewritten.
-- ============================================================================

alter table public.projects add column if not exists archived_at timestamptz;
alter table public.buildings add column if not exists archived_at timestamptz;
alter table public.units add column if not exists archived_at timestamptz;
alter table public.project_apt_types add column if not exists archived_at timestamptz;
alter table public.building_apt_types add column if not exists archived_at timestamptz;

comment on column public.projects.archived_at is 'v2 danh mục: có giá trị = đã lưu trữ, ẩn khỏi danh sách thường';
comment on column public.buildings.archived_at is 'v2 danh mục: có giá trị = đã lưu trữ, ẩn khỏi danh sách thường';
comment on column public.units.archived_at is 'v2 danh mục: có giá trị = đã lưu trữ, ẩn khỏi danh sách thường';
comment on column public.project_apt_types.archived_at is 'v2 danh mục: có giá trị = đã lưu trữ, ẩn khỏi danh sách thường';
comment on column public.building_apt_types.archived_at is 'v2 danh mục: có giá trị = đã lưu trữ, ẩn khỏi danh sách thường';
