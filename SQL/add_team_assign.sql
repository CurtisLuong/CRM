-- Migration: NHÓM SALE + GIAO KHÁCH CHO ĐỒNG NGHIỆP (2026-10-08, quyết định D-003)
--
-- 3 kịch bản (do người giao chọn):
--   1. Khách của tôi            : owner_id = tôi
--   2. Giao, tôi vẫn theo dõi   : owner_id = đồng nghiệp, followers chứa tôi (tôi CHỈ XEM)
--   3. Giao hẳn                 : owner_id = đồng nghiệp, followers KHÔNG chứa tôi (tôi không thấy nữa;
--                                 riêng admin/trưởng nhóm vẫn thấy qua bộ lọc "Cả nhóm")
--
-- Dữ liệu:
--   • customers.owner_id   = NGƯỜI PHỤ TRÁCH (giữ nguyên nghĩa cũ). Chỉ người phụ trách (hoặc admin) được sửa/xoá/giao tiếp.
--   • customers.followers  = mảng user id cùng theo dõi — chỉ được XEM (RLS chỉ cho SELECT).
--   • team_members         = danh sách đồng nghiệp do admin thêm bằng email. Chỉ giao được cho người trong nhóm.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- CHẠY TRƯỚC khi deploy code mới (code mới đọc cột followers + gọi các hàm team_*).
-- SAU KHI CHẠY: đặt tài khoản trưởng nhóm làm admin — xem mục 7 cuối file.

-- 0) Hàm kiểm tra admin (security definer — tránh đệ quy policy; tạo lại cho chắc, cùng định nghĩa cũ)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 1) Bảng thành viên nhóm ------------------------------------------------------------
create table if not exists public.team_members (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
-- Không mở SELECT/INSERT trực tiếp: mọi thao tác qua các hàm team_* bên dưới (kiểm tra quyền bên trong).
revoke all on public.team_members from anon, authenticated;

-- Thuộc nhóm = có trong team_members HOẶC là admin.
create or replace function public.is_team_member(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select uid is not null and (
    exists (select 1 from public.team_members where user_id = uid)
    or exists (select 1 from public.profiles where id = uid and role = 'admin')
  );
$$;

-- 2) Cột người cùng theo dõi ---------------------------------------------------------
alter table public.customers
  add column if not exists followers uuid[] not null default '{}';
create index if not exists customers_followers_idx on public.customers using gin (followers);

-- 3) RLS customers --------------------------------------------------------------------
drop policy if exists "customers_select" on public.customers;
create policy "customers_select" on public.customers
  for select using (
    owner_id = auth.uid()
    or auth.uid() = any (followers)
    or public.is_admin()
  );

drop policy if exists "customers_insert" on public.customers;
create policy "customers_insert" on public.customers
  for insert with check (owner_id = auth.uid());

-- Sửa: chỉ người phụ trách hoặc admin. Sau khi sửa, người phụ trách MỚI phải là chính mình
-- hoặc thành viên nhóm (giao hẳn → dòng mới không còn thuộc mình nên không dùng check mặc định).
drop policy if exists "customers_update" on public.customers;
create policy "customers_update" on public.customers
  for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin() or public.is_team_member(owner_id));

drop policy if exists "customers_delete" on public.customers;
create policy "customers_delete" on public.customers
  for delete using (owner_id = auth.uid() or public.is_admin());

-- 4) Trigger chặn đổi người phụ trách / người theo dõi trái phép ------------------------
-- (Bảo vệ thêm ở tầng DB, không chỉ dựa vào giao diện.) Bỏ qua khi auth.uid() trống
-- (service role — vd API landing page).
create or replace function public.guard_customer_assignment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare f uuid;
begin
  if auth.uid() is null then return new; end if;
  if new.owner_id is distinct from old.owner_id or new.followers is distinct from old.followers then
    if not (old.owner_id = auth.uid() or public.is_admin()) then
      raise exception 'Chỉ người phụ trách hoặc trưởng nhóm được giao khách' using errcode = '42501';
    end if;
    if not public.is_team_member(new.owner_id) and new.owner_id <> auth.uid() then
      raise exception 'Người nhận không thuộc nhóm' using errcode = '42501';
    end if;
    -- Người theo dõi phải thuộc nhóm; bỏ trùng và bỏ chính người phụ trách.
    new.followers := coalesce((
      select array_agg(distinct x) from unnest(new.followers) as x
      where x is not null and x <> new.owner_id
    ), '{}');
    foreach f in array new.followers loop
      if not public.is_team_member(f) and f <> auth.uid() then
        raise exception 'Người theo dõi không thuộc nhóm' using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists customers_guard_assignment on public.customers;
