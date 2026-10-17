-- ============================================================================
-- SQL/v2/003_campaign_costs.sql — T2.A5 · D-012 · D-003 · architecture.md §3.4
-- Bảng mới public.campaign_costs: chi phí quảng cáo theo nguồn/chiến dịch/kỳ → tính CPL (F-09).
--
-- CHỈ THÊM: tạo bảng mới, không chạm bảng cũ. Chạy được nhiều lần (idempotent).
-- Quyền (RLS + GRANT, pitfalls.md §3):
--   - Người tạo (owner_id) đọc/thêm/sửa dòng của mình; admin chỉ ĐỌC hết (D-003: chỉ người phụ trách ghi).
--   - Không ai xoá cứng qua API: xoá = đặt archived_at (xoá mềm, D-012).
--   - anon không có quyền gì.
-- ============================================================================

-- 0) Helper admin (security definer, tránh RLS tự tham chiếu profiles — pitfalls.md §2).
--    Production đã có (add_team_assign.sql, v2/001) → chỉ tạo khi thiếu, không ghi đè.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin' and p.pronargs = 0
  ) then
    execute $f$
      create function public.is_admin()
      returns boolean language sql stable
      security definer set search_path = public
      as $b$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $b$;
    $f$;
    execute 'grant execute on function public.is_admin() to authenticated';
  end if;
end $$;

-- 1) Bảng. id do client tạo được (uuid) → ghi offline rồi đồng bộ như khách.
--    owner_id không cascade (giống customers): xoá tài khoản bị chặn khi còn dữ liệu.
create table if not exists public.campaign_costs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id),
  source       text,                                   -- mã kênh như customers.source (vd. facebook_ads)
  campaign     text,                                   -- tên chiến dịch như customers.campaign
  period_start date not null,
  period_end   date,
  amount       numeric(14, 0) not null check (amount >= 0),   -- VND
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),     -- last-write-wins
  archived_at  timestamptz                             -- xoá mềm
);

create index if not exists campaign_costs_owner_period_idx on public.campaign_costs (owner_id, period_start desc);

comment on table public.campaign_costs is
  'v2 chi phí quảng cáo theo nguồn/chiến dịch/kỳ (F-09, T2.A5). Xoá mềm qua archived_at.';

-- 2) updated_at tự cập nhật khi sửa (LWW theo updated_at).
create or replace function public.campaign_costs_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists campaign_costs_set_updated on public.campaign_costs;  -- chỉ trigger của chính file này
create trigger campaign_costs_set_updated
  before update on public.campaign_costs
  for each row execute function public.campaign_costs_touch();

-- 3) RLS + GRANT.
alter table public.campaign_costs enable row level security;

revoke all on public.campaign_costs from public, anon, authenticated;
grant select, insert, update on public.campaign_costs to authenticated;

drop policy if exists campaign_costs_select on public.campaign_costs;
create policy campaign_costs_select on public.campaign_costs
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists campaign_costs_insert on public.campaign_costs;
create policy campaign_costs_insert on public.campaign_costs
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists campaign_costs_update on public.campaign_costs;
create policy campaign_costs_update on public.campaign_costs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
-- Không có policy/GRANT delete → client không xoá cứng được.

-- 4) Kiểm tra nhanh (mong đợi: 1 dòng, rls = true, policies = 3, quyen = INSERT,SELECT,UPDATE):
-- select (select relrowsecurity from pg_class where oid = 'public.campaign_costs'::regclass) as rls,
--        (select count(*) from pg_policies where schemaname = 'public' and tablename = 'campaign_costs') as policies,
--        (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
--          where table_schema = 'public' and table_name = 'campaign_costs' and grantee = 'authenticated') as quyen;
