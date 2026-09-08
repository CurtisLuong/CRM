-- Migration: thêm cột registered_at (thời gian đăng ký của khách)
--
-- Khi tạo khách, người dùng nhập giờ + ngày đăng ký; nếu bỏ trống thì lấy thời
-- điểm tạo (created_at). Sửa lại được sau. Dùng làm mốc "Bắt đầu đăng ký" ở đầu
-- timeline lịch sử chăm sóc.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.

alter table public.customers
  add column if not exists registered_at timestamptz;

-- Khách đã có sẵn: lấy created_at làm mốc đăng ký ban đầu.
update public.customers
  set registered_at = created_at
  where registered_at is null;
