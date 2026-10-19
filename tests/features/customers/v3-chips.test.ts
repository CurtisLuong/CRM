import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerGroupCounts } from '@/features/customers/model';

const c = (id: string, owner_id: string | undefined, qualified_at?: string) =>
  ({ id, owner_id, full_name: id, phone: '0901234567', qualified_at }) as Customer;

describe('customerGroupCounts', () => {
  it('đếm khách của tôi theo tiềm năng/khách mới và khách đồng nghiệp', () => {
    expect(
      customerGroupCounts(
        [
          c('a', 'u', '2026-10-01T00:00:00.000Z'),
          c('b', 'u', '2026-10-02T00:00:00.000Z'),
          c('c', 'u'),
          c('d', 'other', '2026-10-03T00:00:00.000Z'),
          c('e', undefined),
        ],
        'u',
      ),
    ).toEqual({ potential: 2, leads: 1, team: 1 });
  });

  it('chưa đăng nhập (ownerId rỗng) → không có khách của tôi', () => {
    expect(customerGroupCounts([c('a', 'u', '2026-10-01T00:00:00.000Z'), c('b', undefined)], '')).toEqual({
      potential: 0,
      leads: 0,
      team: 1,
    });
  });
});
