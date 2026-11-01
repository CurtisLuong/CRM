import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import type { Signal } from '@/domain/signals';
import type { QueueRow } from './model';
import { callSessionRows } from './model';

const makeRow = (id: string, actions: Signal['actions']): QueueRow => {
  const customer: Customer = { id, owner_id: 'owner', full_name: id, phone: '0900000000' };
  const signal: Signal = {
    id,
    rule: 'S03',
    customerId: id,
    priority: 'P1',
    title: 'Việc cần xử lý',
    reason: 'Việc cần xử lý',
    evidence: [],
    actions,
    dedupeKey: id,
    fingerprint: id,
    sort: [],
  };
  return { signal, customer, minutes: 3 };
};

describe('callSessionRows', () => {
  it('giữ thứ tự hàng đợi và chỉ lấy hàng có hành động gọi theo todayCard', () => {
    const rows = [makeRow('first', ['call']), makeRow('other', ['complete']), makeRow('second', ['call'])];
    expect(callSessionRows(rows, Date.parse('2026-10-29T09:30:00+07:00')).map(({ customer }) => customer.id)).toEqual([
      'first',
      'second',
    ]);
  });
});
