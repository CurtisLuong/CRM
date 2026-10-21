-- ============================================================================
-- SQL/v2/009_lead_campaign_projects.sql — Quy tắc "tên chiến dịch quảng cáo → dự án" (Curtis duyệt 2026-10-21).
-- Người nhận lead tự sửa ở Cài đặt (task ML-04); Worker Meta Lead Ads đọc để tự điền customers.projects
-- cho khách MỚI của chiến dịch đó (task ML-03). project = tên dự án (khớp customers.projects / giỏ hàng projects.name).
--
-- CHỈ THÊM: 1 bảng mới. Xoá mềm bằng archived_at (D-012). Chạy lại được.
-- Chạy trên PRODUCTION nrqccwamwctihivpxjww (staging mksjmpcsfawsiabfhoxe nếu cần thử trước).
-- ============================================================================
create table if not exists public.lead_campaign_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id),
  campaign    text not null,                     -- tên chiến dịch Meta, đúng như customers.campaign
  project     text not null,                     -- tên dự án
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,                       -- xoá mềm: có giá trị = bỏ quy tắc
  unique (owner_id, campaign)
);

alter table public.lead_campaign_projects enable row level security;
drop policy if exists "lead_campaign_projects_select" on public.lead_campaign_projects;
create policy "lead_campaign_projects_select" on public.lead_campaign_projects
  for select using (owner_id = auth.uid() or public.is_admin());
drop policy if exists "lead_campaign_projects_insert" on public.lead_campaign_projects;
create policy "lead_campaign_projects_insert" on public.lead_campaign_projects
  for insert with check (owner_id = auth.uid());
drop policy if exists "lead_campaign_projects_update" on public.lead_campaign_projects;
create policy "lead_campaign_projects_update" on public.lead_campaign_projects
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.lead_campaign_projects from anon, authenticated;
grant select, insert, update on public.lead_campaign_projects to authenticated;
grant select on public.lead_campaign_projects to service_role;
