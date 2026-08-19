-- Migration: thêm cột care_stage_updated_at cho bảng customers
--
-- Mục đích: timestamp "cập nhật cuối" hiển thị trên card CHỈ đổi khi Tiến độ
-- chăm sóc (care_stage) thay đổi, KHÔNG đổi khi sửa các field khác. Không tái
-- dùng updated_at cho việc này vì updated_at còn phục vụ 2 việc khác:
-- sort "Mới cập nhật" và xử lý xung đột last-write-wins khi đồng bộ.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy migration này TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác
-- lưu khách sẽ báo "column care_stage_updated_at does not exist" và kẹt hàng đợi
-- đồng bộ cho tới khi cột được tạo.

alter table public.customers
  add column if not exists care_stage_updated_at timestamptz default now();

-- Khởi tạo cho các dòng đã có: lấy tạm updated_at (hoặc created_at) làm mốc ban đầu.
update public.customers
  set care_stage_updated_at = coalesce(care_stage_updated_at, updated_at, created_at, now())
  where care_stage_updated_at is null;
