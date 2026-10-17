import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { lastTouchMs } from '@/domain/signals/shared';

describe('lastTouchMs', () => {
  it('uses the latest saved interaction as a contact touch', () => {
    const customer = {
      id: 'c1',
      owner_id: 'u1',
      full_name: 'Lan',
      phone: '0901234567',
      call_attempts: [{ at: '2026-10-12T00:00:00.000Z' }],
      interactions: [{ at: '2026-10-16T03:00:00.000Z', channel: 'visit', kind: 'project_view' }],
    } as Customer;
    expect(lastTouchMs(customer)).toBe(Date.parse('2026-10-16T03:00:00.000Z'));
  });
});
