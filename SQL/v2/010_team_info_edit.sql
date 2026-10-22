-- ============================================================================
-- SQL/v2/010_team_info_edit.sql — Khách nhóm: người theo dõi được sửa THÔNG TIN (D-025, Curtis duyệt 2026-10-22).
--
-- Trước: chỉ người phụ trách hoặc trưởng nhóm (admin) sửa được khách (D-003).
-- Sau:   thêm người có tên trong followers được UPDATE, nhưng trigger chỉ cho đổi các cột "thông tin hồ sơ"
--        (danh sách dưới đây — khớp TEAM_INFO_FIELDS ở src/domain/customer/teamEdit.ts, test đối chiếu).
--        Bậc, cuộc gọi, lịch/việc, nguồn, lưu trữ… vẫn chỉ người phụ trách. Giao khách vẫn do
--        guard_customer_assignment kiểm (không đổi). Quyền server của admin giữ nguyên như D-003
--        (app tự giới hạn admin vào thông tin hồ sơ).
--
-- CHỈ THÊM / NỚI QUYỀN: không đổi cột, không đụng dữ liệu. Chạy lại được.
-- Thử trên STAGING mksjmpcsfawsiabfhoxe trước; rồi PRODUCTION nrqccwamwctihivpxjww (sau backup),
-- TRƯỚC khi deploy app có D-025 (app cũ không ghi khách nhóm nên chạy sớm vô hại).
-- Rollback: chạy lại mục 3 của SQL/add_team_assign.sql (policy customers_update cũ) + drop trigger
--   customers_guard_team_edit.
-- ============================================================================

-- 1) Người theo dõi được UPDATE (RLS). with check giữ nguyên: người phụ trách mới phải thuộc nhóm.
drop policy if exists "customers_update" on public.customers;
create policy "customers_update" on public.customers
  for update
  using (owner_id = auth.uid() or public.is_admin() or auth.uid() = any (followers))
  with check (owner_id = auth.uid() or public.is_admin() or public.is_team_member(owner_id));

-- 2) Người theo dõi (không phụ trách, không admin) chỉ đổi được cột thông tin hồ sơ.
create or replace function public.guard_customer_team_edit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- Cột được đổi khi không phụ trách. owner_id/followers do guard_customer_assignment kiểm;
  -- updated_at/updated_by do set_updated_meta đặt.
  allowed text[] := array[
    'full_name', 'phone', 'gender', 'dob', 'menh', 'cung', 'marital_status', 'occupation', 'income',
    'residence', 'purpose', 'avatar_path', 'cover_path', 'apt_type', 'projects', 'apt_code',
    'building_code', 'building_id', 'apt_price', 'apt_area', 'apt_direction', 'apt_floor', 'finance',
    'advanced', 'notes', 'notes_manual', 'contact_prefs', 'interests', 'household', 'field_meta',
    'referred_by',
    'owner_id', 'followers', 'updated_at', 'updated_by'
  ];
begin
  if auth.uid() is null then return new; end if;              -- service role (Worker, landing)
  if old.owner_id = auth.uid() or public.is_admin() then return new; end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Khách do đồng nghiệp phụ trách — bạn chỉ sửa được thông tin hồ sơ' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_guard_team_edit on public.customers;
create trigger customers_guard_team_edit
  before update on public.customers
  for each row execute function public.guard_customer_team_edit();
