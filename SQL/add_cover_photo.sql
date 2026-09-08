-- Migration: thêm ẢNH BÌA (cover photo) cho khách hàng
--
-- BỐI CẢNH: thêm cover photo kiểu Facebook cho trang chi tiết khách. Chỉ khách VIP mới
-- gắn ảnh riêng; khách còn lại dùng cover mặc định (vẽ bằng CSS, không cần ảnh).
--
-- LƯU TRỮ: TÁI DÙNG bucket PUBLIC 'customer-avatars' đã có (xem add_avatar_public_bucket.sql).
-- File cover đặt ở '<owner>/<customerId>/cover-<ts>.<ext>' — cùng thư mục owner nên các
-- RLS policy sẵn có của bucket đó (select/insert/update/delete giới hạn thư mục của mình)
-- ÁP DỤNG LUÔN cho cover. => KHÔNG cần tạo bucket mới, KHÔNG cần thêm policy.
--
-- Vì vậy migration này CHỈ thêm 1 cột text lưu đường dẫn file cover (nullable, mặc định
-- null = dùng cover mặc định). An toàn, không đụng dữ liệu cũ.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. Chạy lại nhiều lần vẫn an toàn.

alter table public.customers
  add column if not exists cover_path text;

comment on column public.customers.cover_path is
  'Đường dẫn file ảnh bìa trong bucket customer-avatars (cover-<ts>). null = dùng cover mặc định.';
