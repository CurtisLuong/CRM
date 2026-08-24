-- Migration: thêm "Tài chính" + "Mục đích" cho phần căn hộ quan tâm (bảng customers)
--
-- 1) finance: số tiền khách đang có sẵn (VNĐ). numeric như apt_price để dễ so sánh
--    với giá căn. Nullable (thu thập dần).
-- 2) purpose: mục đích mua nhà — 1 trong 3 giá trị cố định (Ở / Đầu tư / Cho tặng).
--    Nullable. Check ràng buộc giá trị như occupation.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu khách sẽ báo
-- "column ... does not exist" và kẹt hàng đợi đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.customers
  add column if not exists finance numeric,
  add column if not exists purpose text
    check (purpose in ('Ở','Đầu tư','Cho tặng'));
