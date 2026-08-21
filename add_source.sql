-- Migration: thêm cột source (Nguồn khách) cho bảng customers.
--
-- Giá trị (text, không ràng buộc cứng để dễ mở rộng):
--   'manual'  — Quảng cáo, sale nhập tay
--   'ocr'     — Quảng cáo, tạo từ ảnh (OCR) — có tài liệu kind='reg_image'
--   'landing' — Lead từ landing page (kênh 3, để dành)
--
-- Nguồn do HỆ THỐNG tự set (app đặt khi tạo khách; landing page sẽ set 'landing').
-- User KHÔNG sửa được (không có ô này trong form).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới.

alter table public.customers
  add column if not exists source text;

-- Backfill khách CŨ (source đang trống):
--  - Có tài liệu reg_image  → 'ocr' (tạo từ ảnh)
--  - Không có               → 'manual' (nhập tay)
update public.customers c
  set source = case
    when exists (
      select 1 from public.documents d
      where d.customer_id = c.id and d.kind = 'reg_image'
    ) then 'ocr'
    else 'manual'
  end
  where c.source is null;
