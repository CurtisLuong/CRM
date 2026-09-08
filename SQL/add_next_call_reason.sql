-- Migration: thêm cột "lý do" cho lịch hẹn gọi (bảng customers)
--
-- next_call_reason: ghi chú NGẮN vì sao đặt cuộc gọi này (vd "nhắc hồ sơ",
--   "gửi bảng giá", "chốt cọc"). Optional (nullable). Gắn LIỀN với lịch hẹn
--   (next_call_at/next_call_end): xác nhận "đã gọi" hoặc "huỷ lịch" đều set cả
--   3 cột này về null → lý do mất theo lịch. Hiện ở nhãn "Hẹn gọi" trang chi
--   tiết + trong hộp thoại xác nhận gọi để lúc gọi biết cần nói gì.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu lịch gọi sẽ
-- báo "column next_call_reason does not exist" và kẹt hàng đợi đồng bộ.
-- Không cần GRANT thêm: quyền cấp ở tầng bảng tự áp dụng cho cột mới.

alter table public.customers
  add column if not exists next_call_reason text;
