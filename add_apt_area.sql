-- Migration: thêm "Diện tích" cho phần căn hộ quan tâm (bảng customers)
--
-- apt_area: diện tích căn hộ (m²) — số thực nhỏ (vd 68.5). numeric để nhập số lẻ.
--   Nullable (thu thập dần). RÀNG BUỘC: nếu có giá trị thì phải DƯƠNG (> 0).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu khách sẽ báo
-- "column apt_area does not exist" và kẹt hàng đợi đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.customers
  add column if not exists apt_area numeric
    check (apt_area is null or apt_area > 0);
