-- Mức quan tâm MẶC ĐỊNH của khách mới = 20% (yêu cầu 2026-10-07).
--
-- App (form, nhập Excel) đã tự ghi 20 (INTEREST_DEFAULT_NEW trong js/app.js). File này đặt
-- DEFAULT cho cột để lead do landing page ghi thẳng vào DB (API không gửi interest_level)
-- cũng nhận 20 thay vì để trống.
--
-- Cách chạy: Supabase → SQL Editor → dán PHẦN 1 → Run. An toàn chạy lại nhiều lần.

-- ---- PHẦN 1: default cho khách tạo từ nay ----
alter table public.customers alter column interest_level set default 20;

-- ---- PHẦN 2 (TUỲ CHỌN): đưa lead ĐANG CÓ ở tab Khách mới về 20% ----
-- Chỉ lead chưa Đạt (qualified_at trống) đang để trống hoặc đúng 50% (mặc định cũ).
-- Không đụng khách Tiềm năng. Muốn áp dụng thì bỏ dấu "--" ở 3 dòng dưới rồi Run.
-- update public.customers set interest_level = 20
-- where qualified_at is null
--   and (interest_level is null or interest_level = 50);
