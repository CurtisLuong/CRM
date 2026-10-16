-- ============================================================================
-- scripts/sql/inspect.sql — ĐỐI SOÁT SCHEMA PRODUCTION (T0.3). CHỈ ĐỌC, không sửa gì.
-- Chạy: Supabase › project production › SQL Editor › New query › dán cả file › Run.
-- Gửi kết quả cho agent: nút "Export" phía trên bảng kết quả › "Download CSV" (hoặc "Copy as markdown").
-- KHÔNG trả dữ liệu khách: chỉ cấu trúc (cột, ràng buộc, policy, trigger, hàm, quyền, bucket),
-- số đếm và TÊN khoá / mã giá trị trong JSONB (không có tên, SĐT, ghi chú).
-- Mục 0 "migration" tự kết luận từng file SQL/*.sql đã chạy hay chưa (true = có dấu hiệu đã chạy).
-- ============================================================================
with
cols as (
  select table_name as t, column_name as c, data_type, is_nullable, column_default
  from information_schema.columns where table_schema = 'public'
),
has as (
  select
    (select coalesce(jsonb_object_agg(t || '.' || c, true), '{}') from cols) as col,
    (select coalesce(jsonb_object_agg(tablename, true), '{}') from pg_tables where schemaname = 'public') as tbl,
    (select coalesce(jsonb_object_agg(p.proname, true), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as fn,
    (select coalesce(jsonb_object_agg(tgname, true), '{}') from pg_trigger where not tgisinternal) as trg,
    (select coalesce(jsonb_object_agg(id, true), '{}') from storage.buckets) as bucket,
    (select coalesce(jsonb_object_agg(schemaname || '.' || tablename, true), '{}') from pg_publication_tables where pubname = 'supabase_realtime') as rt,
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'customers_care_stage_check' and conrelid = 'public.customers'::regclass) as stage_check
),
mig(file, ran, note) as (
  select v.file, v.ran, v.note from has, lateral (values
    ('add_advanced.sql',                    (col ? 'customers.advanced'), ''),
    ('add_ai_settings.sql',                 (col ? 'user_settings.ai_settings'), ''),
    ('add_app_releases_bucket.sql',         (bucket ? 'app-releases'), ''),
    ('add_apt_area.sql',                    (col ? 'customers.apt_area'), ''),
    ('add_apt_direction_floor.sql',         (col ? 'customers.apt_direction' and col ? 'customers.apt_floor'), ''),
    ('add_apt_finance_purpose.sql',         (col ? 'customers.finance' and col ? 'customers.purpose'), ''),
    ('add_apt_types_by_project.sql',        (tbl ? 'project_apt_types' and tbl ? 'building_apt_types'), ''),
    ('add_avatar.sql',                      (col ? 'customers.avatar_path'), ''),
    ('add_avatar_public_bucket.sql',        (bucket ? 'customer-avatars'), ''),
    ('add_care_stage_history.sql',          (col ? 'customers.care_stage_history'), ''),
    ('add_care_stage_updated_at.sql',       (col ? 'customers.care_stage_updated_at'), ''),
    ('add_catalog_buildings.sql',           (tbl ? 'buildings' and col ? 'units.building_id'), ''),
    ('add_cover_photo.sql',                 (col ? 'customers.cover_path'), ''),
    ('add_cung_partial_dob.sql',            (col ? 'customers.cung'), ''),
    ('add_documents.sql',                   (tbl ? 'documents' and bucket ? 'customer-docs'), ''),
    ('add_fb_leads.sql',                    (tbl ? 'fb_leads'), ''),
    ('add_funnel_velocity.sql',             (col ? 'customers.booking_steps' and col ? 'customers.sla_anchor_at' and coalesce(stage_check like '%Booking & Làm hồ sơ%', false)), ''),
    ('add_lead_layer.sql',                  (col ? 'customers.qualified_at' and col ? 'customers.call_attempts' and col ? 'customers.intake_method'), ''),
    ('add_loan_module.sql',                 (tbl ? 'projects' and tbl ? 'units' and tbl ? 'bank_presets' and tbl ? 'loan_settings' and tbl ? 'loan_quotes'), ''),
    ('add_next_call_reason.sql',            (col ? 'customers.next_call_reason'), ''),
    ('add_next_tasks.sql',                  (col ? 'customers.next_tasks'), ''),
    ('add_notes_manual.sql',                (col ? 'customers.notes_manual'), ''),
    ('add_occupation_and_call_schedule.sql',(col ? 'customers.occupation' and col ? 'customers.next_call_at' and col ? 'customers.next_call_end'), ''),
    ('add_projects_and_apt_options.sql',    (tbl ? 'project_options' and col ? 'customers.projects'), ''),
    ('add_realtime_customers.sql',          (rt ? 'public.customers'), 'không có thì app vẫn đồng bộ bằng probe 15s/60s'),
    ('add_registered_at.sql',               (col ? 'customers.registered_at'), ''),
    ('add_source.sql',                      (col ? 'customers.source'), ''),
    ('add_team_assign.sql',                 (tbl ? 'team_members' and col ? 'customers.followers' and fn ? 'is_admin' and fn ? 'team_list' and trg ? 'customers_guard_assignment'), 'cần thêm bước đặt admin (huong-dan-nhom.md)'),
    ('add_zalo_greeting_settings.sql',      (tbl ? 'user_settings'), ''),
    ('add_zalo_templates.sql',              (col ? 'user_settings.zalo_templates'), ''),
    ('catalog_layers_v2.sql',               (fn ? 'building_allows_apt_type' and trg ? 'trg_units_check_apt_type'), ''),
    ('change_care_stages_and_contact_status.sql', (col ? 'customers.contact_status'), 'lịch sử'),
    ('drop_evaluation.sql',                 (not (col ? 'customers.evaluation')), 'lịch sử (xoá cột cũ) — KHÔNG chạy lại'),
    ('interest_default_20.sql',             (exists (select 1 from cols where t = 'customers' and c = 'interest_level' and column_default like '20%')), ''),
    ('normalize_apt_type_aliases.sql',      (fn ? 'canonical_apt_type'), ''),
    ('normalize_phones.sql',                (fn ? 'normalize_phone_vn'), ''),
    ('source_multi_value.sql',              (exists (select 1 from cols where t = 'customers' and c = 'source' and data_type = 'jsonb')), 'lịch sử (đổi kiểu) — KHÔNG chạy lại'),
    ('add_care_stage_ket_thuc.sql',         null::boolean, 'lịch sử: ràng buộc bậc đã thay bởi add_funnel_velocity — KHÔNG chạy lại'),
    ('rename_care_stage_khong_chot.sql',    null::boolean, 'lịch sử: đổi tên bậc cũ — KHÔNG chạy lại'),
    ('merge_project_trang_cat.sql',         null::boolean, 'chỉ dữ liệu (xem mục data)'),
    ('normalize_apt_type.sql',              null::boolean, 'chỉ dữ liệu — KHÔNG chạy lại'),
    ('seed_apt_types_vin_marquee.sql',      null::boolean, 'chỉ dữ liệu (xem mục data)'),
    ('v2/001_customer_audit.sql',           (tbl ? 'customer_changes' and trg ? 'customers_audit'), 'T0.2')
  ) v(file, ran, note)
),
-- Đọc khách qua to_jsonb → câu SQL vẫn chạy khi production THIẾU cột nào đó (chính là điều cần phát hiện).
cust as (select to_jsonb(c) as j from public.customers c),
arr as (  -- phần tử của các mảng JSONB (bỏ qua giá trị không phải mảng)
  select a.name, e
  from cust, lateral (values ('call_attempts'), ('next_tasks'), ('care_stage_history'), ('notes_manual')) a(name),
       jsonb_array_elements(case when jsonb_typeof(j -> a.name) = 'array' then j -> a.name else '[]' end) e
),
out(sec, ord, item, detail) as (
  -- 0) Kết luận migration
  select '0 migration', 0, file, case when ran is null then '—' when ran then 'ĐÃ CHẠY' else 'CHƯA CHẠY' end || coalesce(' · ' || nullif(note, ''), '') from mig
  -- 1) Cột
  union all select '1 column', 1, t || '.' || c, data_type || case when is_nullable = 'NO' then ' NOT NULL' else '' end || coalesce(' DEFAULT ' || column_default, '') from cols
  -- 2) Ràng buộc
  union all select '2 constraint', 2, conrelid::regclass::text || ' · ' || conname, pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  -- 3) Index
  union all select '3 index', 3, tablename || ' · ' || indexname, indexdef from pg_indexes where schemaname = 'public'
  -- 4) Policy (public + storage)
  union all select '4 policy', 4, schemaname || '.' || tablename || ' · ' || policyname,
    permissive || ' ' || cmd || ' to ' || array_to_string(roles, ',') || coalesce(' USING (' || qual || ')', '') || coalesce(' CHECK (' || with_check || ')', '')
    from pg_policies where schemaname in ('public', 'storage')
  -- 5) RLS bật/tắt
  union all select '5 rls', 5, relname, case when relrowsecurity then 'RLS on' else 'RLS OFF' end
    from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
  union all select '5 view', 5, c.relname, coalesce(array_to_string(c.reloptions, ','), 'KHÔNG security_invoker (view chạy quyền chủ view → bỏ qua RLS)')
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  -- 6) Trigger (public + auth.users)
  union all select '6 trigger', 6, tgrelid::regclass::text || ' · ' || tgname, pg_get_triggerdef(oid)
    from pg_trigger where not tgisinternal
      and (tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace) or tgrelid = 'auth.users'::regclass)
  -- 7) Hàm public (định nghĩa đầy đủ — là code, không phải dữ liệu)
  union all select '7 function', 7, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || case when p.prosecdef then ' SECURITY DEFINER' else '' end,
    pg_get_functiondef(p.oid)
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  -- 8) GRANT bảng cho role của API
  union all select '8 grant', 8, table_name || ' · ' || grantee, string_agg(privilege_type, ',' order by privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role') group by table_name, grantee
  -- 9) Bucket, realtime, extension
  union all select '9 bucket', 9, id, 'public=' || public || coalesce(' · limit=' || file_size_limit, '') || coalesce(' · mime=' || array_to_string(allowed_mime_types, ','), '') from storage.buckets
  union all select '9 realtime', 9, schemaname || '.' || tablename, pubname from pg_publication_tables where pubname = 'supabase_realtime'
  union all select '9 extension', 9, extname, extversion from pg_extension
  -- 10) Số dòng (không dữ liệu)
  union all select '10 rows', 10, s || '.' || t,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', s, t), false, true, '')))[1]::text
    from (select table_schema s, table_name t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') x
  union all select '10 rows', 10, 'storage.objects[' || bucket_id || ']', count(*)::text from storage.objects group by bucket_id
  -- 11) Hình dạng dữ liệu khách (chỉ mã/tên khoá + số đếm) — để v2 đọc đúng mọi biến thể cũ
  union all select '11 data', 11, f || ' = ' || coalesce(j ->> f, '(null)'), count(*)::text
    from cust, unnest(array['care_stage', 'contact_status', 'intake_method', 'disqualify_reason', 'gender', 'marital_status', 'occupation']) f
    group by f, j ->> f
  union all select '11 data', 11, 'source typeof = ' || coalesce(jsonb_typeof(j -> 'source'), '(thiếu cột)'), count(*)::text from cust group by 3
  union all select '11 data', 11, 'source code = ' || coalesce(e #>> '{}', '(null)'), count(*)::text
    from cust, jsonb_array_elements(case when jsonb_typeof(j -> 'source') = 'array' then j -> 'source' else '[]' end) e group by 3
  union all select '11 data', 11, 'dob shape = ' || case when j ->> 'dob' is null then '(null)' when j ->> 'dob' ~ '^\d{4}-\d{2}-\d{2}$' then 'YYYY-MM-DD'
      when j ->> 'dob' ~ '^--\d{2}-\d{2}$' then '--MM-DD' else 'KHÁC' end, count(*)::text from cust group by 3
  union all select '11 data', 11, 'phone shape = ' || case when j ->> 'phone' ~ '^0\d{9}$' then '0 + 9 số' when j ->> 'phone' ~ '^\+?84' then '+84/84…' else 'KHÁC' end,
    count(*)::text from cust group by 3
  union all select '11 data', 11, 'owner không có profile', count(*)::text
    from cust where not exists (select 1 from public.profiles p where p.id::text = j ->> 'owner_id')
  union all select '11 data', 11, 'qualified / disqualified / cả hai / có followers',
    count(*) filter (where j ->> 'qualified_at' is not null)::text || ' / ' || count(*) filter (where j ->> 'disqualified_at' is not null)::text || ' / ' ||
    count(*) filter (where j ->> 'qualified_at' is not null and j ->> 'disqualified_at' is not null)::text || ' / ' ||
    count(*) filter (where jsonb_typeof(j -> 'followers') = 'array' and jsonb_array_length(j -> 'followers') > 0)::text from cust
  union all select '11 data', 11, 'cột gốc ' || k, count(*)::text from cust, jsonb_object_keys(j) k where j -> k <> 'null'::jsonb group by k
  -- 12) Khoá + mã bên trong mảng/đối tượng JSONB (phát hiện thuộc tính lạ trước khi viết schema Zod v2)
  union all select '12 jsonb', 12, name || '[].' || k, count(*)::text
    from arr, jsonb_object_keys(case when jsonb_typeof(e) = 'object' then e else '{}' end) k group by name, k
  union all select '12 jsonb', 12, name || '[] không phải object hoặc thiếu at', count(*)::text
    from arr where jsonb_typeof(e) <> 'object' or not (e ? 'at') group by name
  union all select '12 jsonb', 12, 'call_attempts[].result = ' || coalesce(e ->> 'result', '(null)'), count(*)::text from arr where name = 'call_attempts' group by 3
  union all select '12 jsonb', 12, 'call_attempts[].origin = ' || coalesce(e ->> 'origin', '(null)'), count(*)::text from arr where name = 'call_attempts' group by 3
  union all select '12 jsonb', 12, 'next_tasks[].kind = ' || coalesce(e ->> 'kind', '(null)'), count(*)::text from arr where name = 'next_tasks' group by 3
  union all select '12 jsonb', 12, 'care_stage_history[].stage = ' || coalesce(e ->> 'stage', '(null)'), count(*)::text from arr where name = 'care_stage_history' group by 3
  union all select '12 jsonb', 12, 'care_stage_history[].auto = ' || coalesce(e ->> 'auto', '(null)'), count(*)::text from arr where name = 'care_stage_history' group by 3
  union all select '12 jsonb', 12, o || '.' || k, count(*)::text
    from cust, unnest(array['booking_steps', 'advanced']) o, jsonb_object_keys(case when jsonb_typeof(j -> o) = 'object' then j -> o else '{}' end) k group by o, k
  union all select '12 jsonb', 12, 'projects typeof = ' || coalesce(jsonb_typeof(j -> 'projects'), '(thiếu cột)'), count(*)::text from cust group by 3
)
select sec as "mục", item as "đối tượng", detail as "chi tiết" from out order by ord, sec, item;
