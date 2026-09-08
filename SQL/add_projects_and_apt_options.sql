-- Migration: thuộc tính "Dự án" (multi-select, danh sách tự quản lý) + cột projects
--
-- 1) Bảng project_options: danh sách dự án dùng chung cho biểu mẫu, theo từng
--    tài khoản (owner). Thêm/xoá được, lưu vĩnh viễn. Seed sẵn 2 dự án ban đầu.
-- 2) customers.projects: mảng tên dự án khách quan tâm (cho phép chọn nhiều).
--
-- Loại căn KHÔNG đổi schema (vẫn dùng cột apt_type text) — chỉ đổi UI ở client.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới.

create table if not exists public.project_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (name, owner_id)
);

alter table public.project_options enable row level security;

-- Mỗi user chỉ thấy & quản lý danh sách dự án của chính mình (không tự tham chiếu
-- bảng khác → không lo đệ quy RLS). Chỉ có select/insert/delete (không cần update).
drop policy if exists "project_options_select" on public.project_options;
create policy "project_options_select" on public.project_options
  for select using (owner_id = auth.uid());
drop policy if exists "project_options_insert" on public.project_options;
create policy "project_options_insert" on public.project_options
  for insert with check (owner_id = auth.uid());
drop policy if exists "project_options_delete" on public.project_options;
create policy "project_options_delete" on public.project_options
  for delete using (owner_id = auth.uid());

-- RLS không thay GRANT ở tầng bảng — phải cấp quyền tường minh.
grant select, insert, delete on public.project_options to authenticated;

-- Seed 2 dự án ban đầu cho mọi user đang có (xoá được sau này).
insert into public.project_options (name, owner_id)
select v.name, u.id
from auth.users u
cross join (values ('Marquee Homes'), ('Vin Tràng Cát')) as v(name)
on conflict (name, owner_id) do nothing;

-- Cột mảng dự án khách quan tâm (multi-select, lưu theo tên dự án).
alter table public.customers
  add column if not exists projects jsonb not null default '[]'::jsonb;
