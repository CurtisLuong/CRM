-- ============================================================================
-- SQL/v2/007_meta_lead_ads.sql — Meta (Facebook/Instagram) Lead Ads → CRM · D-001 · D-012
-- Hợp đồng cho Worker `worker/fb-leads.js` (task ML-01) và thẻ "Kết nối Facebook" ở Cài đặt (task ML-02).
-- Hướng dẫn thiết lập: docs/runbooks/meta-lead-ads.md
--
-- CHỈ THÊM: cột nullable trên fb_leads (bảng đã có từ SQL/add_fb_leads.sql), 2 bảng mới, 1 hàm, policy đọc.
-- Không drop/rename/đổi kiểu, không update/xoá dữ liệu. Chạy lại nhiều lần được (idempotent).
-- Thứ tự: backup (docs/runbooks/backup.md) → STAGING mksjmpcsfawsiabfhoxe → Curtis chạy PRODUCTION nrqccwamwctihivpxjww.
-- Cần có trước: SQL/add_fb_leads.sql, SQL/v2/001 (is_admin), SQL/v2/002 (customers.interactions).
-- Ghi: CHỈ Worker (service role). Người dùng app: chỉ ĐỌC (admin, hoặc người nhận lead = owner_id).
-- ============================================================================

-- 1) fb_leads (nhật ký kết quả mỗi lead): thêm thông tin quảng cáo + người nhận + SĐT đã chuẩn hoá.
alter table public.fb_leads add column if not exists owner_id    uuid;        -- FB_LEAD_OWNER_ID lúc ghi
alter table public.fb_leads add column if not exists phone       text;        -- SĐT đã chuẩn hoá (để tra cứu)
alter table public.fb_leads add column if not exists campaign_id text;
alter table public.fb_leads add column if not exists adset_id    text;
alter table public.fb_leads add column if not exists adset_name  text;
alter table public.fb_leads add column if not exists ad_name     text;
alter table public.fb_leads add column if not exists platform    text;        -- 'fb' | 'ig' (Meta trả về)
alter table public.fb_leads add column if not exists is_organic  boolean;
alter table public.fb_leads add column if not exists updated_at  timestamptz default now();

-- Người nhận lead xem được nhật ký lead của mình (policy admin cũ giữ nguyên).
drop policy if exists "fb_leads_select_owner" on public.fb_leads;
create policy "fb_leads_select_owner" on public.fb_leads for select using (owner_id = auth.uid());

-- 2) Hàng chờ xử lý lead — KHÔNG mất lead: mọi mã lead nhận được (webhook / quét / kéo bù / Make)
--    vào đây TRƯỚC, rồi mới lấy chi tiết + ghi khách. Lỗi → thử lại theo next_attempt_at.
--    done_at có giá trị = xong (khách đã tạo/gộp, hoặc lỗi không thể tự sửa đã ghi fb_leads).
--    next_attempt_at trống + done_at trống = dừng tự thử, cần người xử lý (xem runbook).
--    Không xoá dòng (D-012): dòng xong giữ lại làm vết.
create table if not exists public.fb_lead_queue (
  lead_id         text primary key,                 -- leadgen_id của Meta
  page_id         text,
  form_id         text,
  owner_id        uuid,                             -- FB_LEAD_OWNER_ID lúc nhận
  via             text not null check (via in ('webhook', 'poll', 'backfill', 'manual')),
  payload         jsonb not null default '{}'::jsonb, -- webhook: change.value; manual: {lead: {...}} đủ dữ liệu, không cần gọi Graph
  attempts        int not null default 0,
  next_attempt_at timestamptz default now(),
  last_error      text,
  done_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists fb_lead_queue_due_idx on public.fb_lead_queue (next_attempt_at) where done_at is null;

alter table public.fb_lead_queue enable row level security;
drop policy if exists "fb_lead_queue_select" on public.fb_lead_queue;
create policy "fb_lead_queue_select" on public.fb_lead_queue
  for select using (public.is_admin() or owner_id = auth.uid());
revoke all on public.fb_lead_queue from anon, authenticated;
grant select on public.fb_lead_queue to authenticated;
grant all on public.fb_lead_queue to service_role;

-- 3) Tình trạng kết nối (1 dòng / tích hợp) — Worker cập nhật sau mỗi lượt cron + kiểm token hằng ngày.
--    App đọc để hiện cảnh báo ở Cài đặt. message = câu tiếng Việt cho người dùng (không mã nội bộ).
create table if not exists public.integration_health (
  id               text primary key,                -- 'meta_lead_ads'
  owner_id         uuid,                            -- người nhận lead — được xem
  status           text not null check (status in ('ok', 'warning', 'error')),
  message          text,
  token_expires_at timestamptz,                     -- trống = token không hết hạn (hoặc chưa kiểm được — xem details)
  last_lead_at     timestamptz,                     -- lead gần nhất ghi vào CRM thành công
  last_webhook_at  timestamptz,                     -- lần gần nhất Meta gọi webhook hợp lệ
  pending_count    int not null default 0,          -- lead đang chờ / đang tự thử lại
  stuck_count      int not null default 0,          -- lead đã dừng tự thử, cần người xử lý
  details          jsonb not null default '{}'::jsonb, -- thông tin phụ cho kỹ thuật (scopes thiếu, webhook đã đăng ký…)
  checked_at       timestamptz not null default now()
);

