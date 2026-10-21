import type { AdvancedLegacy } from '@/config/advanced';

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
