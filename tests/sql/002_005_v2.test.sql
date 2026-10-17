-- ============================================================================
-- tests/sql/002_005_v2.test.sql — kiểm thử SQL/v2/002…005 (T2.A5)
-- Chạy trên STAGING (Supabase › SQL Editor › dán cả file › Run) SAU khi đã chạy 4 migration.
-- Không để lại dữ liệu: mọi thao tác nằm trong 1 khối và được ROLLBACK ở cuối.
--
-- KẾT QUẢ MONG ĐỢI: một thông báo LỖI màu đỏ có nội dung
--     "V2 SQL TEST: TẤT CẢ ĐẠT (8/8) — đã rollback, không để lại dữ liệu"
-- (dùng lỗi để buộc rollback; đây là kết quả ĐÚNG). Mọi nội dung khác = có kiểm tra hỏng → gửi lại cho agent.
-- Cần ít nhất 1 tài khoản trong Authentication › Users.
-- ============================================================================
do $$
declare
  owner_a   uuid := (select id from auth.users order by created_at limit 1);
  stranger  uuid := gen_random_uuid();                 -- sale khác (không cần tồn tại trong auth.users)
  cid       uuid := gen_random_uuid();
  cost_id   uuid := gen_random_uuid();
  n         int;
  r         record;
  passed    int := 0;
  st        text;
begin
  if owner_a is null then raise exception 'V2 SQL TEST: cần ít nhất 1 user trong auth.users'; end if;

  -- 1) Đủ cột mới (002 + 004 + 005).
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and (
     (table_name = 'customers' and column_name in ('archived_at','contact_prefs','interests','household','interactions',
                                                   'close_reason','close_note','retarget_hint','field_meta','referred_by'))
     or (table_name = 'user_settings' and column_name = 'ui_state')
     or (table_name = 'units' and column_name = 'verified_at'));
  if n <> 12 then raise exception 'V2 SQL TEST 1 hỏng: mong 12 cột mới, có %', n; end if;
  passed := passed + 1;

  -- 2) Khách tạo kiểu v1 (chỉ cột cũ, như người phụ trách) → được, cột mới nhận default rỗng.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.customers (id, phone, full_name, owner_id)
  values (cid, 'v2-test-0000', 'Khách kiểm thử v2', owner_a);
  execute 'reset role';
  select * into r from public.customers where id = cid;
  if r.archived_at is not null or r.contact_prefs <> '{}'::jsonb or r.interests <> '[]'::jsonb
     or r.household <> '[]'::jsonb or r.interactions <> '[]'::jsonb or r.field_meta <> '{}'::jsonb
     or r.retarget_hint is not null or r.referred_by is not null
  then raise exception 'V2 SQL TEST 2 hỏng: default cột mới sai: %', to_jsonb(r); end if;
  passed := passed + 1;

  -- 3) Người phụ trách thêm chi phí chiến dịch.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.campaign_costs (id, source, campaign, period_start, amount)
  values (cost_id, 'facebook_ads', 'test-v2', date '2026-10-01', 1000000);
  select count(*) into n from public.campaign_costs where id = cost_id and owner_id = owner_a;
  execute 'reset role';
  if n <> 1 then raise exception 'V2 SQL TEST 3 hỏng: người tạo không thấy dòng vừa thêm (% dòng)', n; end if;
  passed := passed + 1;

  -- 4) Sale khác không đọc được.
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.campaign_costs where id = cost_id;
  execute 'reset role';
  if n <> 0 then raise exception 'V2 SQL TEST 4 hỏng: sale khác đọc được % dòng chi phí', n; end if;
  passed := passed + 1;

  -- 5) Sale khác không sửa được (RLS lọc → 0 dòng bị đổi).
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('update public.campaign_costs set amount = 1 where id = %L', cost_id);
  execute 'reset role';
  select amount into r from public.campaign_costs where id = cost_id;
  if r.amount <> 1000000 then raise exception 'V2 SQL TEST 5 hỏng: sale khác sửa được chi phí'; end if;
  passed := passed + 1;

  -- 6) Sale khác không thêm dòng đứng tên người khác.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.campaign_costs (owner_id, period_start, amount) values (owner_a, date '2026-10-01', 5);
    execute 'reset role';
    raise exception 'V2 SQL TEST 6 hỏng: sale khác thêm được dòng đứng tên người khác';
  exception when insufficient_privilege then
    execute 'reset role';
  end;
  passed := passed + 1;

  -- 7) Không ai xoá cứng qua API (không GRANT delete).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute format('delete from public.campaign_costs where id = %L', cost_id);
    execute 'reset role';
    raise exception 'V2 SQL TEST 7 hỏng: xoá cứng chi phí được';
  exception when insufficient_privilege then
    execute 'reset role';
  end;
  passed := passed + 1;

  -- 8) anon không đọc được.
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    select count(*) into n from public.campaign_costs;
    execute 'reset role';
    if n <> 0 then raise exception 'V2 SQL TEST 8 hỏng: anon đọc được % dòng', n; end if;
  exception when insufficient_privilege then
    execute 'reset role';
  end;
  passed := passed + 1;

  raise exception 'V2 SQL TEST: TẤT CẢ ĐẠT (%/8) — đã rollback, không để lại dữ liệu', passed
    using errcode = 'P0001';
exception when others then
  get stacked diagnostics st = message_text;
  raise exception '%', st;
end $$;
