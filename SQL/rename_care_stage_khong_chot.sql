-- Migration: đổi tên bậc care_stage 'Không quan tâm-kết thúc' → 'Không chốt-kết thúc'
--
-- Đổi ở 3 nơi: ràng buộc CHECK, cột customers.care_stage, và trong lịch sử
-- care_stage_history (mảng JSONB {stage,note,at}).
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới (code mới dùng tên mới).

-- 1) Tạm bỏ ràng buộc để đổi giá trị tự do.
alter table public.customers
  drop constraint if exists customers_care_stage_check;

-- 2) Đổi giá trị ở cột care_stage.
update public.customers
  set care_stage = 'Không chốt-kết thúc'
  where care_stage = 'Không quan tâm-kết thúc';

-- 3) Đổi giá trị trong lịch sử care_stage_history (giữ nguyên thứ tự, note, at).
update public.customers c
  set care_stage_history = (
    select coalesce(jsonb_agg(
      case when e->>'stage' = 'Không quan tâm-kết thúc'
           then jsonb_set(e, '{stage}', '"Không chốt-kết thúc"')
           else e end
      order by ord
    ), '[]'::jsonb)
    from jsonb_array_elements(c.care_stage_history) with ordinality as t(e, ord)
  )
  where c.care_stage_history @> '[{"stage":"Không quan tâm-kết thúc"}]';

-- 4) Thêm lại ràng buộc với danh sách đã đổi tên.
alter table public.customers
  add constraint customers_care_stage_check check (care_stage in (
    'Chưa gọi được',
    'Hẹn gọi lại',
    'Chờ kết bạn Zalo',
    'Đang chăm sóc qua Zalo',
    'Đã yêu cầu hỗ trợ hồ sơ',
    'Đã booking',
    'Đã ký hợp đồng mua bán',
    'Không chốt-kết thúc'
  ));
