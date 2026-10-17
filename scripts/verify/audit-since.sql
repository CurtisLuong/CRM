-- scripts/verify/audit-since.sql — soi nhật ký customer_changes từ một mốc giờ để tìm MẤT DỮ LIỆU (T5.2).
-- CHỈ ĐỌC. Chạy ở Supabase › SQL Editor của project STAGING (mksjmpcsfawsiabfhoxe).
-- Trước khi chạy: sửa mốc giờ ở dòng "since" (giờ Việt Nam, +07) = lúc bắt đầu bước kiểm.
-- Kết quả không chứa nội dung khách (chỉ mã khách, tên cột, số đếm) → Export CSV gửi agent được.
--
-- Mức:
--   ✗ XOÁ CỨNG       : khách bị xoá khỏi bảng customers (v2 không được xoá cứng).
--   ✗ MẤT PHẦN TỬ    : phần tử cũ trong mảng lịch sử (cuộc gọi, việc, ghi chú…) không còn trong hàng hiện tại.
--   ✗ MẤT THUỘC TÍNH : phần tử còn nhưng mất thuộc tính cũ (vd. thuộc tính lạ do v1/bản khác ghi).
--   ⚠ TRƯỜNG BỊ XOÁ  : trường trước có giá trị, nay trống — xem có phải người dùng cố ý không.
--   · ĐỔI GIÁ TRỊ    : có đổi giá trị (bình thường khi người dùng sửa; KHÔNG được có ở bước "mở + lưu không sửa").
-- Dòng "TÓM TẮT" luôn có, kể cả khi không có thay đổi nào.

with p as (
  select timestamptz '2026-10-17 00:00:00+07' as since          -- ← SỬA MỐC GIỜ Ở ĐÂY
),
ch as (
  select cc.*
  from public.customer_changes cc, p
  where cc.changed_at >= p.since
),
arr_keys(k) as (
  values ('call_attempts'), ('next_tasks'), ('notes_manual'), ('care_stage_history'),
         ('interactions'), ('interests'), ('household')
),
cur as (
  select x.id, to_jsonb(x) as j from public.customers x
),
-- phần tử cũ của các mảng bị đổi, kèm mảng hiện tại
old_el as (
  select ch.id as change_id, ch.customer_id, ch.changed_at, a.k, e.el,
    case when jsonb_typeof(cur.j -> a.k) = 'array' then cur.j -> a.k else '[]'::jsonb end as now_arr
  from ch
  join arr_keys a on a.k = any (ch.new_keys)
  join cur on cur.id = ch.customer_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(ch.old -> a.k) = 'array' then ch.old -> a.k else '[]'::jsonb end) e(el)
  where ch.op = 'UPDATE'
),
-- khớp phần tử theo id (interests/household) hoặc at (các mảng lịch sử)
matched as (
  select o.*,
    (select f.el from jsonb_array_elements(o.now_arr) f(el)
      where coalesce(f.el ->> 'id', f.el ->> 'at') = coalesce(o.el ->> 'id', o.el ->> 'at')
      limit 1) as now_el
  from old_el o
  where jsonb_typeof(o.el) = 'object'
),
findings as (
  select 1 as rank, '✗ XOÁ CỨNG' as muc, ch.customer_id, ''::text as cot, ch.changed_at, 1::bigint as so
  from ch where ch.op = 'DELETE'

  union all
  select 2, '✗ MẤT PHẦN TỬ', customer_id, k, max(changed_at), count(*)
  from matched where now_el is null
  group by customer_id, k

  union all
  select 3, '✗ MẤT THUỘC TÍNH', customer_id,
    k || ': ' || string_agg(distinct missing, ', '), max(changed_at), count(*)
  from matched m
  cross join lateral jsonb_object_keys(m.el) missing
  where m.now_el is not null and not (m.now_el ? missing)
  group by customer_id, k

  union all
  select 4, '⚠ TRƯỜNG BỊ XOÁ', ch.customer_id, kk, max(ch.changed_at), count(*)
  from ch
  cross join lateral unnest(ch.new_keys) kk
  join cur on cur.id = ch.customer_id
  where ch.op = 'UPDATE'
    and coalesce(ch.old -> kk, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb)
    and coalesce(cur.j -> kk, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb)
  group by ch.customer_id, kk

  union all
  select 5, '· ĐỔI GIÁ TRỊ', ch.customer_id, kk, max(ch.changed_at), count(*)
  from ch
  cross join lateral unnest(ch.new_keys) kk
  where ch.op = 'UPDATE'
  group by ch.customer_id, kk
)
select "mức", "mã khách", "cột / chi tiết", "lúc", "số lần"
from (
  select 0 as rank, 'TÓM TẮT' as "mức",
    null::uuid as "mã khách",
    'từ ' || to_char((select since from p) at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') ||
    ' · thay đổi: ' || (select count(*) from ch) ||
    ' · khách bị đổi: ' || (select count(distinct customer_id) from ch) ||
    ' · lỗi ✗: ' || (select count(*) from findings where rank <= 3) ||
    ' · cảnh báo ⚠: ' || (select count(*) from findings where rank = 4) as "cột / chi tiết",
    null::text as "lúc",
    null::bigint as "số lần"
  union all
  select rank, muc, customer_id, cot, to_char(changed_at at time zone 'Asia/Ho_Chi_Minh', 'MM-DD HH24:MI:SS'), so
  from findings
) r
order by rank, "mã khách", "cột / chi tiết";
