-- Migration: thêm cột notes_manual (JSONB) cho bảng customers
--
-- Mục đích: chuyển "Ghi chú" của khách từ 1 ô text tự do (cột `notes`) sang DANH
-- SÁCH các ghi chú tự nhập, mỗi ghi chú là 1 gạch đầu dòng có mốc thời gian:
--   [ { "text": "<nội dung>", "at": "<ISO time>" }, ... ]  (mới nhất ở đầu mảng)
--
-- Vì sao tách riêng khỏi `notes` cũ:
--  - Trang chi tiết/card sẽ hiển thị ghi chú dạng bullet + 1 "ghi chú TỰ ĐỘNG"
--    (suy ra từ note care stage mới nhất) ở trên cùng. Note tự động KHÔNG lưu ở
--    đây — nó tính lại lúc hiển thị từ care_stage_history nên luôn cập nhật.
--  - Dùng JSONB gắn thẳng vào record khách (như care_stage_history) để tự đồng bộ
--    qua hàng đợi IndexedDB, khỏi thêm bảng/RLS/grant riêng.
--
-- Cột `notes` cũ được GIỮ LẠI (không xoá) cho an toàn/đối chiếu; app không dùng nữa.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy migration này TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu
-- ghi chú sẽ báo "column notes_manual does not exist" và kẹt hàng đợi đồng bộ.

alter table public.customers
  add column if not exists notes_manual jsonb not null default '[]'::jsonb;

-- Khách đã có ghi chú text cũ (khác rỗng) → tạo 1 bullet đầu tiên trong danh sách mới.
update public.customers
  set notes_manual = jsonb_build_array(
    jsonb_build_object(
      'text', notes,
      'at', to_jsonb(coalesce(updated_at, created_at, now()))
    )
  )
  where notes is not null and btrim(notes) <> '' and notes_manual = '[]'::jsonb;
