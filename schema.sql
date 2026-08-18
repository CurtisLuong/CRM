-- ============================================================
-- CRM Khách hàng BĐS — Supabase schema
-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor
-- ============================================================

-- 1) Bảng profiles: lưu role của mỗi user (admin / sale)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'sale' check (role in ('admin','sale')),
  created_at timestamptz not null default now()
);

-- Tự tạo profile khi có user mới đăng ký (mặc định role = 'sale')
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'sale');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Bảng customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  full_name text not null,
  gender text check (gender in ('nam','nữ','khác')),
  dob date,
  menh text,                          -- tính sẵn ở client, lưu lại để search/filter nhanh
  marital_status text check (marital_status in ('đã kết hôn','chưa kết hôn')),
  income text,
  residence text,
  apt_type text,                      -- vd "2N-2WC"
  apt_code text,
  building_code text,
  apt_price numeric,
  notes text,                         -- freeform, dài ngắn tuỳ khách
  interest_level int check (interest_level between 0 and 100),
  care_stage text check (care_stage in (
    'Chưa gọi được',
    'Hẹn gọi lại',
    'Chờ kết bạn Zalo',
    'Đang chăm sóc qua Zalo',
    'Đã yêu cầu hỗ trợ hồ sơ',
    'Đã booking',
    'Đã ký hợp đồng mua bán',
    'Không quan tâm-kết thúc'      -- kết thúc chăm sóc, không chốt được (xem add_care_stage_ket_thuc.sql)
  )),
  evaluation text check (evaluation in ('nên chăm','không nên chăm')),
  evaluation_reason text,
  owner_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- SDT là "master key" hiển thị — unique theo từng người phụ trách
-- (2 sale khác nhau có thể tự lưu cùng 1 số nếu đó là 2 khách độc lập của họ)
create unique index if not exists customers_phone_owner_unique
  on public.customers (phone, owner_id);

create index if not exists customers_full_name_idx on public.customers (full_name);
create index if not exists customers_care_stage_idx on public.customers (care_stage);
create index if not exists customers_evaluation_idx on public.customers (evaluation);

-- Tự cập nhật updated_at / updated_by mỗi lần sửa
create or replace function public.set_updated_meta()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists customers_set_updated on public.customers;
create trigger customers_set_updated
  before update on public.customers
  for each row execute function public.set_updated_meta();

-- 3) Row Level Security
alter table public.profiles enable row level security;
alter table public.customers enable row level security;

-- profiles: ai cũng xem được profile chính mình; admin xem hết
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- chỉ admin được đổi role của người khác
create policy "profiles_update_admin" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- customers: user thường chỉ thấy khách của mình; admin thấy tất cả
create policy "customers_select" on public.customers
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "customers_insert" on public.customers
  for insert with check (owner_id = auth.uid());

create policy "customers_update" on public.customers
  for update using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "customers_delete" on public.customers
  for delete using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 4) Ghi chú:
-- - Muốn nâng 1 tài khoản lên admin: chạy
--     update public.profiles set role = 'admin' where id = '<user_uuid>';
--   (lấy user_uuid trong Authentication > Users trên Supabase Dashboard)
