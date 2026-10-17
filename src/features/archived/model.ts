import type { Customer } from '@/domain/customer';
import { normalize, phone } from '@/domain/search';

/** Khách đã lưu trữ (archived_at), mới lưu trữ trước; lọc theo tên không dấu hoặc SĐT. */
export function archivedCustomers(rows: readonly Customer[], query = ''): Customer[] {
  const q = normalize(query);
  const digits = phone(query);
  return rows
    .filter((c) => !!c.archived_at)
    .filter((c) => !q || normalize(c.full_name).includes(q) || (digits.length >= 3 && phone(c.phone).includes(digits)))
    .sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
}
