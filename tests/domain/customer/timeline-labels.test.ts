import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';

const base = { id: 'c1', owner_id: 'u1', full_name: 'Lan', phone: '0901234567' };

describe('customerTimeline call labels', () => {
  it('shows the label for each stored call result instead of the code', () => {
    const customer = {
      ...base,
      call_attempts: [
        { at: '2026-10-09T04:00:00.000Z', result: 'talked' },
        { at: '2026-10-09T03:00:00.000Z', result: 'busy' },
        { at: '2026-10-09T02:00:00.000Z', result: 'no_answer' },
        { at: '2026-10-09T01:00:00.000Z', result: 'xyz' },
      ],
    } as Customer;
    const entries = customerTimeline(customer);
    expect(entries.map((entry) => entry.title)).toEqual([
      'Nói chuyện được',
      'Bận, hẹn gọi lại',
      'Không nghe máy',
      'Kết quả khác',
    ]);
  });

  it('keeps the no-result title for a null call result', () => {
    const entries = customerTimeline({
      ...base,
      call_attempts: [{ at: '2026-10-09T02:00:00.000Z', result: null }],
    } as Customer);
    expect(entries.map((entry) => entry.title)).toEqual(['Cuộc gọi chưa ghi kết quả']);
  });
});
