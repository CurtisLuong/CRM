-- =====================================================================
--  Migration: GIỎ HÀNG  Dự án → Toà → Căn  (nguồn dữ liệu chung cho form khách,
--  bảng tính vay và màn "Giỏ hàng"). Chạy SAU add_loan_module.sql.
--
--  1) projects: thêm "nhận sổ sau bàn giao", tên dự án duy nhất theo từng tài khoản.
--  2) GỘP project_options → projects (danh sách dự án của form khách). Bảng
--     project_options GIỮ LẠI để tham khảo, app không dùng nữa.
--  3) buildings (MỚI): mã toà + giá trung bình được duyệt (đ/m²).
--  4) units: gắn vào toà (building_id), thêm loại căn, hướng; mã căn duy nhất theo toà.
--  (project_unit_types không dùng nữa — giữ nguyên, không xoá.)
--
--  Cách chạy: Supabase → SQL Editor → dán cả file → Run. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- ---------- 1. projects ----------
alter table public.projects add column if not exists title_after_months numeric(5,2) not null default 1.5;
alter table public.projects add column if not exists sort_order int not null default 0;
create unique index if not exists uq_projects_owner_name on public.projects(owner_id, name);

-- ---------- 2. Gộp project_options → projects (giữ thứ tự cũ qua created_at) ----------
insert into public.projects (owner_id, name, created_at)
select owner_id, name, created_at from public.project_options
on conflict (owner_id, name) do nothing;

-- ---------- 3. buildings ----------
create table if not exists public.buildings (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id             uuid not null references public.projects(id) on delete cascade,
  code                   text not null,                 -- mã toà, VD: THE RISE 3, S1
  approved_price_per_m2  bigint check (approved_price_per_m2 >= 0),  -- giá TB được duyệt (đ/m²)
  note                   text,
  sort_order             int not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (project_id, code)
);
create index if not exists idx_buildings_project on public.buildings(project_id);

drop trigger if exists trg_buildings_updated on public.buildings;
create trigger trg_buildings_updated before update on public.buildings
  for each row execute function public.tg_set_updated_at();

alter table public.buildings enable row level security;
drop policy if exists "own buildings" on public.buildings;
create policy "own buildings" on public.buildings for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- RLS không thay GRANT (CLAUDE.md mục 5.3)
grant select, insert, update, delete on public.buildings to authenticated;

-- ---------- 4. units ----------
alter table public.units add column if not exists building_id uuid references public.buildings(id) on delete cascade;
alter table public.units add column if not exists apt_type   text;   -- 1N-1WC, 2N-2WC...
alter table public.units add column if not exists direction  text;   -- Đông, Tây Nam...
alter table public.units add column if not exists updated_at timestamptz not null default now();
alter table public.units alter column area_m2 drop not null;        -- diện tích có thể chưa biết

drop trigger if exists trg_units_updated on public.units;
create trigger trg_units_updated before update on public.units
  for each row execute function public.tg_set_updated_at();

-- Căn cũ chỉ có tên toà dạng chữ (cột "building") → tạo toà tương ứng rồi gắn building_id
insert into public.buildings (owner_id, project_id, code)
select distinct u.owner_id, u.project_id, u.building
from public.units u
where u.building_id is null and coalesce(trim(u.building), '') <> ''
on conflict (project_id, code) do nothing;

update public.units u set building_id = b.id
from public.buildings b
where u.building_id is null and b.project_id = u.project_id and b.code = u.building;

-- Mã căn duy nhất THEO TOÀ (2 toà khác nhau có thể cùng số căn "0808")
alter table public.units drop constraint if exists units_project_id_code_key;
create unique index if not exists uq_units_building_code on public.units(building_id, code);
create index if not exists idx_units_building on public.units(building_id);

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.units    to authenticated;
