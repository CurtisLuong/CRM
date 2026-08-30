-- Migration: đổi bộ bậc care_stage + tách trạng thái liên lạc ra cột riêng
--
-- BỐI CẢNH (2026-08-26): bộ care_stage cũ trộn LẪN 2 thứ khác nhau — kênh liên lạc
-- (chưa gọi được / hẹn gọi lại / chờ kết bạn Zalo / đang chăm qua Zalo) và độ sâu
-- phễu (hỗ trợ hồ sơ / booking / ký HĐ). Nay tách:
--   • care_stage  = ĐỘ SÂU PHỄU (bộ bậc mới bên dưới)
--   • contact_status = KÊNH/KẾT QUẢ LIÊN LẠC (cột mới, độc lập)
--
-- Bản đồ chuyển đổi (care_stage cũ → care_stage mới + contact_status):
--   Chưa gọi được            → Đang tiếp cận   + Chưa gọi được
--   Hẹn gọi lại              → Đang tiếp cận   + Hẹn gọi lại
--   Chờ kết bạn Zalo         → Đang tiếp cận   + Chờ kết bạn Zalo
--   Đang chăm sóc qua Zalo   → Đang chăm sóc   + (Phản hồi tốt nếu <7 ngày / Mất liên lạc nếu ≥7)
--   Đã yêu cầu hỗ trợ hồ sơ  → Hỗ trợ hồ sơ    + (như trên, theo 7 ngày)
--   Đã booking               → Booking         + (như trên, theo 7 ngày)
--   Đã ký hợp đồng mua bán   → Kí HĐMB         + (như trên, theo 7 ngày)
--   Không chốt-kết thúc      → Loại            + (để trống)
--
-- Cách chạy: Supabase → SQL Editor → dán CẢ file → Run. An toàn chạy lại nhiều lần.
-- LƯU Ý: chạy TRƯỚC/NGAY KHI deploy code mới (code mới dùng tên bậc mới).
-- KHÔNG cần GRANT lại: quyền trên bảng customers là table-level nên cột mới tự có.

-- =====================================================================
-- 1) THÊM CỘT contact_status (chưa gắn CHECK để backfill tự do)
-- =====================================================================
alter table public.customers
  add column if not exists contact_status text;

-- =====================================================================
-- 2) BACKFILL contact_status TỪ care_stage CŨ  (PHẢI chạy TRƯỚC bước đổi
--    care_stage — vì bản đồ dựa vào giá trị CŨ). Chỉ đặt khi còn trống.
--    "Còn liên lạc tốt hay đã mất" suy từ care_stage_updated_at (fallback
--    updated_at/created_at) so với thời điểm chạy migration.
-- =====================================================================
update public.customers
  set contact_status = case care_stage
    when 'Chưa gọi được'    then 'Chưa gọi được'
    when 'Hẹn gọi lại'      then 'Hẹn gọi lại'
    when 'Chờ kết bạn Zalo' then 'Chờ kết bạn Zalo'
    when 'Đang chăm sóc qua Zalo'   then
      case when coalesce(care_stage_updated_at, updated_at, created_at) > now() - interval '7 days'
           then 'Phản hồi tốt' else 'Mất liên lạc' end
    when 'Đã yêu cầu hỗ trợ hồ sơ'  then
      case when coalesce(care_stage_updated_at, updated_at, created_at) > now() - interval '7 days'
           then 'Phản hồi tốt' else 'Mất liên lạc' end
    when 'Đã booking'               then
      case when coalesce(care_stage_updated_at, updated_at, created_at) > now() - interval '7 days'
           then 'Phản hồi tốt' else 'Mất liên lạc' end
    when 'Đã ký hợp đồng mua bán'   then
      case when coalesce(care_stage_updated_at, updated_at, created_at) > now() - interval '7 days'
           then 'Phản hồi tốt' else 'Mất liên lạc' end
    else null   -- 'Không chốt-kết thúc' và mọi giá trị khác → không đặt liên lạc
  end
  where contact_status is null;

-- =====================================================================
-- 3) ĐỔI care_stage (bỏ CHECK cũ → đổi giá trị → thêm CHECK mới)
-- =====================================================================
alter table public.customers
  drop constraint if exists customers_care_stage_check;

