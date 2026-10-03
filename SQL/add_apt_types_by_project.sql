-- =====================================================================
--  Migration: LOẠI CĂN + DIỆN TÍCH ĐIỂN HÌNH theo Dự án → Toà
--
--  Quy tắc diện tích (từ ưu tiên cao xuống thấp):
--    1) Diện tích riêng của căn            (units.area_m2)
--    2) Diện tích điển hình của loại căn TRONG TOÀ   (building_apt_types.area_m2)
--    3) Diện tích điển hình của loại căn TRONG DỰ ÁN (project_apt_types.typical_area_m2)
--  Loại căn của toà PHẢI nằm trong danh sách loại căn của dự án (ràng buộc khoá ngoại).
--  Toà chưa khai báo loại căn nào → dùng toàn bộ loại căn của dự án.
--
--  Danh sách loại căn chuẩn của app (js/app.js APT_TYPES):
--    Studio, 1N-1WC, 1N+, 1WC, 2N-2WC, 2N+, 2WC, 2N-2WC-G, 3N-2WC  (+ loại tự gõ "Khác")
--
--  Chạy SAU add_catalog_buildings.sql. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- ---------- 1. Loại căn của dự án + diện tích điển hình ----------
create table if not exists public.project_apt_types (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id       uuid not null references public.projects(id) on delete cascade,
  apt_type         text not null check (trim(apt_type) <> ''),
  typical_area_m2  numeric(8,2) check (typical_area_m2 > 0),   -- diện tích điển hình chung của dự án
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, apt_type)
);
create index if not exists idx_project_apt_types_project on public.project_apt_types(project_id);

-- ---------- 2. Loại căn của toà (tập con của dự án) + diện tích chỉnh theo toà ----------
-- Khoá ngoại kép (building_id, project_id) → buildings(id, project_id) để chắc chắn toà và
-- loại căn cùng 1 dự án; (project_id, apt_type) → project_apt_types để loại căn của toà
-- luôn nằm trong danh sách của dự án. Đổi tên / xoá loại căn ở dự án → toà tự theo.
create unique index if not exists uq_buildings_id_project on public.buildings(id, project_id);

create table if not exists public.building_apt_types (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  building_id  uuid not null,
  project_id   uuid not null,
  apt_type     text not null,
  area_m2      numeric(8,2) check (area_m2 > 0),   -- null = dùng diện tích điển hình của dự án
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (building_id, apt_type),
  foreign key (building_id, project_id) references public.buildings(id, project_id) on delete cascade on update cascade,
  foreign key (project_id, apt_type) references public.project_apt_types(project_id, apt_type) on delete cascade on update cascade
);
create index if not exists idx_building_apt_types_building on public.building_apt_types(building_id);

-- updated_at tự cập nhật
drop trigger if exists trg_project_apt_types_updated on public.project_apt_types;
create trigger trg_project_apt_types_updated before update on public.project_apt_types
  for each row execute function public.tg_set_updated_at();
drop trigger if exists trg_building_apt_types_updated on public.building_apt_types;
create trigger trg_building_apt_types_updated before update on public.building_apt_types
  for each row execute function public.tg_set_updated_at();

-- Đổi tên loại căn ở dự án → các căn của dự án đang dùng tên cũ đổi theo
-- (toà đã tự đổi theo nhờ "on update cascade" ở khoá ngoại).
create or replace function public.tg_rename_project_apt_type() returns trigger language plpgsql as $$
begin
  if new.apt_type is distinct from old.apt_type then
    update public.units set apt_type = new.apt_type
    where project_id = new.project_id and apt_type = old.apt_type;
  end if;
  return new;
end $$;
drop trigger if exists trg_project_apt_types_rename on public.project_apt_types;
create trigger trg_project_apt_types_rename after update of apt_type on public.project_apt_types
  for each row execute function public.tg_rename_project_apt_type();

-- ---------- 3. Bảo mật: RLS + GRANT (CLAUDE.md mục 5.2, 5.3) ----------
alter table public.project_apt_types  enable row level security;
alter table public.building_apt_types enable row level security;
drop policy if exists "own project apt types" on public.project_apt_types;
create policy "own project apt types" on public.project_apt_types for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own building apt types" on public.building_apt_types;
create policy "own building apt types" on public.building_apt_types for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.project_apt_types  to authenticated;
grant select, insert, update, delete on public.building_apt_types to authenticated;

-- ---------- 4. View tra cứu (Supabase Table Editor / báo cáo) ----------
-- security_invoker: view chạy theo quyền người xem → RLS vẫn áp dụng (không lộ dữ liệu người khác)

-- Loại căn HIỆU LỰC của từng toà + diện tích điển hình đã áp quy tắc toà > dự án
create or replace view public.v_building_apt_types with (security_invoker = true) as
select b.id as building_id, b.project_id, b.code as building_code, pt.apt_type,
       coalesce(bt.area_m2, pt.typical_area_m2) as area_m2,
       case when bt.area_m2 is not null then 'toà' when pt.typical_area_m2 is not null then 'dự án' end as area_source,
       pt.sort_order
from public.buildings b
join public.project_apt_types pt on pt.project_id = b.project_id
left join public.building_apt_types bt on bt.building_id = b.id and bt.apt_type = pt.apt_type
where bt.id is not null                                   -- toà có khai báo loại căn → chỉ các loại đó
   or not exists (select 1 from public.building_apt_types x where x.building_id = b.id);  -- chưa khai báo → mọi loại của dự án

-- Diện tích HIỆU LỰC của từng căn: căn > toà > dự án
create or replace view public.v_units with (security_invoker = true) as
select u.*,
       coalesce(u.area_m2, bt.area_m2, pt.typical_area_m2) as effective_area_m2,
       case when u.area_m2 is not null then 'căn'
            when bt.area_m2 is not null then 'toà'
            when pt.typical_area_m2 is not null then 'dự án' end as area_source
from public.units u
left join public.project_apt_types pt on pt.project_id = u.project_id and pt.apt_type = u.apt_type
left join public.building_apt_types bt on bt.building_id = u.building_id and bt.apt_type = u.apt_type;

grant select on public.v_building_apt_types, public.v_units to authenticated;

-- ---------- 5. Khởi tạo từ dữ liệu căn đã có ----------
-- Loại căn đã gặp trong units → thêm vào dự án / toà; diện tích điển hình = diện tích hay gặp nhất.
insert into public.project_apt_types (owner_id, project_id, apt_type, typical_area_m2)
select owner_id, project_id, apt_type, mode() within group (order by area_m2)
from public.units
where coalesce(trim(apt_type), '') <> '' and owner_id is not null
group by owner_id, project_id, apt_type
on conflict (project_id, apt_type) do nothing;

insert into public.building_apt_types (owner_id, building_id, project_id, apt_type)
select distinct u.owner_id, u.building_id, u.project_id, u.apt_type
from public.units u
where u.building_id is not null and coalesce(trim(u.apt_type), '') <> '' and u.owner_id is not null
on conflict (building_id, apt_type) do nothing;
