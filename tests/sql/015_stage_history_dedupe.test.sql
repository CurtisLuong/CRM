-- ============================================================================
-- tests/sql/015_stage_history_dedupe.test.sql — kiểm SQL/v2/015_stage_history_dedupe.sql (ST-01).
-- Chạy trên STAGING (mksjmpcsfawsiabfhoxe) SAU MỤC 1 của migration (đã có hàm st015_stage_dedupe). Cần 1 admin.
-- Không để lại dữ liệu: dùng lỗi ở cuối để rollback (kể cả những khách thật được hàm xử lý trong lúc thử).
-- KẾT QUẢ MONG ĐỢI: lỗi đỏ "ST015 TEST: TẤT CẢ ĐẠT (5/5) — đã rollback". Nội dung khác = hỏng.
-- ============================================================================
do $$
declare
  owner_a uuid := (select id from public.profiles where role = 'admin' order by id limit 1);
  cid     uuid := gen_random_uuid();   -- ví dụ của Curtis 09/11
  cid2    uuid := gen_random_uuid();   -- đổi bậc xen kẽ thật
  cid3    uuid := gen_random_uuid();   -- khách đã lưu trữ: không đụng
  row_    record;
  passed  int := 0;
begin
  if owner_a is null then raise exception 'ST015 TEST: cần 1 admin'; end if;

  insert into public.customers (id, phone, full_name, owner_id, care_stage, call_attempts, notes_manual, care_stage_history)
  values (cid, 'st015-test-0001', 'Khách kiểm thử ST015', owner_a, 'Nuôi dài hạn',
    '[{"at":"2026-10-09T15:29:00Z","result":"talked"},{"at":"2026-10-10T14:11:30Z","result":"talked"}]'::jsonb,
    '[{"text":"Khách đứng tên doanh nghiệp","at":"2026-10-09T15:58:00Z","x_unknown":1}]'::jsonb,
    '[{"stage":"Đang chăm sóc","note":null,"at":"2026-10-09T15:29:00Z"},
      {"stage":"Đang chăm sóc","note":"đã gọi 21:11, 10.10.2026","at":"2026-10-10T14:11:00Z"},
      {"stage":"Nuôi dài hạn","note":"Tự động: quá 20 ngày","at":"2026-10-30T03:53:00Z","auto":"sla"},
      {"stage":"Nuôi dài hạn","note":"d","at":"2026-11-03T08:33:00Z"}]'::jsonb);

  insert into public.customers (id, phone, full_name, owner_id, care_stage, care_stage_history)
  values (cid2, 'st015-test-0002', 'Khách kiểm thử ST015 b', owner_a, 'Đang chăm sóc',
    '[{"stage":"Đang chăm sóc","at":"2026-10-01T00:00:00Z"},{"stage":"Nuôi dài hạn","at":"2026-10-05T00:00:00Z"},
      {"stage":"Đang chăm sóc","at":"2026-10-08T00:00:00Z"},{"stage":"Booking","at":"2026-10-09T00:00:00Z"},
      {"stage":"Booking & Làm hồ sơ","note":"cọc","at":"2026-10-10T00:00:00Z"}]'::jsonb);

  insert into public.customers (id, phone, full_name, owner_id, care_stage, archived_at, care_stage_history)
  values (cid3, 'st015-test-0003', 'Khách kiểm thử ST015 c', owner_a, 'Đang chăm sóc', now(),
    '[{"stage":"Đang chăm sóc","at":"2026-10-01T00:00:00Z"},{"stage":"Đang chăm sóc","note":"x","at":"2026-10-02T00:00:00Z"}]'::jsonb);

  perform public.st015_stage_dedupe(true);

  -- 1) Ví dụ Curtis: còn 2 mốc chuyển bậc (CS 09/10, NDH 30/10 giữ auto).
  select care_stage_history, notes_manual into row_ from public.customers where id = cid;
  if jsonb_array_length(row_.care_stage_history) <> 2
     or row_.care_stage_history->1->>'auto' <> 'sla'
     or row_.care_stage_history->0->>'at' <> '2026-10-09T15:29:00Z' then
    raise exception 'ST015 TEST 1 hỏng: %', row_.care_stage_history;
  end if;
  passed := passed + 1;

  -- 2) "d" thành Ghi chú cùng giờ; "đã gọi…" trùng giờ cuộc gọi (±2 phút) → bỏ; ghi chú cũ giữ thuộc tính lạ.
  if jsonb_array_length(row_.notes_manual) <> 2
     or row_.notes_manual->1->>'text' <> 'd'
     or row_.notes_manual->1->>'at' <> '2026-11-03T08:33:00Z'
     or row_.notes_manual->0->>'x_unknown' <> '1' then
    raise exception 'ST015 TEST 2 hỏng: %', row_.notes_manual;
  end if;
  passed := passed + 1;

  -- 3) Xen kẽ thật giữ đủ; "Booking" và "Booking & Làm hồ sơ" là một bậc → còn 4 mốc, ghi chú "cọc" thành Ghi chú.
  select care_stage_history, notes_manual into row_ from public.customers where id = cid2;
  if jsonb_array_length(row_.care_stage_history) <> 4 or row_.notes_manual->0->>'text' <> 'cọc' then
    raise exception 'ST015 TEST 3 hỏng: % / %', row_.care_stage_history, row_.notes_manual;
  end if;
  passed := passed + 1;

  -- 4) Khách đã lưu trữ không đụng.
  select care_stage_history into row_ from public.customers where id = cid3;
  if jsonb_array_length(row_.care_stage_history) <> 2 then raise exception 'ST015 TEST 4 hỏng'; end if;
  passed := passed + 1;

  -- 5) Sao lưu bản gốc; chạy lần 2 không còn gì để sửa.
  if (select jsonb_array_length(care_stage_history) from public.customer_stage_history_backup_015 where customer_id = cid) <> 4 then
    raise exception 'ST015 TEST 5 hỏng: thiếu bản sao lưu';
  end if;
  if (select customers_affected from public.st015_stage_dedupe(false)) <> 0 then
    raise exception 'ST015 TEST 5 hỏng: chạy lần 2 vẫn còn mốc trùng';
  end if;
  passed := passed + 1;

  raise exception 'ST015 TEST: TẤT CẢ ĐẠT (%/5) — đã rollback', passed;
end;
$$;
