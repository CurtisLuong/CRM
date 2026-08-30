-- Migration: CHUẨN HOÁ loại căn (customers.apt_type) ở tầng Database
--
-- BỐI CẢNH: apt_type từng lưu với định dạng khác nhau cho CÙNG 1 loại, ví dụ
-- "2N+,2WC" (không dấu cách) vs "2N+, 2WC" (có dấu cách) → dashboard đếm thành 2 loại.
-- File này ghi đè các giá trị đó về đúng 1 dạng CHUẨN trong APT_TYPES của app:
--   1N-1WC · 1N+, 1WC · 2N-2WC · 2N+, 2WC · 3N-2WC
--
-- CÁCH KHỚP: bỏ mọi ký tự không phải [a-z0-9+] và không phân biệt hoa/thường, rồi so
-- với dạng chuẩn (giống hàm canonicalAptType() ở client). Giá trị "Khác" tự nhập không
-- khớp dạng chuẩn nào → GIỮ NGUYÊN (không đụng tới).
--
-- AN TOÀN:
--   • Chỉ đổi những dòng THỰC SỰ khác dạng chuẩn (đã canonical thì bỏ qua).
--   • Không đụng dòng apt_type = null hay giá trị "Khác" lạ.
--   • KHÔNG cần bump updated_at: client pull kiểu full-replace (localReplaceAll) nên sẽ
--     nhận giá trị chuẩn ở lần đồng bộ kế tiếp.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. Chạy lại nhiều lần vẫn an toàn
-- (idempotent). NÊN chạy bước XEM TRƯỚC bên dưới trước cho yên tâm.

-- ===== (Tuỳ chọn) XEM TRƯỚC những gì sẽ đổi — chỉ SELECT, không ghi gì =====
-- select c.id, c.apt_type as hien_tai, m.canon as se_thanh
-- from public.customers c
-- join (values
--   ('1n1wc','1N-1WC'), ('1n+1wc','1N+, 1WC'), ('2n2wc','2N-2WC'),
--   ('2n+2wc','2N+, 2WC'), ('3n2wc','3N-2WC')
-- ) as m(key, canon)
--   on regexp_replace(lower(c.apt_type), '[^a-z0-9+]', '', 'g') = m.key
-- where c.apt_type is not null and c.apt_type <> m.canon;

-- ===== CHUẨN HOÁ (UPDATE) =====
update public.customers c
set apt_type = m.canon
from (values
  ('1n1wc',  '1N-1WC'),
  ('1n+1wc', '1N+, 1WC'),
  ('2n2wc',  '2N-2WC'),
  ('2n+2wc', '2N+, 2WC'),
  ('3n2wc',  '3N-2WC')
) as m(key, canon)
where c.apt_type is not null
  and regexp_replace(lower(c.apt_type), '[^a-z0-9+]', '', 'g') = m.key
  and c.apt_type <> m.canon;
