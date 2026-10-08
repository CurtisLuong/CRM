-- Migration: NHẬT KÝ LEAD FACEBOOK LEAD ADS (bảng fb_leads) — 2026-10-08
--
-- Worker (worker/fb-leads.js) ghi lead Facebook thẳng vào customers bằng service role, và ghi 1 dòng
-- vào fb_leads cho MỖI lead nhận được (kể cả lỗi) để:
--   • chống trùng: webhook + cron quét có thể thấy cùng 1 lead nhiều lần → lead_id đã có thì bỏ qua;
--   • không mất lead: lỗi (thiếu SĐT, sai cấu hình…) vẫn giữ nguyên dữ liệu gốc (raw) để xử lý tay.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- Chỉ Worker (service role, bỏ qua RLS) ghi. Trưởng nhóm (admin) được XEM để kiểm tra.

create table if not exists public.fb_leads (
  lead_id       text primary key,          -- mã lead của Facebook
  page_id       text,
  form_id       text,
  form_name     text,
  ad_id         text,
  campaign_name text,
  created_time  timestamptz,               -- lúc khách gửi form
  customer_id   uuid references public.customers(id) on delete set null,
  status        text not null check (status in ('created', 'merged', 'error')),
  error         text,
  via           text,                      -- 'webhook' | 'poll' | 'manual'
  raw           jsonb,                     -- dữ liệu gốc Facebook trả về
  received_at   timestamptz not null default now()
);
create index if not exists fb_leads_received_idx on public.fb_leads (received_at desc);

alter table public.fb_leads enable row level security;
drop policy if exists "fb_leads_select_admin" on public.fb_leads;
create policy "fb_leads_select_admin" on public.fb_leads for select using (public.is_admin());
revoke all on public.fb_leads from anon, authenticated;
grant select on public.fb_leads to authenticated;

-- Xem nhanh 20 lead gần nhất (chạy trong SQL Editor):
-- select received_at, status, via, form_name, raw->'field_data' as answers, error from public.fb_leads order by received_at desc limit 20;
