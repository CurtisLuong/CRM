-- ============================================================================
-- SQL/v2/012_send_kit_realtime.sql — SK-04 · Curtis 05/11
-- Bật Realtime cho bảng Tài liệu gửi khách: máy đang mở trang Tài liệu thấy
-- thay đổi từ máy khác/đồng nghiệp sau vài giây, không cần tải lại.
-- Realtime tôn trọng RLS của send_kit_items (SQL 011): chỉ nhận mục mình được xem.
-- Chỉ thêm. Chạy lại an toàn. Cần trước: SQL/v2/011_send_kit.sql.
-- Rollback: alter publication supabase_realtime drop table public.send_kit_items;
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'send_kit_items'
  ) then
    alter publication supabase_realtime add table public.send_kit_items;
  end if;
end $$;

-- Kiểm (mong đợi 1 dòng):
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'send_kit_items';
