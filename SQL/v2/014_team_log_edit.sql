-- ============================================================================
-- SQL/v2/014_team_log_edit.sql — Khách đã giao / khách nhóm: người đang thấy khách được GHI GIÙM lịch sử
-- (D-032, Curtis 2026-11-06). Cần SQL/v2/010_team_info_edit.sql đã chạy.
--
-- Trước (010): người theo dõi chỉ đổi được cột thông tin hồ sơ + ghi chú.
-- Sau:   thêm cột ghi lịch sử — kết quả cuộc gọi (call_attempts), bậc/lịch gọi lại/loại do kết quả cuộc gọi
--        sinh ra, tương tác (interactions). Danh sách khớp TEAM_INFO_FIELDS + TEAM_LOG_FIELDS ở
--        src/domain/customer/teamEdit.ts (test đối chiếu). Gọi/Zalo/Hẹn riêng: app chặn ở giao diện.
--        Giao khách vẫn do guard_customer_assignment kiểm; nguồn, lưu trữ, việc vẫn chỉ người phụ trách.
--
-- CHỈ NỚI DANH SÁCH CỘT CỦA TRIGGER: không đổi bảng, không đụng dữ liệu. Chạy lại được.
-- Chạy PRODUCTION nrqccwamwctihivpxjww (cũng nên chạy STAGING mksjmpcsfawsiabfhoxe). Chưa chạy thì cuộc gọi
-- người theo dõi ghi giùm nằm chờ trong máy (server từ chối), chạy xong sẽ tự đẩy lên.
-- Rollback: chạy lại mục 2 của SQL/v2/010_team_info_edit.sql.
-- ============================================================================

create or replace function public.guard_customer_team_edit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- Cột được đổi khi không phụ trách. owner_id/followers do guard_customer_assignment kiểm;
  -- updated_at/updated_by do set_updated_meta đặt.
  allowed text[] := array[
    'full_name', 'phone', 'gender', 'dob', 'menh', 'cung', 'marital_status', 'occupation', 'income',
    'residence', 'purpose', 'avatar_path', 'cover_path', 'apt_type', 'projects', 'apt_code',
    'building_code', 'building_id', 'apt_price', 'apt_area', 'apt_direction', 'apt_floor', 'finance',
    'advanced', 'notes', 'notes_manual', 'contact_prefs', 'interests', 'household', 'field_meta',
    'referred_by',
    'call_attempts', 'care_stage', 'care_stage_updated_at', 'care_stage_history', 'next_call_at',
    'next_call_end', 'next_call_reason', 'disqualified_at', 'disqualify_reason', 'disqualify_note',
    'interactions',
    'owner_id', 'followers', 'updated_at', 'updated_by'
  ];
begin
  if auth.uid() is null then return new; end if;              -- service role (Worker, landing)
  if old.owner_id = auth.uid() or public.is_admin() then return new; end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Khách do đồng nghiệp phụ trách — bạn chỉ sửa được thông tin hồ sơ và ghi lịch sử' using errcode = '42501';
  end if;
  -- Bậc, lịch gọi lại, loại chỉ đổi kèm một cuộc gọi được ghi (khớp CALL_BOUND ở teamEdit.ts).
  if new.call_attempts is not distinct from old.call_attempts
     and (new.care_stage, new.care_stage_updated_at, new.care_stage_history, new.next_call_at, new.next_call_end,
          new.next_call_reason, new.disqualified_at, new.disqualify_reason, new.disqualify_note)
         is distinct from
         (old.care_stage, old.care_stage_updated_at, old.care_stage_history, old.next_call_at, old.next_call_end,
          old.next_call_reason, old.disqualified_at, old.disqualify_reason, old.disqualify_note) then
    raise exception 'Khách do đồng nghiệp phụ trách — bậc và lịch gọi chỉ đổi kèm kết quả cuộc gọi' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Kiểm tra nhanh (mong đợi: có 'call_attempts' trong thân hàm):
-- select prosrc like '%call_attempts%' from pg_proc where proname = 'guard_customer_team_edit';
