-- =====================================================================
--  Migration: GIỎ HÀNG 3 LỚP  Dự án → Toà → Căn  (giá trị lớp dưới GHI ĐÈ lớp trên)
--
--  1. Dự án:  tên · loại căn + diện tích điển hình · GIÁ ĐIỂN HÌNH (đ/m², app nhập tr/m²)
--             · VAT % · KPBT % · bàn giao dự kiến · nhận sổ sau bàn giao · tiến độ thanh toán
--  2. Toà:    mã toà · loại căn (⊂ dự án) · diện tích theo loại (trống = dự án)
--             · giá điển hình (trống = dự án) · DỰ KIẾN BÀN GIAO (trống = dự án)
--  3. Căn:    mã căn · loại căn (⊂ toà) · tầng · hướng · diện tích (trống = toà → dự án)
--             · giá (trống = toà → dự án)
--
--  Mới ở file này:
--   - projects.typical_price_per_m2   (giá điển hình của dự án)
--   - buildings.handover_date         (bàn giao riêng của toà)
--   - buildings.approved_price_per_m2 giữ tên cột cũ, nghĩa mới = giá điển hình của toà (ghi đè dự án)
--   - Ràng buộc: loại căn của căn PHẢI thuộc loại căn hiệu lực của toà (trigger)
--   - View v_buildings, v_units: giá trị HIỆU LỰC sau khi áp ghi đè + nguồn (căn / toà / dự án)
--
--  Chạy SAU add_apt_types_by_project.sql. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- ---------- 1. Cột mới ----------
alter table public.projects  add column if not exists typical_price_per_m2 bigint check (typical_price_per_m2 >= 0);
alter table public.buildings add column if not exists handover_date date;
comment on column public.projects.typical_price_per_m2  is 'Giá điển hình của dự án (đ/m²)';
comment on column public.buildings.approved_price_per_m2 is 'Giá điển hình của toà (đ/m²) — trống = theo dự án';
comment on column public.buildings.handover_date        is 'Dự kiến bàn giao của toà — trống = theo dự án';
comment on column public.units.area_m2                  is 'Diện tích riêng của căn — trống = theo loại căn của toà → dự án';
comment on column public.units.price_per_m2_override    is 'Giá riêng của căn (đ/m²) — trống = theo toà → dự án';

-- Giá điển hình dự án: lấy từ đơn giá chuẩn cũ của module vay (project_unit_types) nếu có
update public.projects p set typical_price_per_m2 = t.price_per_m2
from (select distinct on (project_id) project_id, price_per_m2
      from public.project_unit_types order by project_id, sort_order, created_at) t
where t.project_id = p.id and p.typical_price_per_m2 is null;

-- ---------- 2. Loại căn của căn ⊂ loại căn hiệu lực của toà ----------
-- Loại căn hiệu lực của toà = các loại toà đã tích; toà chưa tích loại nào = mọi loại của dự án.
create or replace function public.building_allows_apt_type(p_building uuid, p_type text) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.buildings b
    join public.project_apt_types pt on pt.project_id = b.project_id and pt.apt_type = p_type
    where b.id = p_building
      and ( exists (select 1 from public.building_apt_types bt where bt.building_id = b.id and bt.apt_type = p_type)
            or not exists (select 1 from public.building_apt_types bt where bt.building_id = b.id) )
  )
$$;

-- Dọn dữ liệu cũ TRƯỚC khi bật ràng buộc: loại căn của căn chưa khai báo → khai báo vào dự án
-- (và vào toà nếu toà đang có danh sách riêng) — không đổi dữ liệu căn.
insert into public.project_apt_types (owner_id, project_id, apt_type)
select distinct u.owner_id, u.project_id, u.apt_type from public.units u
where coalesce(trim(u.apt_type), '') <> '' and u.owner_id is not null
on conflict (project_id, apt_type) do nothing;

insert into public.building_apt_types (owner_id, building_id, project_id, apt_type)
select distinct u.owner_id, u.building_id, u.project_id, u.apt_type from public.units u
where u.building_id is not null and coalesce(trim(u.apt_type), '') <> '' and u.owner_id is not null
  and exists (select 1 from public.building_apt_types x where x.building_id = u.building_id)
on conflict (building_id, apt_type) do nothing;

create or replace function public.tg_units_check_apt_type() returns trigger language plpgsql as $$
begin
  -- Sửa tầng/giá... mà không đổi loại căn / toà → không kiểm tra lại (dữ liệu cũ vẫn sửa được)
  if tg_op = 'UPDATE' and new.apt_type is not distinct from old.apt_type
     and new.building_id is not distinct from old.building_id then
    return new;
  end if;
  if coalesce(trim(new.apt_type), '') <> '' and new.building_id is not null
     and not public.building_allows_apt_type(new.building_id, new.apt_type) then
    raise exception 'Loại căn "%" không có trong danh sách loại căn của toà (căn %)', new.apt_type, new.code
      using hint = 'Khai báo loại căn này cho dự án / toà trong Giỏ hàng trước.';
  end if;
  return new;
end $$;
drop trigger if exists trg_units_check_apt_type on public.units;
create trigger trg_units_check_apt_type before insert or update of apt_type, building_id on public.units
  for each row execute function public.tg_units_check_apt_type();

-- ---------- 3. View giá trị HIỆU LỰC (Supabase Table Editor / báo cáo) ----------
-- security_invoker: chạy theo quyền người xem → RLS vẫn áp dụng
create or replace view public.v_buildings with (security_invoker = true) as
select b.*,
       p.name as project_name,
       coalesce(b.approved_price_per_m2, p.typical_price_per_m2) as effective_price_per_m2,
       case when b.approved_price_per_m2 is not null then 'toà' when p.typical_price_per_m2 is not null then 'dự án' end as price_source,
       coalesce(b.handover_date, p.handover_date) as effective_handover_date,
       case when b.handover_date is not null then 'toà' when p.handover_date is not null then 'dự án' end as handover_source
from public.buildings b
join public.projects p on p.id = b.project_id;

-- v_units: giữ nguyên các cột cũ, thêm giá + bàn giao hiệu lực ở cuối
create or replace view public.v_units with (security_invoker = true) as
select u.*,
       coalesce(u.area_m2, bt.area_m2, pt.typical_area_m2) as effective_area_m2,
       case when u.area_m2 is not null then 'căn'
            when bt.area_m2 is not null then 'toà'
            when pt.typical_area_m2 is not null then 'dự án' end as area_source,
       coalesce(u.price_per_m2_override, b.approved_price_per_m2, p.typical_price_per_m2) as effective_price_per_m2,
       case when u.price_per_m2_override is not null then 'căn'
            when b.approved_price_per_m2 is not null then 'toà'
            when p.typical_price_per_m2 is not null then 'dự án' end as price_source,
       coalesce(b.handover_date, p.handover_date) as effective_handover_date
from public.units u
left join public.buildings b on b.id = u.building_id
left join public.projects p on p.id = u.project_id
left join public.project_apt_types pt on pt.project_id = u.project_id and pt.apt_type = u.apt_type
left join public.building_apt_types bt on bt.building_id = u.building_id and bt.apt_type = u.apt_type;

grant select on public.v_buildings, public.v_units to authenticated;
