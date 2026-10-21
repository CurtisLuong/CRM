import type { IntakeValues } from './schema';

/**
 * PF-03: các trường nằm sau nút "Thêm thông tin" (mặc định ẩn).
 * KHÔNG gồm Họ tên, SĐT, Kênh, Dự án, Loại căn và các ô Chăm sóc — đó là phần hiện sẵn.
 * Mệnh/Cung tính từ Ngày sinh nên không tính riêng (luật 3).
 */
export const MORE_FIELD_KEYS = [
  'gender',
  'dob',
  'marital_status',
  'occupation',
  'income',
  'residence',
  'registered_at',
  'campaign',
  'apt_area',
  'building_code',
  'apt_code',
  'apt_direction',
  'apt_floor',
  'apt_price',
  'finance',
  'purpose',
  'notes',
] as const satisfies readonly (keyof IntakeValues)[];

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Số trường đã điền trong khu "Thêm thông tin" — dùng cho nhãn "Thêm thông tin · đã điền N".
 * Mỗi khoá `advanced` khác rỗng tính 1 (khoá lạ vẫn còn trong hồ sơ cũ nên cũng được tính).
 */
export function countMoreFilled(values: Partial<IntakeValues> | null | undefined): number {
  if (!values) return 0;
  let count = MORE_FIELD_KEYS.filter((key) => hasValue(values[key])).length;
  for (const value of Object.values(values.advanced ?? {})) {
    if (hasValue(value)) count += 1;
  }
  return count;
}

/** Ngày sinh trong form (ngày/tháng[/năm]) → giá trị lưu DB. Ném lỗi để màn hiện đúng câu báo. */
export function dobToIso(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const parts = value.split(/[/.-]/).map((part) => part.trim());
  if (parts.length !== 2 && parts.length !== 3) throw new Error('Ngày sinh dùng dạng ngày/tháng hoặc ngày/tháng/năm.');
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = parts.length === 3 ? Number(parts[2]) : undefined;
  const maxDay =
    month === 2
      ? year && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
        ? 29
        : 29
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || day > maxDay || month < 1 || month > 12)
    throw new Error('Ngày sinh không hợp lệ.');
  if (!year) return `--${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())
    throw new Error('Năm sinh không hợp lệ.');
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) throw new Error('Ngày sinh không hợp lệ.');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Bản không ném lỗi của dobToIso, dùng để hiện Mệnh/Cung khi đang gõ. */
export function safeDob(value: string): string {
  try {
    return dobToIso(value) || '';
  } catch {
    return '';
  }
}
