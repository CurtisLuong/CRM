-- Migration: CHUẨN HOÁ SỐ ĐIỆN THOẠI đang có trên DB cho khớp quy tắc client
-- (normalizePhoneVN trong js/app.js): bỏ dấu cách/chấm/gạch, "+84..."/"84..(11 số)" → "0...",
-- thiếu "0" đầu (và chưa đủ 10 số) → thêm "0". Giá trị cuối KHÔNG có dấu cách.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
--
-- ⚠️ AN TOÀN VỚI UNIQUE (phone, owner_id): nếu 2 số cũ khi chuẩn hoá lại THÀNH GIỐNG NHAU
-- (vd "0123 456 789" và "0123456789"), migration này sẽ KHÔNG tự sửa/gộp/xoá 2 dòng đó —
-- chỉ LIỆT KÊ ở cuối để bạn xử tay. Các số không bị đụng vẫn được chuẩn hoá bình thường.

-- 1) Hàm chuẩn hoá (khớp đúng logic normalizePhoneVN ở client).
create or replace function public.normalize_phone_vn(raw text)
returns text language plpgsql immutable as $$
declare p text;
begin
  if raw is null then return null; end if;
  p := regexp_replace(raw, '[^0-9+]', '', 'g');       -- giữ chữ số và dấu +
  if left(p, 3) = '+84' then p := '0' || substr(p, 4); end if;  -- +84... → 0...
  p := regexp_replace(p, '[^0-9]', '', 'g');          -- bỏ nốt dấu + còn sót
  if left(p, 2) = '84' and length(p) = 11 then p := '0' || substr(p, 3); end if; -- 84..(11) → 0
  if left(p, 1) <> '0' and length(p) < 10 then p := '0' || p; end if;            -- thiếu 0 đầu
  return p;
end;
$$;

-- 2) Cập nhật các số KHÔNG bị đụng nhau sau chuẩn hoá (an toàn với unique index).
with n as (
  select id, owner_id, phone, public.normalize_phone_vn(phone) as np
  from public.customers
),
collide as ( -- (owner_id, np) mà có >1 dòng → đụng nhau → BỎ QUA để không vỡ unique
  select owner_id, np from n group by owner_id, np having count(*) > 1
)
update public.customers c
   set phone = n.np
  from n
 where c.id = n.id
   and n.np is distinct from c.phone
   and not exists (select 1 from collide k where k.owner_id = n.owner_id and k.np = n.np);

-- 3) LIỆT KÊ các số bị đụng nhau (nếu có) để bạn xử tay (gộp/sửa/xoá bản dư).
--    Kết quả rỗng = không có xung đột, đã chuẩn hoá xong toàn bộ.
select owner_id,
       public.normalize_phone_vn(phone) as so_sau_chuan_hoa,
       count(*)            as so_ban_trung,
       array_agg(phone)    as cac_so_goc,
       array_agg(id)       as cac_id
  from public.customers
 group by owner_id, public.normalize_phone_vn(phone)
having count(*) > 1;
