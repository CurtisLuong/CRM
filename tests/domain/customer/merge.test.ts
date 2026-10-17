import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import {
  buildCustomerMerge,
  detectDuplicatePairs,
  findDuplicateCandidates,
  similarCustomerNames,
} from '@/domain/customer/merge';

const row = (overrides: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    owner_id: 'owner-1',
    phone: '0912345678',
    full_name: 'Nguyễn Thị Mai',
    source: ['facebook_ads'],
    notes_manual: [{ at: 'a', text: 'note', custom: 1 }],
    care_stage_history: [{ stage: 'Đăng kí mới', at: 'a', source: 'v1' }],
    advanced: { old_extension: { retain: true } },
    future_json: { retain: true },
    ...overrides,
  }) as Customer;

describe('S17 duplicate detection and approved merge payload', () => {
  it('requires normalized phone and a near Vietnamese name, and excludes the edited record', () => {
    const a = row();
    const b = row({ id: 'c2', phone: '+84 912 345 678', full_name: 'Nguyen Thi Mai' });
    expect(similarCustomerNames(a.full_name, b.full_name)).toBe(true);
    expect(findDuplicateCandidates([a, b], '0912.345.678', 'Nguyễn Thị Mai', 'c1').map((item) => item.id)).toEqual([
      'c2',
    ]);
    expect(findDuplicateCandidates([row({ id: 'c3', phone: '0900000000' })], a.phone, a.full_name)).toEqual([]);
    expect(findDuplicateCandidates([row({ id: 'c4', full_name: 'Nguyễn Thị Lan' })], a.phone, a.full_name)).toEqual([]);
    expect(detectDuplicatePairs([a, b])).toHaveLength(1);
  });

  it('keeps keeper values, fills blanks, unions source, joins history arrays and preserves unknown JSON', () => {
    const keeper = row({
      source: ['facebook_ads'],
      notes_manual: [
        { at: 'a', text: 'same' },
        { at: 'b', text: 'keep' },
      ],
    });
    const duplicate = row({
      id: 'c2',
      full_name: 'Mai Nguyễn',
      source: 'referral',
      phone: '0912345678',
      income: '25 triệu',
      notes_manual: [
        { at: 'a', text: 'same' },
        { at: 'c', text: 'other' },
      ],
      care_stage_history: [{ stage: 'Booking', at: 'c', provenance: 'old-import' }],
      future_json: { from_duplicate: true },
    });
    const result = buildCustomerMerge(keeper, duplicate, '2026-10-17T00:00:00.000Z');
    expect(result.keeper).toMatchObject({
      source: ['facebook_ads', 'referral'],
      income: '25 triệu',
      notes_manual: [
        { at: 'a', text: 'same' },
        { at: 'b', text: 'keep' },
        { at: 'a', text: 'same' },
        { at: 'c', text: 'other' },
      ],
      care_stage_history: [
        { stage: 'Đăng kí mới', at: 'a', source: 'v1' },
        { stage: 'Booking', at: 'c', provenance: 'old-import' },
      ],
      future_json: { retain: true },
    });
    expect(result.duplicate).toMatchObject({ id: 'c2', archived_at: '2026-10-17T00:00:00.000Z' });
    expect(result.keeperPatch).toHaveProperty('notes_manual');
    expect(result.duplicatePatch).toEqual({
      archived_at: '2026-10-17T00:00:00.000Z',
      updated_at: '2026-10-17T00:00:00.000Z',
    });
  });
});
