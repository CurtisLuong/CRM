import type { AdvancedLegacy } from '@/config/advanced';

// CL-03 L4: ô ngắn chiếm nửa hàng ở 360px; màn rộng chia 3–4 cột. Ô lẻ cuối tự giãn kín hàng
// nhờ flex-grow, không để lại khoảng trống lớn. Ô dài luôn chiếm cả hàng.
export const SHORT_FIELD =
  'min-w-0 flex-1 basis-[calc(50%_-_0.375rem)] sm:basis-[calc(33.333%_-_0.5rem)] xl:basis-[calc(25%_-_0.5625rem)]';
export const LONG_FIELD = 'min-w-0 basis-full';

/** Một ghi cũ khác rỗng, đã có nhãn tiếng Việt để hiện chỉ đọc. */
export type LegacyValue = { key: string; label: string; value: string };

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

/**
 * Ghi cũ còn giá trị, đúng thứ tự cấu hình. Khoá rỗng/không đọc được thì bỏ.
 * Chỉ đọc — không xoá khoá nào trong advanced (D-012).
 */
export function legacyValues(
  advanced: Record<string, unknown> | null | undefined,
  legacy: readonly AdvancedLegacy[],
): LegacyValue[] {
  const source = advanced || {};
  return legacy.flatMap(({ key, label }) => {
    const value = asText(source[key]);
    return value ? [{ key, label, value }] : [];
  });
}

/** Chuỗi gạch đầu dòng cho ô gộp: mỗi ghi cũ một dòng "- Nhãn: giá trị". */
export function legacyDraft(rows: readonly LegacyValue[]): string {
  return rows.map((row) => `- ${row.label}: ${row.value}`).join('\n');
}

/** Chỉ hiện khối ghi cũ khi ô đang trống và còn ghi cũ khác rỗng. */
export function showLegacy(rows: readonly LegacyValue[], draft: string): boolean {
  return rows.length > 0 && draft.trim() === '';
}

/**
 * Patch cột advanced: giữ nguyên mọi khoá cũ + khoá lạ, chỉ thay khoá vừa sửa.
 * Trả về đúng dạng patch của repository ({ advanced }).
 */
export function advancedPatch(
  advanced: Record<string, unknown> | null | undefined,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { advanced: { ...(advanced || {}), [key]: value } };
}
