-- ============================================================================
-- SQL/v2/001_customer_audit.sql — T0.2 · D-012 · architecture.md §3.1.6
-- Nhật ký thay đổi khách (append-only): mỗi UPDATE / DELETE trên public.customers ghi
-- GIÁ TRỊ CŨ vào public.customer_changes → khôi phục được nếu app/agent ghi sai hoặc xoá nhầm.
--
-- CHỈ THÊM: tạo bảng mới + trigger mới. KHÔNG đổi cột/dữ liệu của customers.
-- Chạy được nhiều lần (idempotent). Thứ tự bắt buộc:
--   1) Backup production (docs/runbooks/backup.md)  2) chạy trên STAGING + tests/sql/001_customer_audit.test.sql
--   3) chủ dự án chạy trên PRODUCTION (Supabase Dashboard › SQL Editor › dán cả file › Run).
-- Hướng dẫn + truy vấn khôi phục: docs/runbooks/audit.md
-- ============================================================================

-- 0) Helper admin (security definer, tránh RLS tự tham chiếu profiles — pitfalls.md §2).
--    Production thường ĐÃ có (SQL/add_team_assign.sql, add_documents.sql) → chỉ tạo khi thiếu, không ghi đè.
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

-- 1) Bảng nhật ký. KHÔNG khoá ngoại tới customers (dòng nhật ký phải sống sau khi khách bị xoá).
create table if not exists public.customer_changes (
  id           bigserial primary key,
  customer_id  uuid not null,
  owner_id     uuid,                                   -- người phụ trách lúc thay đổi (để RLS còn đúng sau khi xoá/giao khách)
  changed_at   timestamptz not null default now(),
  changed_by   uuid default auth.uid(),                -- null = service role (landing / Worker) hoặc SQL Editor
  changed_role text,                                   -- 'authenticated' | 'service_role' | tên role Postgres (SQL Editor)
  op           text not null check (op in ('UPDATE', 'DELETE')),
  old          jsonb not null,                         -- UPDATE: giá trị CŨ của các cột đổi (+ updated_at/updated_by cũ); DELETE: cả hàng
  new_keys     text[] not null default '{}'            -- UPDATE: tên các cột đã đổi; DELETE: rỗng
);

create index if not exists customer_changes_customer_idx on public.customer_changes (customer_id, changed_at desc);
create index if not exists customer_changes_changed_at_idx on public.customer_changes (changed_at desc);

comment on table public.customer_changes is
  'Append-only audit of customers (T0.2, D-012). Written only by trigger audit_customer_change. Never update/delete.';

-- 2) Hàm trigger. security definer → ghi được dù client không có quyền insert.
--    Lỗi khi ghi nhật ký → cả câu UPDATE/DELETE thất bại (không có thay đổi nào "lọt" mà không được ghi).
create or replace function public.audit_customer_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o     jsonb;
  n     jsonb;
  diff  jsonb  := '{}'::jsonb;
  keys  text[] := '{}';
  k     text;
  actor text   := coalesce(auth.jwt() ->> 'role', session_user::text);
begin
  begin
    if tg_op = 'DELETE' then
      insert into public.customer_changes (customer_id, owner_id, changed_role, op, old, new_keys)
      values (old.id, old.owner_id, actor, 'DELETE', to_jsonb(old), '{}');
      return old;
    end if;

    o := to_jsonb(old);
    n := to_jsonb(new);
    for k in select jsonb_object_keys(o) loop
      if k in ('updated_at', 'updated_by') then continue; end if;   -- trigger set_updated_meta luôn đổi 2 cột này
      if (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, o -> k);
        keys := keys || k;
      end if;
    end loop;

    if cardinality(keys) = 0 then
      return new;                                                  -- chỉ đổi updated_at/updated_by → không ghi
    end if;

    diff := diff || jsonb_build_object('updated_at', o -> 'updated_at', 'updated_by', o -> 'updated_by');
    insert into public.customer_changes (customer_id, owner_id, changed_role, op, old, new_keys)
    values (old.id, old.owner_id, actor, 'UPDATE', diff, keys);
    return new;
  exception when others then
    raise exception 'Không ghi được nhật ký thay đổi khách (customer_changes) — thao tác % đã bị huỷ, dữ liệu không đổi. Lỗi gốc: %', tg_op, sqlerrm
      using errcode = sqlstate, hint = 'Xem docs/runbooks/audit.md mục Sự cố.';
  end;
end;
$$;

-- Hàm trigger không cần gọi trực tiếp.
revoke all on function public.audit_customer_change() from public, anon, authenticated;

drop trigger if exists customers_audit on public.customers;  -- chỉ trigger của chính file này (tạo lại khi chạy lại)
create trigger customers_audit
  after update or delete on public.customers
  for each row execute function public.audit_customer_change();

-- 3) Chặn sửa / xoá nhật ký — kể cả service role và SQL Editor (append-only thật sự).
--    Muốn dọn dữ liệu cũ sau này: quyết định riêng + backup, tạm tắt trigger này có chủ đích.
create or replace function public.customer_changes_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'customer_changes là nhật ký chỉ-thêm: không được % (xem docs/runbooks/audit.md)', tg_op;
end;
$$;

drop trigger if exists customer_changes_no_update_delete on public.customer_changes;
create trigger customer_changes_no_update_delete
  before update or delete on public.customer_changes
  for each row execute function public.customer_changes_append_only();

drop trigger if exists customer_changes_no_truncate on public.customer_changes;
create trigger customer_changes_no_truncate
  before truncate on public.customer_changes
  for each statement execute function public.customer_changes_append_only();

-- 4) Quyền: RLS + GRANT (pitfalls.md §3). Client chỉ được ĐỌC nhật ký khách của mình; admin đọc hết.
alter table public.customer_changes enable row level security;

revoke all on public.customer_changes from public, anon, authenticated, service_role;
grant select on public.customer_changes to authenticated, service_role;
revoke all on sequence public.customer_changes_id_seq from public, anon, authenticated, service_role;

drop policy if exists customer_changes_select on public.customer_changes;
create policy customer_changes_select on public.customer_changes
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.customers c where c.id = customer_changes.customer_id and c.owner_id = auth.uid())
  );
-- Không có policy insert/update/delete → client không ghi/sửa/xoá được (trigger ghi bằng quyền chủ hàm).

-- 5) Kiểm tra nhanh sau khi chạy (kết quả mong đợi: 1 dòng, trigger_count = 3, rls = true):
-- select (select count(*) from pg_trigger where tgname in ('customers_audit','customer_changes_no_update_delete','customer_changes_no_truncate')) as trigger_count,
--        (select relrowsecurity from pg_class where oid = 'public.customer_changes'::regclass) as rls;
