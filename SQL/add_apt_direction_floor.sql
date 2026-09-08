-- Migration: thêm "Hướng căn" + "Tầng" cho phần căn hộ quan tâm (bảng customers)
--
-- 1) apt_direction: hướng căn hộ (text). Nhập qua dropdown 8 hướng ở client
--    (Đông/Tây/Nam/Bắc/Đông Bắc/Đông Nam/Tây Bắc/Tây Nam). Nullable. Không đặt check
--    ở DB để linh hoạt nếu sau này đổi/bổ sung lựa chọn.
-- 2) apt_floor: số tầng căn hộ (số nguyên). Nullable (thu thập dần).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu khách sẽ báo
-- "column ... does not exist" và kẹt hàng đợi đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.customers
  add column if not exists apt_direction text,
  add column if not exists apt_floor integer;
