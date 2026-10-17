import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { archivedCustomers } from '@/features/archived/model';

const row = (id: string, full_name: string, phone: string, archived_at?: string | null) =>
  ({ id, owner_id: 'u1', full_name, phone, archived_at }) as Customer;

const rows = [
  row('a', 'Nguyễn Văn Đức', '0901111222', '2026-10-16T00:00:00.000Z'),
  row('b', 'Trần Lan', '0903333444', '2026-10-17T00:00:00.000Z'),
  row('c', 'Khách đang chăm', '0905555666', null),
  row('d', 'Khách cũ', '0907777888'),
];

describe('archivedCustomers', () => {
  it('lists only archived customers, newest archive first', () => {
    expect(archivedCustomers(rows).map((c) => c.id)).toStrictEqual(['b', 'a']);
  });

  it('filters by accent-insensitive name or phone digits', () => {
    expect(archivedCustomers(rows, 'duc').map((c) => c.id)).toStrictEqual(['a']);
    expect(archivedCustomers(rows, '333').map((c) => c.id)).toStrictEqual(['b']);
    expect(archivedCustomers(rows, '0905').map((c) => c.id)).toStrictEqual([]);
  });
});
