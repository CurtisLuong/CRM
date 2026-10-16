import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { stageEnteredAt } from '@/domain/velocity/engine';
import { bookingStepPatch, contactPrefsPatch } from '@/features/profile/model';

const customer = {
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Lan',
  phone: '0901234567',
  care_stage: 'Booking & Làm hồ sơ',
  care_stage_updated_at: '2026-10-01T00:00:00.000Z',
  care_stage_history: [{ stage: 'Booking & Làm hồ sơ', at: '2026-10-01T00:00:00.000Z', x_source: 'import' }],
  booking_steps: { legacy_step: '2026-10-02T00:00:00.000Z', x_future: 'kept' },
  contact_prefs: { channel: 'Zalo', slot: 'Tối', x_extension: { keep: true } },
} as Customer;

describe('profile patches', () => {
  it('updates a booking step without changing Booking stage history or SLA start', () => {
    const beforeStart = stageEnteredAt(customer);
    const patch = bookingStepPatch(customer, 'cu_tru', true, '2026-10-16T00:00:00.000Z');
    const updated = { ...customer, ...patch };

    expect(patch).toStrictEqual({
      booking_steps: { legacy_step: '2026-10-02T00:00:00.000Z', x_future: 'kept', cu_tru: '2026-10-16T00:00:00.000Z' },
    });
    expect(stageEnteredAt(updated)).toBe(beforeStart);
    expect(updated.care_stage_history).toStrictEqual(customer.care_stage_history);
    expect(updated.care_stage_updated_at).toBe(customer.care_stage_updated_at);
  });

  it('can clear a booking step while preserving other and unknown booking keys', () => {
    expect(bookingStepPatch(customer, 'legacy_step', false, '2026-10-16T00:00:00.000Z')).toStrictEqual({
      booking_steps: { x_future: 'kept' },
    });
  });

  it('patches channel and slot independently while retaining unknown contact preference keys', () => {
    expect(contactPrefsPatch(customer, 'channel', 'Điện thoại')).toStrictEqual({
      contact_prefs: { channel: 'Điện thoại', slot: 'Tối', x_extension: { keep: true } },
    });
    expect(contactPrefsPatch(customer, 'slot', 'Sáng')).toStrictEqual({
      contact_prefs: { channel: 'Zalo', slot: 'Sáng', x_extension: { keep: true } },
    });
  });
});
