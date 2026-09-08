-- Migration: thêm bậc tiến độ "Không quan tâm-kết thúc" cho cột care_stage
--
-- Vì sao cần chạy file này:
--   Cột customers.care_stage có 1 ràng buộc CHECK chỉ cho phép đúng danh sách
--   giá trị cũ (7 bậc). Nếu không cập nhật, khi app gắn khách vào bậc mới
--   'Không quan tâm-kết thúc' thì lệnh đồng bộ (INSERT/UPDATE) lên Supabase sẽ
--   bị Postgres từ chối (vi phạm CHECK), khách sẽ kẹt lại trong hàng đợi offline.
--
-- Ý nghĩa bậc mới: là 1 trạng thái KẾT THÚC quá trình chăm sóc mà không chốt
--   được khách. Về mặt "đã xong hay chưa" nó tương đương bậc 7 ('Đã ký hợp đồng
--   mua bán') — cả hai đều coi là chăm sóc xong (app mặc định ẩn khỏi dashboard).
--
-- Cách chạy: mở Supabase → SQL Editor → dán toàn bộ file này → Run. An toàn chạy
--   lại nhiều lần (idempotent nhờ 'drop constraint if exists').

alter table public.customers
  drop constraint if exists customers_care_stage_check;

alter table public.customers
  add constraint customers_care_stage_check check (care_stage in (
    'Chưa gọi được',
    'Hẹn gọi lại',
    'Chờ kết bạn Zalo',
    'Đang chăm sóc qua Zalo',
    'Đã yêu cầu hỗ trợ hồ sơ',
    'Đã booking',
    'Đã ký hợp đồng mua bán',
    'Không quan tâm-kết thúc'
  ));
