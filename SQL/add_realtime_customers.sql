-- Migration: bật Supabase Realtime cho bảng customers (đồng bộ tức thời giữa các thiết bị)
--
-- Sửa khách trên máy A → server báo ngay cho máy B qua WebSocket → máy B tự vẽ lại sau ~1-2 giây
-- (giống Google Keep), không cần bấm nút đám mây. Code: CRM.startLive() trong js/db.js.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- Chưa chạy file này thì app VẪN dùng được: tự kiểm tra thay đổi mỗi 15 giây và mỗi lần
-- mở lại app / quay lại tab (chậm hơn, nhưng vẫn không cần bấm tay).
--
-- Quyền: Realtime áp dụng RLS của customers — mỗi người chỉ nhận tín hiệu khách mình được
-- XEM. Riêng sự kiện XOÁ chỉ mang id khách (không có nội dung), app dùng id đó để xoá bản local.
-- Không cần GRANT thêm (đã có SELECT cho authenticated).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table public.customers;
  end if;
end $$;
