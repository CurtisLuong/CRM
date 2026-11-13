-- ============================================================================
-- SQL/v2/017_bank_rates_deposit.sql — Lãi gửi tiết kiệm 12 tháng (Curtis 12/11/2026).
--
-- CHỈ THÊM (D-012/D-026): 2 cột mới có mặc định; view chỉ thêm khoá tách loại.
-- Một dòng = một nguồn, một loại: kind 'loan' (vay mua nhà, như 016) hoặc 'deposit' (gửi 12 tháng).
-- Dòng cũ của 016 tự là 'loan'. View lấy bản mới nhất theo (ngân hàng, loại) để bài
-- chỉ có lãi gửi không che mất lãi vay và ngược lại.
--
-- CÁCH CHẠY: Supabase → SQL Editor, dán cả file → Run. Chạy sau 016.
--   PRODUCTION nrqccwamwctihivpxjww (Worker đang ghi production); staging mksjmpcsfawsiabfhoxe nếu muốn thử.
-- Chạy lại được. Rollback: drop view bank_rates_latest; chạy lại phần view của 016;
--   alter table bank_rates drop column deposit_rate, drop column kind;
-- ============================================================================

alter table public.bank_rates add column if not exists kind text not null default 'loan';
alter table public.bank_rates add column if not exists deposit_rate numeric(5, 2);  -- %/năm, gửi tiết kiệm kỳ hạn 12 tháng

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bank_rates_kind_check') then
    alter table public.bank_rates add constraint bank_rates_kind_check check (kind in ('loan', 'deposit'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bank_rates_deposit_range') then
    alter table public.bank_rates add constraint bank_rates_deposit_range check (deposit_rate is null or deposit_rate between 0 and 30);
  end if;
end $$;

create index if not exists bank_rates_bank_kind_fetched_idx on public.bank_rates (bank_code, kind, fetched_at desc);

-- Bản mới nhất theo (ngân hàng, loại). Cột mới nằm cuối (select *), cột cũ giữ nguyên thứ tự.
create or replace view public.bank_rates_latest
with (security_invoker = true) as
select distinct on (bank_code, kind) *
from public.bank_rates
order by bank_code, kind, fetched_at desc;

revoke all on table public.bank_rates_latest from public, anon;
grant select on table public.bank_rates_latest to authenticated, service_role;