update public.customers
  set care_stage = case care_stage
    when 'Chưa gọi được'          then 'Đang tiếp cận'
    when 'Hẹn gọi lại'            then 'Đang tiếp cận'
    when 'Chờ kết bạn Zalo'       then 'Đang tiếp cận'
    when 'Đang chăm sóc qua Zalo' then 'Đang chăm sóc'
    when 'Đã yêu cầu hỗ trợ hồ sơ' then 'Hỗ trợ hồ sơ'
    when 'Đã booking'             then 'Booking'
    when 'Đã ký hợp đồng mua bán' then 'Kí HĐMB'
    when 'Không chốt-kết thúc'    then 'Loại'
    else care_stage   -- đã là bậc mới (chạy lại) hoặc null → giữ nguyên
  end
  where care_stage in (
    'Chưa gọi được','Hẹn gọi lại','Chờ kết bạn Zalo','Đang chăm sóc qua Zalo',
    'Đã yêu cầu hỗ trợ hồ sơ','Đã booking','Đã ký hợp đồng mua bán','Không chốt-kết thúc'
  );

-- =====================================================================
-- 4) ĐỔI TÊN BẬC TRONG LỊCH SỬ care_stage_history (mảng JSONB {stage,note,at})
--    Giữ nguyên thứ tự/note/at, chỉ map tên bậc cũ → mới (để timeline + phễu +
--    biểu đồ "thời gian mỗi bậc" nhận đúng màu/đúng bậc). Chấp nhận việc vài mốc
--    liên tiếp trùng tên (vd 3 mốc cũ đều thành "Đang tiếp cận").
-- =====================================================================
update public.customers c
  set care_stage_history = (
    select coalesce(jsonb_agg(
      case
        when e->>'stage' = 'Chưa gọi được'          then jsonb_set(e, '{stage}', '"Đang tiếp cận"')
        when e->>'stage' = 'Hẹn gọi lại'            then jsonb_set(e, '{stage}', '"Đang tiếp cận"')
        when e->>'stage' = 'Chờ kết bạn Zalo'       then jsonb_set(e, '{stage}', '"Đang tiếp cận"')
        when e->>'stage' = 'Đang chăm sóc qua Zalo' then jsonb_set(e, '{stage}', '"Đang chăm sóc"')
        when e->>'stage' = 'Đã yêu cầu hỗ trợ hồ sơ' then jsonb_set(e, '{stage}', '"Hỗ trợ hồ sơ"')
        when e->>'stage' = 'Đã booking'             then jsonb_set(e, '{stage}', '"Booking"')
        when e->>'stage' = 'Đã ký hợp đồng mua bán' then jsonb_set(e, '{stage}', '"Kí HĐMB"')
        when e->>'stage' = 'Không chốt-kết thúc'    then jsonb_set(e, '{stage}', '"Loại"')
        else e
      end
      order by ord
    ), '[]'::jsonb)
    from jsonb_array_elements(c.care_stage_history) with ordinality as t(e, ord)
  )
  where c.care_stage_history @> '[{"stage":"Chưa gọi được"}]'
     or c.care_stage_history @> '[{"stage":"Hẹn gọi lại"}]'
     or c.care_stage_history @> '[{"stage":"Chờ kết bạn Zalo"}]'
     or c.care_stage_history @> '[{"stage":"Đang chăm sóc qua Zalo"}]'
     or c.care_stage_history @> '[{"stage":"Đã yêu cầu hỗ trợ hồ sơ"}]'
     or c.care_stage_history @> '[{"stage":"Đã booking"}]'
     or c.care_stage_history @> '[{"stage":"Đã ký hợp đồng mua bán"}]'
     or c.care_stage_history @> '[{"stage":"Không chốt-kết thúc"}]';

-- =====================================================================
-- 5) GẮN LẠI CÁC RÀNG BUỘC CHECK (bộ giá trị mới)
-- =====================================================================
alter table public.customers
  add constraint customers_care_stage_check check (care_stage in (
    'Đăng kí mới',
    'Đang tiếp cận',
    'Đang chăm sóc',
    'Xem dự án',
    'Hỗ trợ hồ sơ',
    'Booking',
    'Kí HĐMB',
    'Loại'
  ));

alter table public.customers
  drop constraint if exists customers_contact_status_check;
alter table public.customers
  add constraint customers_contact_status_check check (contact_status in (
    'Chưa gọi được',
    'Hẹn gọi lại',
    'Chờ kết bạn Zalo',
    'Phản hồi tốt',
    'Mất liên lạc'
  ));

-- =====================================================================
-- 6) INDEX cho cột mới (giống các cột lọc khác)
-- =====================================================================
create index if not exists customers_contact_status_idx on public.customers (contact_status);
