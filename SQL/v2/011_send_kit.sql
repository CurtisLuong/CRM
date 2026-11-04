-- ============================================================================
-- SQL/v2/011_send_kit.sql — SK-03 · D-012 · Curtis 04/11
-- Tài liệu gửi khách (trang /tai-lieu) lên server: đồng bộ giữa các máy và
-- DÙNG CHUNG trong nhóm. Trước đây chỉ lưu IndexedDB trên từng máy.
--
-- Kiến trúc (giống SQL/add_documents.sql):
--   - bảng public.send_kit_items: chữ + metadata tệp (jsonb), xoá mềm deleted_at;
--   - bucket riêng tư 'send-kit': tệp thật, đường dẫn {owner_id}/{item_id}/{file_id}.{ext}.
-- Quyền:
--   - XEM (bảng + tệp): người tạo; trưởng nhóm; mọi thành viên nhóm thấy mục của thành viên nhóm khác.
--   - SỬA / XOÁ MỀM: người tạo hoặc trưởng nhóm (kể cả thêm tệp vào thư mục người tạo). Không ai đổi được người tạo.
--   - Không mở DELETE trên bảng (xoá = đặt deleted_at).
--   - Tệp: mỗi tệp tối đa 50MB (giới hạn gói Free); ảnh, PDF, video.
--
-- Chỉ thêm (bảng, index, hàm, policy, grant, trigger chặn, bucket). Chạy lại nhiều lần an toàn.
-- Thứ tự: staging (mksjmpcsfawsiabfhoxe) → kiểm → production (nrqccwamwctihivpxjww).
-- Cần trước: SQL/add_team_assign.sql (is_admin, is_team_member) — đã chạy cả 2 nơi.
--
-- Rollback (chưa có dữ liệu thật thì an toàn; có rồi thì backup trước):
--   drop policy if exists "send_kit_obj_select" on storage.objects;
--   drop policy if exists "send_kit_obj_insert" on storage.objects;
--   drop policy if exists "send_kit_obj_delete" on storage.objects;
--   drop table if exists public.send_kit_items;
--   drop function if exists public.send_kit_can_read(uuid);
--   drop function if exists public.send_kit_folder_owner(text);
--   drop function if exists public.guard_send_kit_owner();
--   (bucket: Dashboard → Storage → send-kit → xoá tệp rồi xoá bucket)
-- ============================================================================

-- 1) Bảng ---------------------------------------------------------------------
create table if not exists public.send_kit_items (
  id          uuid primary key,                       -- client tạo (crypto.randomUUID) để ghi offline
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',               -- chữ gửi khách, có {ten} {sale} {du_an}
  project     text,                                   -- null = Chung (mọi dự án)
  files       jsonb not null default '[]'::jsonb,     -- [{id, name, type, size, path}]
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- client đặt; last-write-wins
  deleted_at  timestamptz                             -- xoá mềm
);

create index if not exists send_kit_items_owner_idx on public.send_kit_items (owner_id);
create index if not exists send_kit_items_updated_idx on public.send_kit_items (updated_at);

comment on table public.send_kit_items is 'Tài liệu gửi khách (SK-03): dùng chung trong nhóm; tệp ở bucket send-kit';

-- 2) Ai đọc được mục của owner ------------------------------------------------
create or replace function public.send_kit_can_read(owner uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select owner is not null and (
    owner = auth.uid()
    or public.is_admin()
    or (public.is_team_member(auth.uid()) and public.is_team_member(owner))
  );
$$;

-- Thư mục đầu của đường dẫn tệp → uuid người tạo (null nếu không phải uuid, tránh lỗi ép kiểu).
create or replace function public.send_kit_folder_owner(object_name text)
returns uuid
language sql
stable
as $$
  select case
    when (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[1])::uuid
  end;
$$;

-- 3) RLS + GRANT bảng ---------------------------------------------------------
alter table public.send_kit_items enable row level security;

drop policy if exists "send_kit_select" on public.send_kit_items;
create policy "send_kit_select" on public.send_kit_items
  for select to authenticated using (public.send_kit_can_read(owner_id));

drop policy if exists "send_kit_insert" on public.send_kit_items;
create policy "send_kit_insert" on public.send_kit_items
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "send_kit_update" on public.send_kit_items;
create policy "send_kit_update" on public.send_kit_items
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

revoke all on public.send_kit_items from anon;
grant select, insert, update on public.send_kit_items to authenticated;

-- Chặn đổi người tạo (kể cả trưởng nhóm) — tệp nằm theo thư mục owner_id.
create or replace function public.guard_send_kit_owner()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Không đổi được người tạo tài liệu' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_send_kit_owner on public.send_kit_items;
create trigger trg_guard_send_kit_owner before update on public.send_kit_items
  for each row execute function public.guard_send_kit_owner();

-- 4) Bucket riêng tư ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('send-kit', 'send-kit', false, 52428800, array['image/*', 'application/pdf', 'video/*'])
on conflict (id) do nothing;

-- 5) RLS tệp ------------------------------------------------------------------
drop policy if exists "send_kit_obj_select" on storage.objects;
create policy "send_kit_obj_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'send-kit' and public.send_kit_can_read(public.send_kit_folder_owner(name))
  );

drop policy if exists "send_kit_obj_insert" on storage.objects;
create policy "send_kit_obj_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'send-kit'
    and ((storage.foldername(name))[1] = auth.uid()::text
      -- trưởng nhóm sửa mục của đồng nghiệp (thêm tệp) → tệp vẫn nằm thư mục người tạo
      or (public.is_admin() and public.send_kit_folder_owner(name) is not null))
  );

drop policy if exists "send_kit_obj_delete" on storage.objects;
create policy "send_kit_obj_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'send-kit'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Kiểm sau khi chạy (mong đợi: 3 policy bảng, 3 policy tệp, 1 bucket 52428800):
-- select policyname from pg_policies where tablename = 'send_kit_items';
-- select policyname from pg_policies where tablename = 'objects' and policyname like 'send_kit_obj_%';
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'send-kit';
