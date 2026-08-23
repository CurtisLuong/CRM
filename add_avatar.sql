-- Migration: thêm ẢNH ĐẠI DIỆN (profile picture) cho khách.
--
-- avatar_path: đường dẫn file ảnh trong Storage bucket 'customer-docs' (CÙNG bucket với
-- tài liệu đính kèm), dạng '<owner_id>/<customer_id>/avatar-<timestamp>.jpg'. NULL = chưa có
-- ảnh → app hiển thị chữ cái đầu của TỪ CUỐI trong tên làm hình đại diện.
--
-- Vì sao lưu ĐƯỜNG DẪN trên bảng customers (không tạo dòng 'documents'): để record khách
-- (offline-first) biết ngay có avatar hay không mà không cần query bảng documents, và để
-- avatar KHÔNG lẫn vào danh sách tài liệu đính kèm. File ảnh vẫn nằm trong bucket của khách.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới; nếu không thao tác đổi avatar sẽ báo
-- "column avatar_path does not exist" và kẹt hàng đợi đồng bộ.

alter table public.customers
  add column if not exists avatar_path text;
