-- Production: nrqccwamwctihivpxjww. Chỉ chạy sau backup.
-- Lưu trữ mọi khách còn ở nhóm Khách mới, đăng ký đến hết 19/10/2026 giờ Việt Nam.
-- Giữ nguyên hồ sơ, lịch sử gọi, trạng thái Đã loại và các trường khác.
-- Kiểm đúng 159 dòng theo preview production ngày 23/10/2026; nếu số đổi thì hủy.
-- Rollback: dùng backup cùng ngày và nhật ký customer_changes để khôi phục
-- archived_at của đúng các id trong lần chạy này; không khôi phục cả bảng.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table archive_target on commit drop as
select id
from public.customers
where qualified_at is null
  and archived_at is null
  and coalesce(registered_at, created_at) < timestamptz '2026-10-20 00:00:00+07'
for update;

do $$
begin
  if (select count(*) from archive_target) <> 159 then
    raise exception 'Số khách thay đổi so với preview (mong đợi 159); đã hủy cập nhật';
  end if;
end;
$$;

update public.customers as c
set archived_at = transaction_timestamp()
from archive_target as t
where c.id = t.id and c.archived_at is null;

do $$
begin
  if (select count(*) from archive_target as t
      join public.customers as c on c.id = t.id
      where c.archived_at is not null) <> 159 then
    raise exception 'Số khách được lưu trữ không đủ 159; đã hủy cập nhật';
  end if;
end;
$$;

commit;
