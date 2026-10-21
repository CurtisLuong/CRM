-- ============================================================================
-- SQL/v2/008_fb_leads_service_grant.sql — Meta Lead Ads: cho Worker (service role) ghi nhật ký fb_leads.
-- Lỗi phát hiện sau deploy 2026-10-21: trên production, service_role chỉ có REFERENCES/TRIGGER/TRUNCATE trên
-- public.fb_leads (SQL/add_fb_leads.sql không cấp) → mọi lead báo "permission denied for table fb_leads",
-- nằm trong fb_lead_queue tự thử lại (không mất lead).
--
-- CHỈ THÊM quyền cho service_role (chỉ Worker dùng; không bao giờ ở app). Không đổi dữ liệu, RLS, policy.
-- Chạy lại nhiều lần được. Chạy trên PRODUCTION nrqccwamwctihivpxjww (staging mksjmpcsfawsiabfhoxe nếu dựng lại).
-- ============================================================================
grant select, insert, update on public.fb_leads to service_role;

-- Kiểm (mong đợi có INSERT, SELECT, UPDATE):
-- select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
--  where table_schema='public' and table_name='fb_leads' and grantee='service_role';
