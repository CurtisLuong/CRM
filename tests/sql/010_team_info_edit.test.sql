-- ============================================================================
-- tests/sql/010_team_info_edit.test.sql — kiểm SQL/v2/010_team_info_edit.sql (D-025).
-- Chạy trên STAGING (mksjmpcsfawsiabfhoxe) SAU khi chạy migration. Cần 1 admin (profiles.role='admin')
-- và 1 thành viên nhóm KHÔNG admin trong team_members.
-- Không để lại dữ liệu: dùng lỗi ở cuối để rollback.
-- KẾT QUẢ MONG ĐỢI: lỗi đỏ "D025 TEST: TẤT CẢ ĐẠT (6/6) — đã rollback". Nội dung khác = hỏng.
-- ============================================================================
do $$
declare
  owner_a  uuid := (select id from public.profiles where role = 'admin' order by id limit 1);
  follower uuid := (select user_id from public.team_members t
                    where not exists (select 1 from public.profiles p where p.id = t.user_id and p.role = 'admin')
                    limit 1);
  stranger uuid := gen_random_uuid();
  cid      uuid := gen_random_uuid();
  n        int;
  passed   int := 0;
  st       text;
begin
  if owner_a is null or follower is null then raise exception 'D025 TEST: cần 1 admin + 1 thành viên không admin'; end if;

  insert into public.customers (id, phone, full_name, owner_id, followers, care_stage, residence, notes_manual)
  values (cid, 'd025-test-0000', 'Khách kiểm thử D-025', owner_a, array[follower], 'Đang chăm sóc', 'cũ',
          '[{"text":"ghi chú 1","at":"2026-01-01T00:00:00Z","x_unknown":1}]'::jsonb);

  -- Đăng nhập vai người theo dõi (RLS + auth.uid()).
  perform set_config('request.jwt.claims', json_build_object('sub', follower, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1) Sửa thông tin hồ sơ → được, đúng 1 dòng.
  update public.customers set residence = 'Kỹ sư', income = '30 triệu' where id = cid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'D025 TEST 1 hỏng: sửa thông tin được % dòng', n; end if;
  passed := passed + 1;

  -- 2) Thêm ghi chú (notes_manual) → được, giữ thuộc tính lạ của ghi chú cũ.
  update public.customers
     set notes_manual = '[{"text":"mới","at":"2026-10-22T00:00:00Z"},{"text":"ghi chú 1","at":"2026-01-01T00:00:00Z","x_unknown":1}]'::jsonb
   where id = cid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'D025 TEST 2 hỏng: thêm ghi chú được % dòng', n; end if;
  passed := passed + 1;

  -- 3) Đổi bậc → server chặn 42501.
  begin
    update public.customers set care_stage = 'Xem dự án' where id = cid;
    raise exception 'D025 TEST 3 hỏng: đổi bậc không bị chặn';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- 4) Ghi lịch gọi kèm thông tin trong cùng câu → chặn cả câu.
  begin
    update public.customers set residence = 'x', next_call_at = now() where id = cid;
    raise exception 'D025 TEST 4 hỏng: next_call_at không bị chặn';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- 5) Lưu trữ → chặn.
  begin
    update public.customers set archived_at = now() where id = cid;
    raise exception 'D025 TEST 5 hỏng: lưu trữ không bị chặn';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- 6) Người không theo dõi, không phụ trách → không thấy dòng nào để sửa.
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  update public.customers set residence = 'lạ' where id = cid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'D025 TEST 6 hỏng: người lạ sửa được % dòng', n; end if;
  passed := passed + 1;

  reset role;
  if (select residence from public.customers where id = cid) <> 'Kỹ sư'
     or (select care_stage from public.customers where id = cid) <> 'Đang chăm sóc' then
    raise exception 'D025 TEST: giá trị cuối sai';
  end if;
  raise exception 'D025 TEST: TẤT CẢ ĐẠT (%/6) — đã rollback', passed;
end $$;
