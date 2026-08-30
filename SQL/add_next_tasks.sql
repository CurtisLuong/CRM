-- Migration: thêm "việc tiếp theo" (danh sách to-do tự do) cho bảng customers
--
-- next_tasks: mảng JSON các việc cần làm cho khách này, mỗi phần tử {text, at}
--   (at = ISO timestamp lúc tạo, dùng làm id để sửa/xoá). Giữ thứ tự tạo (cũ → mới).
--   Hiển thị ở khu "Hành động tiếp theo" trang chi tiết KHI khách CHƯA có lịch gọi
--   (có lịch gọi thì lịch đó chính là next action). Đồng bộ offline-first như notes_manual.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu việc sẽ báo
-- "column next_tasks does not exist" và kẹt hàng đợi đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.customers
  add column if not exists next_tasks jsonb not null default '[]'::jsonb;