alter table public.integration_health enable row level security;
drop policy if exists "integration_health_select" on public.integration_health;
create policy "integration_health_select" on public.integration_health
  for select using (public.is_admin() or owner_id = auth.uid());
revoke all on public.integration_health from anon, authenticated;
grant select on public.integration_health to authenticated;
grant all on public.integration_health to service_role;

-- 4) Gắn lead vào khách ĐÃ CÓ (trùng SĐT) — một câu UPDATE nguyên tử, không ghi đè trường nào khác:
--    thêm 1 phần tử vào ĐẦU customers.interactions (giữ nguyên các phần tử cũ) và thêm 'facebook_ads'
--    vào source nếu chưa có (source không phải mảng → để nguyên). Cùng lead_id đã gắn → không gắn lại.
--    Trả 'attached' | 'already' | 'not_found'.
create or replace function public.fb_attach_lead(p_customer_id uuid, p_interaction jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  if p_interaction is null or coalesce(p_interaction->>'lead_id', '') = '' then
    raise exception 'fb_attach_lead: thiếu lead_id';
  end if;
  update public.customers c
     set interactions = jsonb_build_array(p_interaction) || coalesce(c.interactions, '[]'::jsonb),
         source = case
           when jsonb_typeof(coalesce(c.source, '[]'::jsonb)) <> 'array' then c.source
           when coalesce(c.source, '[]'::jsonb) ? 'facebook_ads' then c.source
           else coalesce(c.source, '[]'::jsonb) || '["facebook_ads"]'::jsonb
         end
   where c.id = p_customer_id
     and not exists (
       select 1 from jsonb_array_elements(coalesce(c.interactions, '[]'::jsonb)) e
        where e->>'lead_id' = p_interaction->>'lead_id'
     );
  get diagnostics n = row_count;
  if n > 0 then return 'attached'; end if;
  if exists (select 1 from public.customers where id = p_customer_id) then return 'already'; end if;
  return 'not_found';
end;
$$;
revoke all on function public.fb_attach_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fb_attach_lead(uuid, jsonb) to service_role;

-- Kiểm tra nhanh sau khi chạy (mong đợi: 2 bảng mới, 9 cột mới trên fb_leads, 1 hàm):
-- select table_name from information_schema.tables where table_schema='public' and table_name in ('fb_lead_queue','integration_health');
-- select count(*) from information_schema.columns where table_schema='public' and table_name='fb_leads'
--   and column_name in ('owner_id','phone','campaign_id','adset_id','adset_name','ad_name','platform','is_organic','updated_at');
-- select proname from pg_proc where proname = 'fb_attach_lead';
--
-- Rollback (chỉ khi cần, sau backup — KHÔNG mất khách vì không bảng khách nào bị đổi cấu trúc):
--   drop function if exists public.fb_attach_lead(uuid, jsonb);
--   (bảng fb_lead_queue / integration_health và cột mới của fb_leads để nguyên — app cũ bỏ qua.)
