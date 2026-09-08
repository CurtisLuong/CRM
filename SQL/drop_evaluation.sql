-- Migration: BỎ thuộc tính đánh giá (evaluation / evaluation_reason)
--
-- App không còn dùng 2 cột này (đã gỡ khỏi form, card, chi tiết, dashboard). File này
-- XOÁ HẲN 2 cột khỏi DB cho sạch.
--
-- ⚠️ THAO TÁC NÀY XOÁ DỮ LIỆU: mọi giá trị 'nên chăm'/'không nên chăm' + lý do sẽ mất
-- vĩnh viễn. Dự án hiện gần như chưa có dữ liệu thật nên thường không ảnh hưởng. Nếu bạn
-- muốn GIỮ lại dữ liệu cũ thì ĐỪNG chạy file này — cứ để cột nằm đó (app vẫn chạy bình
-- thường, chỉ không đọc/ghi nữa).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- Nên chạy SAU/NGAY KHI deploy code mới (code mới không còn gửi 2 field này).

-- Xoá index trước (drop column cũng tự xoá index, nhưng nêu rõ cho tường minh).
drop index if exists public.customers_evaluation_idx;

-- Xoá cột (kèm CHECK constraint của evaluation sẽ tự mất theo cột).
alter table public.customers
  drop column if exists evaluation,
  drop column if exists evaluation_reason;
