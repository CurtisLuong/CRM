-- Migration: thêm cột "công việc" + lịch hẹn gọi cho bảng customers
--
-- 1) occupation: nghề nghiệp khách, 1 trong 4 giá trị cố định.
-- 2) next_call_at / next_call_end: mốc BẮT ĐẦU và KẾT THÚC của khung giờ hẹn gọi
--    (giờ gọi là 1 khoảng thời gian — duration). Preset 9-10h/14-15h/20-21h dài
--    1 tiếng; "tùy chọn giờ" là 1 mốc nên end = at. Dùng cho tag nhắc gọi trên card.
--    Xác nhận "đã gọi" = set 2 cột này về null.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới, nếu không thao tác lưu khách sẽ báo
-- "column ... does not exist" và kẹt hàng đợi đồng bộ.

alter table public.customers
  add column if not exists occupation text
    check (occupation in ('Tự do','Công ty, DN','Công, viên chức','Công an, Bộ đội')),
  add column if not exists next_call_at timestamptz,
  add column if not exists next_call_end timestamptz;
