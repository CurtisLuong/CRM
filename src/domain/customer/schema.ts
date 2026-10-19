/**
 * Zod schema cho bản ghi khách (bảng customers) + phần tử JSONB — hợp đồng dữ liệu D-012 (ARCHITECTURE.md §3).
 *
 * Luật:
 *  - `.passthrough()` ở MỌI object: thuộc tính lạ (cột mới, khoá do v1/thiết bị khác ghi) được giữ nguyên.
 *  - KHÔNG `.default()`, `.transform()`, `coerce`: parse không thêm, bớt hay đổi giá trị nào.
 *    Chuẩn hoá (bậc cũ, mã nguồn cũ, phần tử hỏng…) chỉ làm ở getter trong normalize.ts.
 *  - Dữ liệu cũ có thể "bẩn" (phần tử null, thiếu `at`, source dạng chuỗi) → schema chấp nhận, getter lọc.
 *  - Bắt buộc theo CLAUDE.md §3.4: id, phone, full_name, owner_id. Còn lại nullable/optional (thu thập dần).
 */
import { z } from 'zod';

const str = z.string().nullish();
const num = z.union([z.number(), z.string()]).nullish(); // numeric Postgres / ô nhập cũ có thể là chuỗi
const strList = z.array(z.string()).nullish();

/** Phần tử call_attempts: {at, result, note, duration?, origin?, device_id?, direction?}. result null = chưa ghi chú. */
export const CallAttemptSchema = z
  .object({
    at: str,
    result: str,
    note: str,
    duration: z.number().nullish(),
    origin: str,
    device_id: str,
    direction: str,
  })
  .passthrough();

/** Phần tử next_tasks (+ trường v2 tuỳ chọn cho lời hứa 2 chiều — ARCHITECTURE.md §3.4). */
export const TaskSchema = z
  .object({
    at: str,
    text: str,
    kind: str,
    due: str,
    due_allday: z.boolean().nullish(),
    done_at: str,
    log_at: str,
    // v2
    side: str, // 'me' | 'customer'
    due_original: str,
    snoozed_reason: str,
    source: str, // 'manual' | 'system' | 'ai'
    key: str,
  })
  .passthrough();

/** Phần tử notes_manual: {text, at}. */
export const NoteSchema = z.object({ at: str, text: str }).passthrough();

/** Phần tử care_stage_history: {stage, note, at, auto?, edited_at?}. stage có thể là tên cũ (đọc qua normStage). */
export const StageHistorySchema = z
  .object({
    at: str,
    stage: str,
    note: str,
    auto: str,
    edited_at: str,
  })
  .passthrough();

/** booking_steps: {<mã bước>: ISO lúc xong}. Mã bước: VELOCITY_CONFIG.bookingSteps[].key. */
export const BookingStepsSchema = z.record(z.string(), z.string().nullable());

/** advanced: khoá theo ADVANCED_GROUPS (src/config/advanced.ts) + khoá lạ. */
export const AdvancedSchema = z.record(z.string(), z.unknown());

// ── Trường v2 (T2.A5 thêm cột; v1 bỏ qua) ──
export const ContactPrefsSchema = z
  .object({
    do_not_contact: z.boolean().nullish(),
    dnc_reason: str,
    dnc_at: str,
    channel: str,
    slot: str,
    zalo_name: str,
    zalo_link: str,
  })
  .passthrough();

export const InterestSchema = z
  .object({
    id: str,
    project: str,
    apt_type: str,
    budget_max: num,
    purpose: str,
    timeline: str,
    status: str, // open | won | lost | paused
    reason: str,
    source: str,
    at: str,
    closed_at: str,
  })
  .passthrough();

export const HouseholdMemberSchema = z
  .object({ id: str, name: str, role: str, phone: str, note: str, at: str })
  .passthrough();

export const InteractionSchema = z
  .object({
    at: str,
    channel: str, // zalo | sms | meet | visit | other
    kind: str,
    note: str,
    template: str,
    campaign: str,
    by: str,
    origin: str,
  })
  .passthrough();

export const RetargetHintSchema = z
  .object({ after: str, max_price: num, apt_types: strList, projects: strList, note: str })
  .passthrough();

export const FieldMetaSchema = z.record(
  z.string(),
  z.object({ at: str, by: str, confirmed: z.boolean().nullish() }).passthrough(),
);

/** Một hàng customers (aggregate theo khách — ARCHITECTURE.md §3.3). */
export const CustomerSchema = z
  .object({
    // Định danh
    id: z.string(),
    phone: z.string(),
    full_name: z.string(),
    owner_id: z.string(),
    followers: strList,
    // Cá nhân
    gender: str,
    dob: str, // 'YYYY-MM-DD' | '--MM-DD'
    menh: str,
    cung: str,
    marital_status: str,
    occupation: str,
    income: str,
    residence: str,
    purpose: str,
    avatar_path: str,
    cover_path: str,
    // Nhu cầu
    apt_type: str,
    projects: strList,
    apt_code: str,
    building_code: str,
    building_id: str,
    apt_price: num,
    apt_area: num,
    apt_direction: str,
    apt_floor: num,
    finance: num, // vốn sẵn có
    advanced: AdvancedSchema.nullish(),
    // Phễu
    care_stage: str,
    care_stage_updated_at: str,
    care_stage_history: z.array(StageHistorySchema.nullable()).nullish(),
    interest_level: num,
    contact_status: str,
    booking_steps: BookingStepsSchema.nullish(),
    sla_anchor_at: str,
    // Lớp khách
    qualified_at: str,
    disqualified_at: str,
    disqualify_reason: str,
    disqualify_note: str,
    // Tương tác
    call_attempts: z.array(CallAttemptSchema.nullable()).nullish(),
    notes: str,
    notes_manual: z.array(NoteSchema.nullable()).nullish(),
    // Lịch / việc
    next_call_at: str,
    next_call_end: str,
    next_call_reason: str,
    next_tasks: z.array(TaskSchema.nullable()).nullish(),
    // Nguồn — v1 cũ có thể lưu chuỗi; đọc qua sourceListOf
    source: z.union([z.array(z.string()), z.string()]).nullish(),
    intake_method: str,
    campaign: str,
    registered_at: str,
    // Hệ thống
    created_at: str,
    updated_at: str,
    updated_by: str,
    // v2 (tuỳ chọn)
    archived_at: str,
    contact_prefs: ContactPrefsSchema.nullish(),
    interests: z.array(InterestSchema.nullable()).nullish(),
    household: z.array(HouseholdMemberSchema.nullable()).nullish(),
    interactions: z.array(InteractionSchema.nullable()).nullish(),
    close_reason: str,
    close_note: str,
    retarget_hint: RetargetHintSchema.nullish(),
    field_meta: FieldMetaSchema.nullish(),
    referred_by: str,
  })
  .passthrough();
