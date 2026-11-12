-- ============================================================================
-- SQL/v2/016_bank_rates.sql — Lãi vay mua nhà của 10 ngân hàng (BR-01, Curtis duyệt 12/11/2026).
--
-- CHỈ THÊM (D-012/D-026): 1 bảng + 1 view + quyền đọc. Không đụng bảng khách.
-- Ghi: CHỈ Worker (service role) mỗi sáng, AI đọc trang ngân hàng + báo. App chỉ đọc.
-- Số anh tự sửa KHÔNG nằm ở đây: lưu theo người dùng ở user_settings.ui_state.bank_rate_overrides.
--
-- CÁCH CHẠY (Supabase → SQL Editor, dán cả file → Run):
--   STAGING mksjmpcsfawsiabfhoxe trước, kiểm app preview; rồi PRODUCTION nrqccwamwctihivpxjww.
-- Chạy lại được (if not exists / or replace).
-- Rollback: drop view public.bank_rates_latest; drop table public.bank_rates;
-- ============================================================================

create table if not exists public.bank_rates (
  id bigserial primary key,
  bank_code text not null,                 -- mã trong src/config/banks.ts: bidv, vietinbank, agribank, vietcombank, mb, techcombank, vpbank, hdbank, acb, sacombank
  promo_rate numeric(5, 2),                -- %/năm, lãi ưu đãi cố định
  promo_months integer,                    -- số tháng ưu đãi
  floating_rate numeric(5, 2),             -- %/năm, lãi thả nổi ước tính (= tham chiếu + biên độ nếu có)
  reference_rate numeric(5, 2),            -- %/năm, lãi tham chiếu/cơ sở nếu nguồn ghi
  margin numeric(5, 2),                    -- điểm %, biên độ nếu nguồn ghi
  source_kind text not null check (source_kind in ('bank', 'news')),
  source_url text not null,
  source_title text,
  published_on date,                       -- ngày đăng của nguồn (nếu đọc được)
  fetched_at timestamptz not null default now(),
  note text,                               -- ghi chú ngắn của AI (vd. "áp dụng khoản vay ≥ 1 tỷ")
  constraint bank_rates_promo_range check (promo_rate is null or promo_rate between 0 and 30),
  constraint bank_rates_floating_range check (floating_rate is null or floating_rate between 0 and 30)
);

create index if not exists bank_rates_bank_fetched_idx on public.bank_rates (bank_code, fetched_at desc);

alter table public.bank_rates enable row level security;
revoke all on table public.bank_rates from public, anon;
grant select on table public.bank_rates to authenticated;
drop policy if exists bank_rates_read on public.bank_rates;
create policy bank_rates_read on public.bank_rates for select to authenticated using (true);

-- Bản mới nhất của mỗi ngân hàng (app đọc view này).
create or replace view public.bank_rates_latest
with (security_invoker = true) as
select distinct on (bank_code) *
from public.bank_rates
order by bank_code, fetched_at desc;

revoke all on table public.bank_rates_latest from public, anon;
grant select on table public.bank_rates_latest to authenticated;
