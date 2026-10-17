import type { Customer } from './types';

export type FactSource = 'sale' | 'customer' | 'import' | 'ai';

/** Build a field-level patch with provenance, retaining unknown metadata keys (D-012). */
export function factPatch(
  customer: Customer,
  field: string,
  value: unknown,
  by: FactSource = 'sale',
  at = new Date().toISOString(),
) {
  const fieldMeta = { ...(customer.field_meta || {}) };
  fieldMeta[field] = { ...(fieldMeta[field] || {}), at, by, confirmed: by !== 'ai' };
  return { [field]: value, field_meta: fieldMeta };
}

export function factFreshness(at?: string | null, now = Date.now()) {
  if (!at) return { label: 'Nguồn/độ mới chưa ghi', stale: false };
  const timestamp = Date.parse(at);
  if (!Number.isFinite(timestamp)) return { label: 'Ngày nguồn không hợp lệ', stale: false };
  const stale = now - timestamp > 90 * 24 * 60 * 60 * 1000;
  return {
    label: `${stale ? 'Cần xác nhận · ' : ''}${new Date(timestamp).toLocaleDateString('vi-VN')}`,
    stale,
  };
}
