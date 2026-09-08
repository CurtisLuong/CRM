-- Migration: hệ thống lưu trữ TÀI LIỆU (ảnh/PDF) cho khách.
--
-- Kiến trúc: file thật nằm ở Supabase STORAGE (bucket 'customer-docs', riêng tư);
-- bảng public.documents chỉ lưu METADATA (không lưu file) để liệt kê/lọc/tìm nhanh.
-- Đường dẫn file trong bucket: {owner_id}/{customer_id}/{doc_id}.{ext}
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới (nếu không thao tác tài liệu sẽ lỗi
-- "relation documents does not exist" / thiếu bucket).

-- 1) Bảng metadata --------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'khac',   -- reg_image | cccd | so_ho_khau | hop_dong | khac ...
  label text,                          -- mô tả người dùng đặt (tuỳ chọn)
  storage_path text not null,          -- đường dẫn file trong bucket
  mime text,
  size int,
  created_at timestamptz not null default now()
);

create index if not exists documents_customer_idx on public.documents (customer_id);
create index if not exists documents_owner_kind_idx on public.documents (owner_id, kind);

alter table public.documents enable row level security;

-- RLS: chủ sở hữu thấy tài liệu của mình; admin thấy tất cả (dùng hàm is_admin()
-- security-definer sẵn có — KHÔNG tự query lại bảng để tránh đệ quy policy).
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (owner_id = auth.uid() or public.is_admin());
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (owner_id = auth.uid());
drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update using (owner_id = auth.uid() or public.is_admin());
drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (owner_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.documents to authenticated;

-- 2) Storage bucket (riêng tư) --------------------------------------------------
insert into storage.buckets (id, name, public)
values ('customer-docs', 'customer-docs', false)
on conflict (id) do nothing;

-- 3) RLS cho file trong bucket: user chỉ được đụng thư mục của chính mình
-- (segment đầu của đường dẫn = owner_id = auth.uid()). File xem qua signed URL.
drop policy if exists "cust_docs_select" on storage.objects;
create policy "cust_docs_select" on storage.objects
  for select using (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "cust_docs_insert" on storage.objects;
create policy "cust_docs_insert" on storage.objects
  for insert with check (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "cust_docs_delete" on storage.objects;
create policy "cust_docs_delete" on storage.objects
  for delete using (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- (Admin xem file của người khác: chưa cần cho 1 sale. Thêm sau nếu mở rộng nhóm.)
