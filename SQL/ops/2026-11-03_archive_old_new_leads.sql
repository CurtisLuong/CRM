-- Production: nrqccwamwctihivpxjww. Chỉ chạy sau backup (docs/runbooks/backup.md).
-- Lưu trữ mọi khách còn ở mục Khách mới của tài khoản luongninja, đăng ký đến hết 01/11/2026
-- giờ Việt Nam (giữ lại khách đăng ký 02/11 và 03/11). Giống hệt bấm nút Lưu trữ: chỉ đặt archived_at;
-- hồ sơ, lịch sử gọi, trạng thái Đã loại và mọi trường khác giữ nguyên. Trigger tự ghi updated_at
-- (điện thoại tự nhận khi đồng bộ) và nhật ký customer_changes. Khách lưu trữ vẫn xem/mở lại được.
-- Tiền lệ: SQL/ops/2026-10-23_archive_old_new_leads.sql.
--
-- CÁCH CHẠY (Supabase → project nrqccwamwctihivpxjww → SQL Editor):
--   Bước 1: chạy riêng khối XEM TRƯỚC → ghi lại số ở cột so_khach.
--   Bước 2: trong khối LƯU TRỮ, thay cả 2 chỗ 0 (dòng có "MONG_DOI") bằng số đó → chạy khối LƯU TRỮ.
--           Số lệch (có lead mới/khách vừa được sửa) → tự huỷ, không đổi gì; chạy lại Bước 1.
--   Kết quả cuối hiện "moc_luu_tru" — giữ lại để hoàn tác nếu cần (khối HOÀN TÁC cuối file).

-- ===================== BƯỚC 1 — XEM TRƯỚC (chỉ đọc) =====================
select count(*) as so_khach,
       count(*) filter (where disqualified_at is not null) as trong_do_da_loai,
       count(*) filter (where jsonb_array_length(coalesce(call_attempts, '[]'::jsonb)) = 0) as trong_do_chua_goi,
       min(coalesce(registered_at, created_at) at time zone 'Asia/Ho_Chi_Minh') as dang_ky_som_nhat,
       max(coalesce(registered_at, created_at) at time zone 'Asia/Ho_Chi_Minh') as dang_ky_muon_nhat,
       (select count(*) from auth.users where email = 'luongninja@gmail.com') as tim_thay_tai_khoan -- phải = 1
from public.customers
where qualified_at is null
  and archived_at is null
  and owner_id = (select id from auth.users where email = 'luongninja@gmail.com')
  and coalesce(registered_at, created_at) < timestamptz '2026-11-02 00:00:00+07';


-- ===================== BƯỚC 2 — LƯU TRỮ =====================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table archive_target on commit drop as
select id
from public.customers
where qualified_at is null
  and archived_at is null
  and owner_id = (select id from auth.users where email = 'luongninja@gmail.com')
  and coalesce(registered_at, created_at) < timestamptz '2026-11-02 00:00:00+07'
for update;

do $$
begin
  if (select count(*) from archive_target) <> 0 then -- MONG_DOI: thay 0 bằng số ở Bước 1
    raise exception 'Số khách khác lúc xem trước — đã huỷ, chưa đổi gì. Chạy lại Bước 1.';
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
      where c.archived_at = transaction_timestamp()) <> 0 then -- MONG_DOI: thay 0 bằng số ở Bước 1
    raise exception 'Số khách được lưu trữ không đủ — đã huỷ, chưa đổi gì.';
  end if;
end;
$$;

select count(*) as da_luu_tru, transaction_timestamp()::text as moc_luu_tru
from public.customers where archived_at = transaction_timestamp();

commit;


-- ===================== HOÀN TÁC (chỉ khi cần) =====================
-- Thay MOC bằng giá trị moc_luu_tru ở Bước 2 (giữ dấu nháy). Chỉ mở lại đúng khách của lần chạy này;
-- khách đã bị lưu trữ/mở lại bằng tay sau đó không bị đụng.
-- update public.customers set archived_at = null where archived_at = timestamptz 'MOC';
