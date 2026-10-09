-- Migration: phễu 5 stage + SLA (velocity) — D-008, 2026-10-09
--
-- 1) Bộ bậc mới: Đăng kí mới → Đang tiếp cận → Đang chăm sóc → Xem dự án → Booking & Làm hồ sơ
--    + ngoài phễu: 'Nuôi dài hạn' (rút khỏi phễu chính), 'Kí HĐMB' (milestone Đã mua), 'Loại'.
--    Gộp 2 bậc cũ 'Hỗ trợ hồ sơ' + 'Booking' → 'Booking & Làm hồ sơ'.
-- 2) Cột mới:
--    - booking_steps jsonb: mini-checklist bậc Booking & Làm hồ sơ, {mã bước: thời điểm tích}
--      (mã bước: VELOCITY_CONFIG.bookingSteps trong js/velocity.js).
--    - sla_anchor_at timestamptz: mốc đặt lại đồng hồ SLA (vd mở lại khách mới bị tự loại).
--
-- Lịch sử care_stage_history GIỮ NGUYÊN tên bậc cũ (đúng sự thật lúc đó); app tự quy đổi khi hiển thị.
-- Ràng buộc vẫn CHO PHÉP 2 tên cũ để bản app cũ còn thay đổi chờ đồng bộ không bị lỗi; app mới
-- luôn ghi tên mới.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC khi deploy code mới (code mới ghi 'Booking & Làm hồ sơ' / 'Nuôi dài hạn').

alter table public.customers
  add column if not exists booking_steps jsonb not null default '{}'::jsonb,
  add column if not exists sla_anchor_at timestamptz;

alter table public.customers
  drop constraint if exists customers_care_stage_check;

update public.customers
  set care_stage = 'Booking & Làm hồ sơ'
  where care_stage in ('Hỗ trợ hồ sơ', 'Booking');

alter table public.customers
  add constraint customers_care_stage_check check (care_stage in (
    'Đăng kí mới',
    'Đang tiếp cận',
    'Đang chăm sóc',
    'Xem dự án',
    'Booking & Làm hồ sơ',
    'Nuôi dài hạn',            -- rút khỏi phễu chính, hẹn 3–6 tháng
    'Kí HĐMB',                 -- milestone: Đã mua (deal won)
    'Loại',                    -- kết thúc, không chốt
    'Hỗ trợ hồ sơ', 'Booking'  -- tên cũ, chỉ để bản app cũ đồng bộ không lỗi
  ));
