-- Migration: đổi cột "source" (Nguồn khách) từ 1 giá trị (text) → NHIỀU giá trị (jsonb mảng).
--
-- Vì sao: 1 khách có thể đến từ nhiều nguồn (vd vừa Quảng cáo, vừa Landing page). Khi tạo
-- khách trùng SĐT+tên nhưng KHÁC nhóm nguồn, app sẽ BỔ SUNG nguồn vào khách cũ thay vì tạo
-- bản trùng (xem handleFormSubmit trong js/app.js).
--
-- Giá trị gốc giữ nguyên: 'manual' | 'ocr' | 'landing' — nay nằm trong mảng, vd ["ocr"],
-- ["manual","landing"]. Nhóm hiển thị: manual+ocr = "Quảng cáo", landing = "Landing page".
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run.
-- ⚠️ THỨ TỰ QUAN TRỌNG: chạy migration NÀY *TRƯỚC* khi deploy code js/app.js mới. Code mới
-- ghi source dạng MẢNG; nếu cột vẫn là text, thao tác lưu sẽ lỗi và kẹt hàng đợi đồng bộ.

alter table public.customers alter column source drop default;

alter table public.customers
  alter column source type jsonb
  using case
    when source is null or source = '' then '[]'::jsonb
    else jsonb_build_array(source)        -- 'ocr' → ["ocr"]
  end;

update public.customers set source = '[]'::jsonb where source is null;

alter table public.customers alter column source set default '[]'::jsonb;
alter table public.customers alter column source set not null;
