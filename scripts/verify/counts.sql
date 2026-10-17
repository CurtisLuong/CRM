-- scripts/verify/counts.sql — số liệu + "vân tay" dữ liệu khách để kiểm chứng v2 (T5.2).
-- CHỈ ĐỌC. Chạy ở Supabase › SQL Editor của project STAGING (mksjmpcsfawsiabfhoxe), trước và sau mỗi bước kiểm.
-- Kết quả không chứa tên/SĐT khách (chỉ số đếm, mã băm, tên người phụ trách) → Export CSV gửi agent được.
--
-- Cột "van_tay": md5 nội dung. Hai lần chạy cùng van_tay = dữ liệu khách KHÔNG đổi giá trị.
--   - "vân tay khách (bỏ updated_at)": bỏ qua updated_at/updated_by → mở + lưu không sửa phải giữ nguyên dòng này.
--   - Dùng to_jsonb nên chạy được cả khi chưa có cột v2 (archived_at, interactions…).

with base as (
  select x.id, x.owner_id, to_jsonb(x) as j
  from public.customers x
),
c as (
  select id, owner_id, j,
    case when jsonb_typeof(j -> 'next_tasks')         = 'array' then j -> 'next_tasks'         else '[]'::jsonb end as tasks,
    case when jsonb_typeof(j -> 'call_attempts')      = 'array' then j -> 'call_attempts'      else '[]'::jsonb end as calls,
    case when jsonb_typeof(j -> 'notes_manual')       = 'array' then j -> 'notes_manual'       else '[]'::jsonb end as notes,
    case when jsonb_typeof(j -> 'care_stage_history') = 'array' then j -> 'care_stage_history' else '[]'::jsonb end as hist,
    case when jsonb_typeof(j -> 'interactions')       = 'array' then j -> 'interactions'       else '[]'::jsonb end as inter
  from base
),
per_owner as (
  select c.owner_id,
    count(*)                                                                         as khach,
    count(*) filter (where c.j ->> 'archived_at' is null)                             as khach_dang_dung,
    count(*) filter (where c.j ->> 'archived_at' is not null)                         as khach_luu_tru,
    count(*) filter (where c.j ->> 'qualified_at' is null
                       and c.j ->> 'disqualified_at' is null
                       and c.j ->> 'archived_at' is null)                             as khach_moi,
    coalesce(sum(jsonb_array_length(c.tasks)), 0)                                     as viec,
    coalesce(sum((select count(*) from jsonb_array_elements(c.tasks) t where t ->> 'done_at' is null)), 0) as viec_mo,
    coalesce(sum(jsonb_array_length(c.calls)), 0)                                     as cuoc_goi,
    coalesce(sum((select count(*) from jsonb_array_elements(c.calls) t where t ->> 'result' is null)), 0) as cuoc_goi_chua_ghi,
    coalesce(sum(jsonb_array_length(c.notes)), 0)                                     as ghi_chu,
    count(*) filter (where coalesce(c.j ->> 'notes', '') <> '')                       as khach_co_ghi_chu_dang_ky,
    coalesce(sum(jsonb_array_length(c.hist)), 0)                                      as moc_lich_su_bac,
    coalesce(sum(jsonb_array_length(c.inter)), 0)                                     as tuong_tac_khac
  from c
  group by c.owner_id
),
rows_ as (
  -- Tổng toàn DB
  select 1 as thu_tu, 'TỔNG' as nguoi, k as muc, v as so, null::text as van_tay
  from (
    select sum(khach) a, sum(khach_dang_dung) b, sum(khach_luu_tru) bb, sum(khach_moi) b2, sum(viec) c1, sum(viec_mo) d,
           sum(cuoc_goi) e, sum(cuoc_goi_chua_ghi) f, sum(ghi_chu) g, sum(khach_co_ghi_chu_dang_ky) h,
           sum(moc_lich_su_bac) i, sum(tuong_tac_khac) l
    from per_owner
  ) s,
  lateral (values
    ('01 khách (tổng)', a), ('02 khách đang dùng', b), ('03 khách đã lưu trữ', bb), ('04 khách mới (chưa phân loại)', b2),
    ('05 việc (tổng)', c1), ('06 việc đang mở', d),
    ('07 cuộc gọi (tổng)', e), ('08 cuộc gọi chưa ghi kết quả', f),
    ('09 ghi chú hồ sơ', g), ('10 khách có ghi chú đăng ký', h),
    ('11 mốc lịch sử bậc', i), ('12 tương tác ngoài cuộc gọi', l)
  ) v(k, v)

  union all
  -- Theo người phụ trách (để so với số v2 hiện khi đăng nhập từng tài khoản)
  select 2, coalesce(p.full_name, '(không tên)') || ' · ' || left(o.owner_id::text, 8), k, v, null
  from per_owner o
  left join public.profiles p on p.id = o.owner_id,
  lateral (values
    ('01 khách (tổng)', o.khach), ('02 khách đang dùng', o.khach_dang_dung), ('04 khách mới (chưa phân loại)', o.khach_moi),
    ('06 việc đang mở', o.viec_mo), ('07 cuộc gọi (tổng)', o.cuoc_goi), ('09 ghi chú hồ sơ', o.ghi_chu)
  ) v(k, v)

  union all
  -- Bảng liên quan
  select 3, 'TỔNG', '20 tài liệu (documents)', (select count(*) from public.documents), null
  union all
  select 3, 'TỔNG', '21 nhật ký thay đổi (customer_changes)', (select count(*) from public.customer_changes), null
  union all
  select 3, 'TỔNG', '22 lead Facebook (fb_leads)', (select count(*) from public.fb_leads), null

  union all
  -- Vân tay
  select 4, 'TỔNG', '30 vân tay khách (bỏ updated_at)', count(*),
    md5(coalesce(string_agg((j - 'updated_at' - 'updated_by')::text, E'\n' order by id), ''))
  from base
  union all
  select 4, 'TỔNG', '31 vân tay khách (đầy đủ)', count(*),
    md5(coalesce(string_agg(j::text, E'\n' order by id), ''))
  from base
  union all
  select 4, 'TỔNG', '32 vân tay tài liệu', count(*),
    md5(coalesce(string_agg(to_jsonb(d)::text, E'\n' order by d.id), ''))
  from public.documents d
)
select nguoi as "người", muc as "mục", so as "số", coalesce(van_tay, '') as "vân tay"
from rows_
order by thu_tu, nguoi, muc;
