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
