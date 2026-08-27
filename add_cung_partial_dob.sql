-- Migration: NGÀY SINH partial (chỉ ngày+tháng) + thuộc tính CUNG
--
-- 1) dob: đổi kiểu date → TEXT để lưu được cả 2 dạng:
--       'YYYY-MM-DD'  = đủ ngày/tháng/năm
--       '--MM-DD'     = chỉ ngày+tháng (không năm) — chuẩn vCard/RFC 6350
--    (Cột 'date' không lưu được '--MM-DD' nên bắt buộc đổi sang text. Giá trị date cũ
--     tự chuyển thành 'YYYY-MM-DD' → KHÔNG mất dữ liệu.)
-- 2) cung: thêm cột text (cung hoàng đạo, tính sẵn ở client từ ngày+tháng; như 'menh').
--
-- Bảo mật/RLS: không đổi. Không cần GRANT lại (quyền bảng là table-level → cột mới tự có).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới — code mới có thể gửi dob = '--MM-DD',
-- cột kiểu 'date' sẽ báo lỗi và kẹt hàng đợi đồng bộ.

alter table public.customers
  alter column dob type text using dob::text;

alter table public.customers
  add column if not exists cung text;
