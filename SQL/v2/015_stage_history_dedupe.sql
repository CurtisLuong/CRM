-- ============================================================================
-- SQL/v2/015_stage_history_dedupe.sql — Bỏ mốc bậc CÙNG BẬC lặp lại trong lịch sử bậc của khách đang chăm sóc
-- (ST-01, Curtis duyệt 2026-11-09: "Chuyển thành Ghi chú").
--
-- Luật mới: chuyển bậc chỉ khi trạng thái khách thật sự đổi; trong một bậc chỉ có hoạt động (ghi chú, cuộc gọi,
-- việc…). Trước đây gọi khách đã đạt / cập nhật cùng bậc ghi thêm một mốc cùng bậc (cách v1) → Dòng thời gian hiện
-- "Bậc: Đang chăm sóc" nhiều lần. App mới không ghi mốc cùng bậc nữa; file này dọn dữ liệu cũ.
--
-- Phạm vi: khách CHƯA lưu trữ (archived_at null), CHƯA loại (disqualified_at null, care_stage <> 'Loại').
-- Với từng khách, duyệt care_stage_history theo thứ tự mảng (cũng là thứ tự đồng hồ SLA dùng):
--   - mốc có bậc (đã đổi tên cũ "Booking"/"Hỗ trợ hồ sơ" → "Booking & Làm hồ sơ") trùng mốc giữ lại liền trước → BỎ;
--   - mốc bị bỏ có ghi chú, KHÔNG trùng giờ (±2 phút) một cuộc gọi trong call_attempts → thêm vào notes_manual
--     {text, at (giờ của mốc), origin:'stage_history'}; ghi chú trùng giờ cuộc gọi là bản sao của dòng cuộc gọi → bỏ;
--   - phần tử null / thiếu bậc giữ nguyên; mốc chuyển bậc thật giữ nguyên (cả thuộc tính lạ).
-- Đồng hồ SLA không đổi (đã tính từ mốc đầu của chuỗi cùng bậc). care_stage, care_stage_updated_at không đụng.
--
-- An toàn: (1) bảng sao lưu customer_stage_history_backup_015 giữ care_stage_history + notes_manual gốc của mọi
-- khách bị sửa; (2) trigger customers_audit cũng ghi giá trị cũ. Chạy lại được (lần 2 không còn gì để sửa).
--
-- CÁCH CHẠY (Supabase → SQL Editor). STAGING mksjmpcsfawsiabfhoxe trước, rồi PRODUCTION nrqccwamwctihivpxjww:
--   Bước 1: chạy MỤC 1 (tạo hàm + bảng sao lưu).
--   Bước 2: chạy MỤC 2 (xem trước, KHÔNG sửa) → gửi Lead 3 con số.
--   Bước 3: Lead xác nhận → chạy MỤC 3 (áp dụng) → so số với bước 2.
--   Bước 4: chạy MỤC 4 (xoá hàm tạm).
-- Rollback (nếu cần): MỤC 5.
-- ============================================================================

-- ── MỤC 1: hàm tạm + bảng sao lưu ──────────────────────────────────────────
create table if not exists public.customer_stage_history_backup_015 (
  customer_id uuid primary key,
  care_stage_history jsonb not null,
  notes_manual jsonb,
  backed_up_at timestamptz not null default now()
);
alter table public.customer_stage_history_backup_015 enable row level security;
revoke all on table public.customer_stage_history_backup_015 from public, anon, authenticated;

create or replace function public.st015_stage_dedupe(p_apply boolean)
returns table (customers_affected integer, milestones_removed integer, notes_added integer)
language plpgsql
set search_path = public
as $$
declare
  c record;
  el jsonb;
  kept jsonb;
  added jsonb;
  prev_stage text;
  cur_stage text;
  note_text text;
  el_at timestamptz;
  is_call_echo boolean;
  n_customers integer := 0;
  n_removed integer := 0;
  n_notes integer := 0;
  removed_here integer;
