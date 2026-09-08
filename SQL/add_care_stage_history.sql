-- Migration: thêm cột care_stage_history (JSONB) cho bảng customers
--
-- Mục đích: lưu LỊCH SỬ các lần đổi Tiến độ chăm sóc (care_stage) để dựng
-- timeline trên trang chi tiết. Mỗi phần tử trong mảng là 1 mốc:
--   { "stage": "<tên bậc>", "note": "<ghi chú lần đổi này>", "at": "<ISO time>" }
--
-- Vì sao dùng JSONB gắn thẳng vào bảng customers (thay vì bảng log riêng):
-- app là offline-first, mọi record khách đã đồng bộ sẵn qua hàng đợi IndexedDB
-- → nhét lịch sử vào chính record khách thì tự đồng bộ theo, KHÔNG phải thêm
-- bảng mới + RLS + grant + logic pull riêng. Chấp nhận được vì CRM rất ít người
-- dùng, xác suất 2 thiết bị sửa cùng 1 khách cùng lúc gần như bằng 0.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu khách sẽ
-- báo "column care_stage_history does not exist" và kẹt hàng đợi đồng bộ.

alter table public.customers
  add column if not exists care_stage_history jsonb not null default '[]'::jsonb;

-- Khách đã có sẵn 1 bậc care_stage nhưng chưa có lịch sử → tạo 1 mốc khởi đầu
-- (mốc = giá trị hiện tại, thời điểm lấy tạm updated_at/created_at).
update public.customers
  set care_stage_history = jsonb_build_array(
    jsonb_build_object(
      'stage', care_stage,
      'note', null::text,
      'at', to_jsonb(coalesce(updated_at, created_at, now()))
    )
  )
  where care_stage is not null and care_stage_history = '[]'::jsonb;
