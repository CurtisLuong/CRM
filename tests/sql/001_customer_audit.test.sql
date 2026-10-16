-- ============================================================================
-- tests/sql/001_customer_audit.test.sql — kiểm thử SQL/v2/001_customer_audit.sql (T0.2)
-- Chạy trên STAGING (Supabase › SQL Editor › dán cả file › Run) SAU khi đã chạy migration.
-- Không để lại dữ liệu: mọi thao tác nằm trong 1 khối và được ROLLBACK ở cuối.
--
-- KẾT QUẢ MONG ĐỢI: một thông báo LỖI màu đỏ có nội dung
--     "AUDIT TEST: TẤT CẢ ĐẠT (12/12) — đã rollback, không để lại dữ liệu"
-- (dùng lỗi để buộc rollback; đây là kết quả ĐÚNG). Mọi nội dung khác = có kiểm tra hỏng → gửi lại cho agent.
-- Cần ít nhất 1 tài khoản trong Authentication › Users.
-- ============================================================================
do $$
declare
  owner_a   uuid := (select id from auth.users order by created_at limit 1);
  stranger  uuid := gen_random_uuid();                 -- sale khác (không cần tồn tại trong auth.users)
  cid       uuid := gen_random_uuid();
  n         int;
  r         record;
  passed    int := 0;
  msg       text;
  st        text;
