import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { editedTimelineNotePatch } from '@/features/profile/route';

describe('profile timeline note saves', () => {
  const customer = {
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Lan',
    phone: '0901234567',
    notes_manual: [{ at: '2026-10-02T00:00:00.000Z', text: '  giữ nguyên  ', x_imported: true }],
    care_stage_history: [{ stage: 'Booking', at: '2026-10-01T00:00:00.000Z', x_source: 'import' }],
  } as Customer;

  it('returns no patch when the text is unchanged, preserving the exact stored payload', () => {
    expect(editedTimelineNotePatch(customer, 'note:2026-10-02T00:00:00.000Z:0', '  giữ nguyên  ', 'now')).toBeNull();
    expect(customer.notes_manual?.[0]).toStrictEqual({
      at: '2026-10-02T00:00:00.000Z',
      text: '  giữ nguyên  ',
      x_imported: true,
    });
  });

  it('preserves exact edited text, event time, and unknown fields for both note types', () => {
    expect(
      editedTimelineNotePatch(customer, 'note:2026-10-02T00:00:00.000Z:0', '  mới  ', 'edited-time'),
    ).toStrictEqual({
      notes_manual: [{ at: '2026-10-02T00:00:00.000Z', text: '  mới  ', x_imported: true, edited_at: 'edited-time' }],
    });
    expect(
      editedTimelineNotePatch(customer, 'stage:2026-10-01T00:00:00.000Z:0', '  nội dung  ', 'edited-time'),
    ).toStrictEqual({
      care_stage_history: [
        {
          stage: 'Booking',
          at: '2026-10-01T00:00:00.000Z',
          x_source: 'import',
          note: '  nội dung  ',
          edited_at: 'edited-time',
        },
      ],
    });
  });
});
