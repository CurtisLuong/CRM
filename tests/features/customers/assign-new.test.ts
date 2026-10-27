import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { DEFAULT_FILTERS, v1FilterCustomers } from '@/features/customers/model';

const c = (id: string, owner_id: string, qualified_at?: string) =>
  ({ id, owner_id, full_name: id, phone: '0901234567', qualified_at }) as Customer;

describe('giao khách mới cho đồng nghiệp', () => {
  // Khách mới giao đi phải rời Khách mới của mình, chỉ còn ở Khách nhóm.
  const rows = [c('mine', 'me'), c('given', 'colleague'), c('given-q', 'colleague', '2026-10-01T00:00:00.000Z')];
  const ids = (group: 'new' | 'potential' | 'team') =>
    v1FilterCustomers(rows, group, { ...DEFAULT_FILTERS, status: 'all' }, 'me').map((x) => x.id);

  it('Khách mới chỉ còn khách mình phụ trách', () => {
    expect(ids('new')).toEqual(['mine']);
  });

  it('khách đã giao hiện ở Khách nhóm', () => {
    expect(ids('team').sort()).toEqual(['given', 'given-q']);
  });
});
