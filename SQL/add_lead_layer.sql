-- Migration: LỚP KHÁCH MỚI (lead) + CHUẨN HOÁ NGUỒN KHÁCH.
--
-- 1) Hai lớp khách trên CÙNG bảng customers (xem docs/decisions.md 2026-10-06):
--    - Lớp 1 "Khách mới"   : qualified_at IS NULL — mới nhập (landing/quảng cáo/nhập tay),
--                             đang gọi xác nhận. Không hiện ở trang chủ.
--    - Lớp 2 "Chăm sóc"    : qualified_at có giá trị — đã gọi được + xác nhận quan tâm.
--    Lead bị loại ở lớp 1: disqualified_at + disqualify_reason (+ ghi chú) — vẫn giữ để
--    đánh giá ngược campaign / landing page.
--    call_attempts: nhật ký từng lần gọi ở lớp 1, mảng {at, result, note}.
--      result ∈ no_answer | unreachable | busy | talked | wrong_number
--
-- 2) Nguồn khách (source, jsonb mảng) — CHỈ chứa KÊNH khách đến từ đâu:
--      facebook_ads | website | referral   (sau này: google_ads, tiktok_ads, ...)
--    Cách nhập (tay / ảnh / Excel / API) tách sang cột intake_method:
--      manual | ocr | import | api
--    Tên chiến dịch: cột campaign (lead website dùng sẵn web_last_campaign nếu trống).
--    Giá trị cũ: 'manual','ocr' → facebook_ads (+ intake tương ứng); 'landing' → website.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. Chạy được nhiều lần (idempotent).
-- ⚠️ CHẠY TRƯỚC khi deploy code mới (code mới ghi các cột này; thiếu cột → kẹt hàng đợi).
-- Không cần sửa API landing page (Marquee_Homes/functions/api/lead.js): lead web vẫn ghi
-- source ["website"], qualified_at để trống → tự vào lớp Khách mới.

-- ---- 1) Cột mới ----
alter table public.customers
  add column if not exists qualified_at      timestamptz,
  add column if not exists disqualified_at   timestamptz,
  add column if not exists disqualify_reason text,
  add column if not exists disqualify_note   text,
  add column if not exists call_attempts     jsonb not null default '[]'::jsonb,
  add column if not exists intake_method     text,
  add column if not exists campaign          text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_intake_method_check') then
    alter table public.customers add constraint customers_intake_method_check
      check (intake_method is null or intake_method in ('manual','ocr','import','api'));
  end if;
end $$;

create index if not exists customers_qualified_at_idx on public.customers (qualified_at);

-- ---- 2) Backfill cách nhập TỪ giá trị source cũ (phải chạy TRƯỚC bước đổi source) ----
update public.customers set intake_method = case
    when source ? 'ocr'     then 'ocr'
    when source ? 'website' then 'api'
    when source ? 'landing' then 'api'
    else 'manual'
  end
where intake_method is null;

-- ---- 3) Đổi source sang mã kênh: manual/ocr → facebook_ads, landing → website ----
-- Trống → facebook_ads (mọi khách trước đây đều từ quảng cáo Facebook, theo xác nhận 2026-10-06).
update public.customers c set source = coalesce((
    select jsonb_agg(distinct m.v)
    from (
      select case e.v
               when 'manual'  then 'facebook_ads'
               when 'ocr'     then 'facebook_ads'
               when 'landing' then 'website'
               else e.v
             end as v
      from jsonb_array_elements_text(c.source) as e(v)
    ) m
  ), '["facebook_ads"]'::jsonb)
where c.source ?| array['manual','ocr','landing'] or c.source = '[]'::jsonb;

-- ---- 4) Xếp lớp cho khách đang có (chỉ khách chưa xếp lớp) ----
-- Đã vào phễu chăm sóc thật (bậc từ 'Đang chăm sóc' trở lên, hiện tại hoặc trong lịch sử)
-- → lớp 2. Còn lại ('Đăng kí mới', 'Đang tiếp cận', trống) → lớp 1.
update public.customers c
  set qualified_at = coalesce(c.care_stage_updated_at, c.updated_at, c.created_at)
where c.qualified_at is null
  and c.disqualified_at is null
  and (
    c.care_stage in ('Đang chăm sóc','Xem dự án','Hỗ trợ hồ sơ','Booking','Kí HĐMB')
    or (c.care_stage = 'Loại' and exists (
      select 1 from jsonb_array_elements(c.care_stage_history) h
      where h->>'stage' in ('Đang chăm sóc','Xem dự án','Hỗ trợ hồ sơ','Booking','Kí HĐMB')
    ))
  );

-- Khách 'Loại' khi CHƯA từng vào chăm sóc → lead bị loại ở lớp 1 (lý do cũ không rõ).
update public.customers c
  set disqualified_at   = coalesce(c.care_stage_updated_at, c.updated_at, c.created_at),
      disqualify_reason = 'khac',
      disqualify_note   = 'Loại từ trước khi có lớp Khách mới (dữ liệu cũ)'
where c.qualified_at is null
  and c.disqualified_at is null
  and c.care_stage = 'Loại';
