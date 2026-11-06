/**
 * D-025 (Curtis duyệt 2026-10-22): khách nhóm — người đang thấy khách (người theo dõi, trưởng nhóm) được sửa
 * THÔNG TIN HỒ SƠ và thêm ghi chú; bậc, cuộc gọi, lịch/việc, nguồn, giao khách, lưu trữ vẫn chỉ người phụ trách.
 * Danh sách phải khớp `allowed` trong SQL/v2/010_team_info_edit.sql (test đối chiếu) — server chặn cột ngoài danh sách.
 */
export const TEAM_INFO_FIELDS = [
  'full_name',
  'phone',
  'gender',
  'dob',
  'menh',
  'cung',
  'marital_status',
  'occupation',
  'income',
  'residence',
  'purpose',
  'avatar_path',
  'cover_path',
  'apt_type',
  'projects',
  'apt_code',
  'building_code',
  'building_id',
  'apt_price',
  'apt_area',
  'apt_direction',
  'apt_floor',
  'finance',
  'advanced',
  'notes',
  'notes_manual',
  'contact_prefs',
  'interests',
  'household',
  'field_meta',
  'referred_by',
] as const;

// Mốc do app/server tự đặt khi ghi, không phải dữ liệu người dùng đổi.
const META_FIELDS = ['updated_at', 'updated_by'];
const ALLOWED = new Set<string>([...TEAM_INFO_FIELDS, ...META_FIELDS]);

/**
 * D-032 (Curtis 2026-11-06): khách đã giao (người giao vẫn theo dõi) hoặc khách nhóm — người đang thấy khách
 * được GHI GIÙM lịch sử: kết quả cuộc gọi (kèm bậc/lịch gọi lại/loại do kết quả đó sinh ra), tương tác, ghi chú.
 * Gọi, Zalo, Hẹn (đặt lịch riêng) vẫn chỉ người phụ trách — chặn ở giao diện.
 * Danh sách phải khớp `allowed` trong SQL/v2/014_team_log_edit.sql (test đối chiếu).
 */
export const TEAM_LOG_FIELDS = [
  'call_attempts',
  'care_stage',
  'care_stage_updated_at',
  'care_stage_history',
  'next_call_at',
  'next_call_end',
  'next_call_reason',
  'disqualified_at',
  'disqualify_reason',
  'disqualify_note',
  'interactions',
] as const;
const LOG_ALLOWED = new Set<string>([...ALLOWED, ...TEAM_LOG_FIELDS]);
// Bậc, lịch gọi lại, loại: chỉ đổi KÈM một cuộc gọi được ghi (kết quả cuộc gọi sinh ra), không đổi tay riêng.
const CALL_BOUND = new Set<string>(TEAM_LOG_FIELDS.filter((k) => k !== 'call_attempts' && k !== 'interactions'));

/** Bản vá chỉ gồm cột thông tin hồ sơ (+ mốc ghi) → người không phụ trách được ghi. */
export function isTeamInfoPatch(patch: Record<string, unknown> | null | undefined): boolean {
  if (!patch) return false;
  const keys = Object.keys(patch);
  return keys.some((k) => !META_FIELDS.includes(k)) && keys.every((k) => ALLOWED.has(k));
}

/**
 * Người dùng sửa được thông tin của khách đồng nghiệp này không. Khách nằm trong máy = server đã cho xem
 * (RLS chỉ trả khách của mình, khách mình theo dõi, hoặc mọi khách nếu là trưởng nhóm), nên "thấy" = "sửa thông tin".
 */
export function canEditTeamInfo(
  customer: { owner_id?: string | null; archived_at?: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  return !!customer && !!userId && !!customer.owner_id && customer.owner_id !== userId && !customer.archived_at;
}

/** Ghi lịch sử (kết quả cuộc gọi, tương tác, ghi chú) được không: khách mình, hoặc khách đồng nghiệp đang thấy (D-032). */
export function canLogHistory(
  customer: { owner_id?: string | null; archived_at?: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!customer || !userId || customer.archived_at) return false;
  return customer.owner_id === userId || canEditTeamInfo(customer, userId);
}

/** Bản vá thông tin hồ sơ hoặc ghi lịch sử (D-032) → người không phụ trách được ghi (server chặn cùng danh sách). */
export function isTeamWritePatch(patch: Record<string, unknown> | null | undefined): boolean {
  if (!patch) return false;
  const keys = Object.keys(patch);
  if (!keys.some((k) => !META_FIELDS.includes(k)) || !keys.every((k) => LOG_ALLOWED.has(k))) return false;
  return 'call_attempts' in patch || !keys.some((k) => CALL_BOUND.has(k));
}