begin
  if owner_a is null then raise exception 'AUDIT TEST: cần ít nhất 1 user trong auth.users'; end if;

  -- Khách thử nghiệm (SĐT không hợp lệ cố ý để không trùng khách thật).
  insert into public.customers (id, phone, full_name, owner_id, notes_manual, next_tasks)
  values (cid, 'audit-test-0000', 'Khách kiểm thử audit', owner_a,
          '[{"text":"ghi chú 1","at":"2026-01-01T00:00:00Z","x_unknown":1}]'::jsonb, '[]'::jsonb);

  -- 1) UPDATE 2 cột → đúng 1 dòng, op UPDATE, giữ giá trị cũ, chỉ cột đổi (+ updated_at/updated_by).
  update public.customers set full_name = 'Khách kiểm thử audit (sửa)',
    notes_manual = '[{"text":"ghi chú 2","at":"2026-01-02T00:00:00Z"}]'::jsonb where id = cid;
  select count(*) into n from public.customer_changes where customer_id = cid;
  if n <> 1 then raise exception 'AUDIT TEST 1 hỏng: mong 1 dòng, có %', n; end if;
  select * into r from public.customer_changes where customer_id = cid;
  if r.op <> 'UPDATE' or r.owner_id <> owner_a
     or r.old ->> 'full_name' <> 'Khách kiểm thử audit'
     or r.old -> 'notes_manual' -> 0 ->> 'x_unknown' <> '1'
     or not (r.new_keys @> array['full_name', 'notes_manual']) or cardinality(r.new_keys) <> 2
     or r.old ? 'phone' or not (r.old ? 'updated_at')
  then raise exception 'AUDIT TEST 1 hỏng: nội dung dòng sai: op=% keys=% old=%', r.op, r.new_keys, r.old; end if;
  passed := passed + 1;

  -- 2) UPDATE không đổi giá trị thật (chỉ updated_at do trigger) → không thêm dòng.
  update public.customers set full_name = full_name where id = cid;
  select count(*) into n from public.customer_changes where customer_id = cid;
  if n <> 1 then raise exception 'AUDIT TEST 2 hỏng: update không đổi gì vẫn ghi nhật ký (% dòng)', n; end if;
  passed := passed + 1;

  -- 3) Sale khác không đọc được nhật ký khách này (RLS).
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.customer_changes where customer_id = cid;
  execute 'reset role';
  if n <> 0 then raise exception 'AUDIT TEST 3 hỏng: sale khác đọc được % dòng nhật ký', n; end if;
  passed := passed + 1;

  -- 4) Người phụ trách đọc được.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.customer_changes where customer_id = cid;
  execute 'reset role';
  if n <> 1 then raise exception 'AUDIT TEST 4 hỏng: người phụ trách đọc được % dòng (mong 1)', n; end if;
  passed := passed + 1;

  -- 5–7) Người phụ trách (authenticated) KHÔNG xoá / sửa / tự thêm được nhật ký.
  foreach msg in array array[
    'delete from public.customer_changes where customer_id = ' || quote_literal(cid),
    'update public.customer_changes set old = ''{}''::jsonb where customer_id = ' || quote_literal(cid),
    'insert into public.customer_changes (customer_id, op, old) values (' || quote_literal(cid) || ', ''UPDATE'', ''{}''::jsonb)'
  ] loop
    begin
      execute 'set local role authenticated';
      execute msg;
      execute 'reset role';
      raise exception 'AUDIT TEST hỏng: authenticated chạy được: %', msg;
    exception when insufficient_privilege then
      execute 'reset role';
      passed := passed + 1;
    end;
  end loop;

  -- 8) service_role (landing / Worker) không xoá được nhật ký.
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    execute 'set local role service_role';
    delete from public.customer_changes where customer_id = cid;
    execute 'reset role';
    raise exception 'AUDIT TEST 8 hỏng: service_role xoá được nhật ký';
  exception when insufficient_privilege then
    execute 'reset role';
    passed := passed + 1;
  end;

  -- 9) Kể cả SQL Editor (postgres) xoá nhầm cũng bị chặn bởi trigger chỉ-thêm.
  begin
    delete from public.customer_changes where customer_id = cid;
    raise exception 'AUDIT TEST 9 hỏng: xoá được nhật ký bằng quyền postgres';
  exception when raise_exception then
    get stacked diagnostics msg = message_text;
    if msg not like '%chỉ-thêm%' then raise exception 'AUDIT TEST 9 hỏng: lỗi lạ: %', msg; end if;
    passed := passed + 1;
  end;

  -- 10) Ghi nhật ký lỗi → UPDATE thất bại an toàn, báo rõ, dữ liệu khách không đổi.
  alter table public.customer_changes add constraint audit_test_force_fail check (false) not valid;
  begin
    update public.customers set full_name = 'KHÔNG ĐƯỢC LƯU' where id = cid;
    raise exception 'AUDIT TEST 10 hỏng: update vẫn chạy khi không ghi được nhật ký';
  exception when others then
    get stacked diagnostics msg = message_text, st = returned_sqlstate;
    if msg not like 'Không ghi được nhật ký thay đổi khách%' then raise exception 'AUDIT TEST 10 hỏng: thông báo lỗi không rõ: % (%)', msg, st; end if;
  end;
  alter table public.customer_changes drop constraint audit_test_force_fail;
  if (select full_name from public.customers where id = cid) <> 'Khách kiểm thử audit (sửa)' then
    raise exception 'AUDIT TEST 10 hỏng: dữ liệu khách bị đổi dù nhật ký lỗi';
  end if;
  passed := passed + 1;

  -- 11) DELETE khách → 1 dòng op DELETE chứa CẢ hàng cũ.
  delete from public.customers where id = cid;
  select * into r from public.customer_changes where customer_id = cid and op = 'DELETE';
  if r.id is null or r.old ->> 'phone' <> 'audit-test-0000' or r.old ->> 'full_name' <> 'Khách kiểm thử audit (sửa)'
     or r.old -> 'notes_manual' is null or r.owner_id <> owner_a
  then raise exception 'AUDIT TEST 11 hỏng: dòng DELETE thiếu dữ liệu: %', r.old; end if;
  passed := passed + 1;

  -- 12) Sau khi xoá, người phụ trách cũ vẫn đọc được nhật ký (RLS theo owner_id lưu trong nhật ký).
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.customer_changes where customer_id = cid;
  execute 'reset role';
  if n <> 2 then raise exception 'AUDIT TEST 12 hỏng: sau khi xoá, người phụ trách đọc được % dòng (mong 2)', n; end if;
  passed := passed + 1;

  raise exception 'AUDIT TEST: TẤT CẢ ĐẠT (%/12) — đã rollback, không để lại dữ liệu', passed;
end $$;
