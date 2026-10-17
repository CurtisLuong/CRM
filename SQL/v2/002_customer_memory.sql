-- ============================================================================
-- SQL/v2/002_customer_memory.sql — T2.A5 · D-012 · architecture.md §3.4
-- Cột mới trên public.customers cho v2: xoá mềm, tuỳ chọn liên hệ, nhu cầu theo đợt,
-- người cùng quyết định, tương tác ngoài cuộc gọi, lý do kết thúc, điều kiện retarget,
-- nguồn/độ mới của thông tin, khách giới thiệu.
--
-- CHỈ THÊM: mọi cột đều nullable (jsonb có default rỗng) → app v1 bỏ qua (đọc *, ghi patch),
-- khách cũ không bị sửa giá trị nào. Không drop/rename/đổi kiểu, không update dữ liệu.
-- Chạy được nhiều lần (idempotent). Thứ tự: backup → STAGING (+ tests/sql/002_005_v2.test.sql)
-- → chủ dự án chạy PRODUCTION. Chạy 002 → 003 → 004 → 005.
--
-- Thuộc tính mới trong phần tử JSONB next_tasks (side, due_original, snoozed_reason, source, key)
-- KHÔNG cần SQL: v1 giữ nguyên thuộc tính lạ khi ghi lại mảng (golden T0.4 'preservation').
-- ============================================================================

alter table public.customers add column if not exists archived_at   timestamptz;
alter table public.customers add column if not exists contact_prefs jsonb default '{}'::jsonb;
alter table public.customers add column if not exists interests     jsonb default '[]'::jsonb;
alter table public.customers add column if not exists household     jsonb default '[]'::jsonb;
alter table public.customers add column if not exists interactions  jsonb default '[]'::jsonb;
alter table public.customers add column if not exists close_reason  text;
alter table public.customers add column if not exists close_note    text;
alter table public.customers add column if not exists retarget_hint jsonb;
alter table public.customers add column if not exists field_meta    jsonb default '{}'::jsonb;
-- Không khoá ngoại: khách giới thiệu có thể thuộc sale khác (RLS không cho thấy) hoặc đã xoá.
alter table public.customers add column if not exists referred_by   uuid;

comment on column public.customers.archived_at   is 'v2 xoá mềm (F-14): có giá trị = đã lưu trữ, ẩn khỏi danh sách thường';
comment on column public.customers.contact_prefs is 'v2 {do_not_contact, dnc_reason, dnc_at, channel, slot, zalo_name, zalo_link}';
comment on column public.customers.interests     is 'v2 nhu cầu theo đợt [{id, project, apt_type, budget_max, purpose, timeline, status, reason, source, at, closed_at}]';
comment on column public.customers.household     is 'v2 người cùng quyết định [{id, name, role, phone, note, at}]';
comment on column public.customers.interactions  is 'v2 tương tác ngoài cuộc gọi [{at, channel, kind, note, template, campaign, by, origin}]';
comment on column public.customers.close_reason  is 'v2 mã lý do kết thúc lớp 2 (mã đã lưu bất biến)';
comment on column public.customers.close_note    is 'v2 ghi chú lý do kết thúc';
comment on column public.customers.retarget_hint is 'v2 điều kiện retarget {after, max_price, apt_types, projects, note}';
comment on column public.customers.field_meta    is 'v2 nguồn + độ mới thông tin {<field>: {at, by, confirmed}}';
comment on column public.customers.referred_by   is 'v2 id khách giới thiệu (không khoá ngoại)';

-- Kiểm tra nhanh sau khi chạy (mong đợi: cot_moi = 10):
-- select count(*) as cot_moi from information_schema.columns
--  where table_schema = 'public' and table_name = 'customers'
--    and column_name in ('archived_at','contact_prefs','interests','household','interactions',
--                        'close_reason','close_note','retarget_hint','field_meta','referred_by');
