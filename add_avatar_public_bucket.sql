-- Migration: tách AVATAR sang bucket PUBLIC riêng (customer-avatars)
--
-- BỐI CẢNH: trước đây avatar lưu CHUNG bucket 'customer-docs' (private) với tài liệu
-- khách. Để avatar hiển thị tức thì (public URL, trình duyệt tự cache) mà KHÔNG làm lộ
-- tài liệu khách, ta tạo 1 bucket PUBLIC riêng chỉ cho avatar; 'customer-docs' GIỮ NGUYÊN
-- private cho tài liệu.
--
-- BẢO MẬT:
--   • Chỉ FILE ẢNH đại diện là public (đọc qua URL). Dữ liệu khách (bảng customers) +
--     tài liệu (bucket customer-docs) KHÔNG đổi, vẫn riêng tư.
--   • READ policy vẫn giới hạn thư mục của chính mình → API list/download không liệt kê
--     được avatar của người khác (chống dò). Public URL thì ai có đúng link mới xem được
--     (path chứa UUID nên không đoán mò) — đây là đánh đổi chấp nhận được cho avatar.
--   • GHI/XOÁ chỉ authenticated + chỉ trong thư mục của mình (owner_id = segment đầu path).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới. Sau đó mở app 1 lần khi ONLINE để app tự
-- di chuyển các file avatar cũ (nếu có) từ customer-docs sang customer-avatars.

-- 1) Bucket PUBLIC cho avatar
insert into storage.buckets (id, name, public)
values ('customer-avatars', 'customer-avatars', true)
on conflict (id) do update set public = true;

-- 2) RLS trên storage.objects cho bucket này (mẫu giống customer-docs, thêm update).
--    READ: giới hạn thư mục của mình (public URL vẫn đọc được vì bucket public — RLS chỉ
--    chi phối API list/download, không chi phối public URL).
drop policy if exists "cust_avatars_select" on storage.objects;
create policy "cust_avatars_select" on storage.objects
  for select using (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "cust_avatars_insert" on storage.objects;
create policy "cust_avatars_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "cust_avatars_update" on storage.objects;
create policy "cust_avatars_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "cust_avatars_delete" on storage.objects;
create policy "cust_avatars_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
