import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { factFreshness, factPatch } from '@/domain/customer/facts';

const base = {
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Lan',
  phone: '0901234567',
  field_meta: { finance: { at: '2026-01-01', by: 'import', confirmed: true, legacy: 'keep' }, custom: { x: 1 } },
} as unknown as Customer;

describe('customer fact metadata', () => {
  it('adds sale provenance for a field and retains existing/unknown metadata', () => {
    expect(factPatch(base, 'finance', 700_000_000, 'sale', '2026-10-17T00:00:00Z')).toStrictEqual({
      finance: 700_000_000,
      field_meta: {
        finance: { at: '2026-10-17T00:00:00Z', by: 'sale', confirmed: true, legacy: 'keep' },
        custom: { x: 1 },
      },
    });
  });

  it('marks imported facts older than 90 days for confirmation', () => {
    expect(factFreshness('2026-01-01T00:00:00Z', Date.parse('2026-04-10T00:00:00Z')).stale).toBe(true);
    expect(factFreshness('2026-04-01T00:00:00Z', Date.parse('2026-04-10T00:00:00Z')).stale).toBe(false);
    expect(factFreshness(null).label).toContain('chưa ghi');
  });
});
