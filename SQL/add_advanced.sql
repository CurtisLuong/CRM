-- Migration: thêm hồ sơ "Nâng cao" cho khách (bảng customers)
--
-- advanced: 1 object JSON gom các thuộc tính hồ sơ sâu (tuỳ chọn, dành cho khách khó tính /
--   cam kết đủ sâu): bối cảnh sống, sở thích BĐS, năng lực tài chính. Mỗi khoá là 1 field
--   (vd life_stage, pref_area, capital...). Lưu ngay trên bảng customers để offline-first
--   như care_stage_history/notes_manual/next_tasks. Trường trống → không có khoá.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu khách sẽ báo
-- "column advanced does not exist" và kẹt hàng đợi đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.customers
  add column if not exists advanced jsonb not null default '{}'::jsonb;
