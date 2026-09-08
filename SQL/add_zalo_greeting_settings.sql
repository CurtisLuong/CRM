-- Migration: bảng user_settings — lưu CÀI ĐẶT RIÊNG của mỗi user (đồng bộ đa thiết bị)
--
-- BỐI CẢNH: "Lời chào Zalo" trước lưu ở localStorage (theo TỪNG MÁY) nên sửa ở Mac không
-- hiện trên Android. Chuyển sang lưu ở Supabase để đồng bộ. KHÔNG dùng cột trong bảng
-- profiles vì policy profiles chỉ cho admin UPDATE (cho user tự sửa profiles sẽ hở việc
-- tự nâng role='admin'). Tạo bảng RIÊNG, mỗi user chỉ CRUD dòng của chính mình.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. Chạy lại nhiều lần vẫn an toàn.

-- 1) Bảng cài đặt theo user (id = auth.users.id)
create table if not exists public.user_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  zalo_greeting text,
  updated_at timestamptz not null default now()
);

-- 2) RLS: mỗi user chỉ đọc/ghi dòng của CHÍNH MÌNH (id = auth.uid()).
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select" on public.user_settings;
create policy "user_settings_select" on public.user_settings
  for select using (id = auth.uid());

drop policy if exists "user_settings_insert" on public.user_settings;
create policy "user_settings_insert" on public.user_settings
  for insert with check (id = auth.uid());

drop policy if exists "user_settings_update" on public.user_settings;
create policy "user_settings_update" on public.user_settings
  for update using (id = auth.uid()) with check (id = auth.uid());

-- 3) GRANT tầng bảng (RLS không thay GRANT — xem bẫy #3 trong CLAUDE.md)
grant select, insert, update on public.user_settings to authenticated;
