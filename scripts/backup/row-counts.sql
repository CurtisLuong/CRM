-- scripts/backup/row-counts.sql — số dòng + "dấu vân tay" (md5 nội dung) từng bảng (T0.1).
-- Dùng để so production (lúc backup) với staging (sau khi khôi phục). Chỉ ĐỌC, không sửa gì.
-- Chạy bằng script (dump.sh / restore-staging.sh) hoặc dán vào Supabase › SQL Editor.
-- md5 tính trên to_jsonb của từng dòng, sắp xếp ổn định, múi giờ UTC → cùng dữ liệu = cùng md5.
set timezone = 'UTC';

with tbl as (
  select table_schema as s, table_name as t
  from information_schema.tables
  where table_type = 'BASE TABLE'
    and (table_schema = 'public'
         or (table_schema, table_name) in (('auth', 'users'), ('auth', 'identities')))
)
select s || '.' || t as "table",
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', s, t), false, true, '')))[1]::text::bigint as "rows",
  (xpath('/row/c/text()', query_to_xml(format(
     'select md5(coalesce(string_agg(x, %L order by x), %L)) as c from (select to_jsonb(r)::text as x from %I.%I r) q',
     E'\n', '', s, t), false, true, '')))[1]::text as "md5"
from tbl
union all
-- bucket: chỉ so id + public (created_at/owner của bucket staging luôn khác production).
select 'storage.buckets', count(*), md5(coalesce(string_agg(id || ':' || public::text, E'\n' order by id), ''))
from storage.buckets
union all
select 'storage.objects[' || bucket_id || ']', count(*),
  md5(coalesce(string_agg(name || ':' || coalesce(metadata ->> 'size', ''), E'\n' order by name), ''))
from storage.objects
group by bucket_id
order by 1;