create trigger customers_guard_assignment
  before update on public.customers
  for each row execute function public.guard_customer_assignment();

-- 5) Tài liệu (bảng documents + file trong bucket customer-docs): ai XEM được khách thì xem được
--    tài liệu của khách đó (kể cả tài liệu người phụ trách cũ đã tải lên).
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (
    owner_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.customers c where c.id = documents.customer_id)
  );
-- Người phụ trách mới được thêm tài liệu vào thư mục của chính mình (insert giữ nguyên).
drop policy if exists "cust_docs_select" on storage.objects;
create policy "cust_docs_select" on storage.objects
  for select using (
    bucket_id = 'customer-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.documents d where d.storage_path = storage.objects.name)
    )
  );

-- 6) Hàm quản lý nhóm (gọi từ app qua RPC) --------------------------------------------
-- Danh sách nhóm: admin + thành viên. Chỉ người trong nhóm gọi được.
create or replace function public.team_list()
returns table (user_id uuid, full_name text, email text, is_admin boolean, is_me boolean)
language sql
stable
security definer set search_path = public
as $$
  select u.id, p.full_name, u.email::text, coalesce(p.role = 'admin', false), u.id = auth.uid()
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_team_member(auth.uid())
    and (exists (select 1 from public.team_members t where t.user_id = u.id) or p.role = 'admin')
  order by coalesce(p.role = 'admin', false) desc, coalesce(nullif(p.full_name, ''), u.email);
$$;

-- Thêm đồng nghiệp bằng email (chỉ admin). Đồng nghiệp phải TỰ TẠO TÀI KHOẢN trong app trước.
create or replace function public.team_add(member_email text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Chỉ trưởng nhóm được thêm đồng nghiệp' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(member_email)) limit 1;
  if uid is null then raise exception 'Chưa có tài khoản với email này — nhờ đồng nghiệp tạo tài khoản trong app trước' using errcode = 'P0002'; end if;
  insert into public.team_members (user_id, added_by) values (uid, auth.uid()) on conflict (user_id) do nothing;
  return uid;
end;
$$;

-- Xoá khỏi nhóm (chỉ admin). Khách đang giao cho người đó KHÔNG tự đổi — trưởng nhóm giao lại.
create or replace function public.team_remove(member_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Chỉ trưởng nhóm được xoá đồng nghiệp' using errcode = '42501'; end if;
  delete from public.team_members where user_id = member_id;
end;
$$;

-- Đổi tên hiển thị của chính mình (profiles chỉ admin được UPDATE).
create or replace function public.team_set_my_name(new_name text)
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles set full_name = nullif(trim(new_name), '') where id = auth.uid();
$$;

revoke all on function public.team_list() from public, anon;
revoke all on function public.team_add(text) from public, anon;
revoke all on function public.team_remove(uuid) from public, anon;
revoke all on function public.team_set_my_name(text) from public, anon;
grant execute on function public.team_list() to authenticated;
grant execute on function public.team_add(text) to authenticated;
grant execute on function public.team_remove(uuid) to authenticated;
grant execute on function public.team_set_my_name(text) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;

-- 7) ĐẶT TRƯỞNG NHÓM (chạy 1 lần, thay email của bạn rồi bỏ dấu -- ở đầu dòng):
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where lower(email) = lower('EMAIL_CUA_BAN@gmail.com'));
-- Kiểm tra: select u.email, p.role from auth.users u join public.profiles p on p.id = u.id;