begin
  for c in
    select id, care_stage_history,
           case when jsonb_typeof(notes_manual) = 'array' then notes_manual else '[]'::jsonb end as notes_manual,
           case when jsonb_typeof(call_attempts) = 'array' then call_attempts else '[]'::jsonb end as call_attempts,
           notes_manual as notes_raw
    from public.customers
    where archived_at is null
      and disqualified_at is null
      and coalesce(care_stage, '') <> 'Loại'
      and jsonb_typeof(care_stage_history) = 'array'
      and jsonb_array_length(care_stage_history) > 1
    for update
  loop
    kept := '[]'::jsonb;
    added := '[]'::jsonb;
    prev_stage := null;
    removed_here := 0;
    for el in select value from jsonb_array_elements(c.care_stage_history) loop
      if jsonb_typeof(el) <> 'object' or coalesce(el->>'stage', '') = '' then
        kept := kept || jsonb_build_array(el);
        continue;
      end if;
      cur_stage := case el->>'stage'
        when 'Booking' then 'Booking & Làm hồ sơ'
        when 'Hỗ trợ hồ sơ' then 'Booking & Làm hồ sơ'
        else el->>'stage'
      end;
      if prev_stage is not null and cur_stage = prev_stage then
        removed_here := removed_here + 1;
        note_text := nullif(btrim(coalesce(el->>'note', '')), '');
        if note_text is not null then
          begin
            el_at := (el->>'at')::timestamptz;
          exception when others then
            el_at := null;
          end;
          is_call_echo := el_at is not null and exists (
            select 1 from jsonb_array_elements(c.call_attempts) a
            where jsonb_typeof(a) = 'object'
              and coalesce(a->>'at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
              and abs(extract(epoch from ((a->>'at')::timestamptz - el_at))) <= 120
          );
          if not is_call_echo then
            added := added || jsonb_build_array(
              jsonb_build_object('text', note_text, 'at', el->>'at', 'origin', 'stage_history')
            );
          end if;
        end if;
      else
        kept := kept || jsonb_build_array(el);
        prev_stage := cur_stage;
      end if;
    end loop;

    if removed_here > 0 then
      n_customers := n_customers + 1;
      n_removed := n_removed + removed_here;
      n_notes := n_notes + jsonb_array_length(added);
      if p_apply then
        insert into public.customer_stage_history_backup_015 (customer_id, care_stage_history, notes_manual)
        values (c.id, c.care_stage_history, coalesce(c.notes_raw, 'null'::jsonb))
        on conflict (customer_id) do nothing;
        update public.customers
        set care_stage_history = kept,
            notes_manual = c.notes_manual || added
        where id = c.id;
      end if;
    end if;
  end loop;
  return query select n_customers, n_removed, n_notes;
end;
$$;
revoke all on function public.st015_stage_dedupe(boolean) from public, anon, authenticated;

-- ── MỤC 2: XEM TRƯỚC (không sửa gì) ─────────────────────────────────────────
-- select * from public.st015_stage_dedupe(false);

-- ── MỤC 3: ÁP DỤNG (chỉ chạy sau khi Lead xác nhận số ở mục 2) ─────────────
-- select * from public.st015_stage_dedupe(true);

-- ── MỤC 4: dọn hàm tạm (giữ bảng sao lưu) ──────────────────────────────────
-- drop function if exists public.st015_stage_dedupe(boolean);

-- ── MỤC 5: ROLLBACK (chỉ khi cần trả lại nguyên trạng) ─────────────────────
-- Chỉ dùng NGAY sau mục 3: ghi chú/mốc bậc ghi thêm sau thời điểm chạy sẽ bị ghi đè bởi bản sao lưu.
-- update public.customers c
-- set care_stage_history = b.care_stage_history, notes_manual = coalesce(b.notes_manual, '[]'::jsonb)
-- from public.customer_stage_history_backup_015 b
-- where b.customer_id = c.id;
