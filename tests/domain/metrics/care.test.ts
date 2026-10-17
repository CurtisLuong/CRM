import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { careHealth, fullCareMetrics, workingElapsedMs } from '@/domain/metrics/care';

const now = new Date(2026, 9, 17, 12, 0).getTime();
const at = (days: number, hour = 10, minute = 0) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const customer = (id: string, patch: Partial<Customer> = {}) =>
  ({
    id,
    owner_id: 'owner',
    full_name: id,
    phone: '0900000000',
    care_stage: 'Đăng kí mới',
    registered_at: at(-5, 8),
    created_at: at(-5, 8),
    call_attempts: [],
    next_tasks: [],
    ...patch,
  }) as unknown as Customer;

describe('T6.4 full care metrics', () => {
  it('calculates first-call duration in configured working hours across closing', () => {
    const from = new Date(2026, 9, 16, 21, 0).getTime();
    const to = new Date(2026, 9, 17, 9, 0).getTime();
    expect(workingElapsedMs(from, to)).toBe(3 * 60 * 60_000);
    expect(workingElapsedMs(to, from)).toBeNull();
  });

  it('uses called leads as the contact-rate denominator and counts converted leads at call time', () => {
    const result = fullCareMetrics(
      [
        customer('talked-converted', { qualified_at: at(-1), call_attempts: [{ at: at(-2), result: 'talked' }] }),
        customer('not-talked', { call_attempts: [{ at: at(-2), result: 'no_answer' }] }),
        customer('not-called'),
      ],
      now,
    );
    expect(result.contactRate).toMatchObject({ numerator: 1, denominator: 2, percent: 50 });
    expect(result.contactRate.customerIds).toContain('talked-converted');
  });

  it('measures promise keeping from original due date and excludes completed promises from overdue', () => {
    const result = fullCareMetrics(
      [
        customer('kept', {
          next_tasks: [
            { at: 'done', text: 'Gửi hồ sơ', side: 'me', due: at(-3), due_original: at(-4), done_at: at(-4, 10, 20) },
          ],
        }),
        customer('late-open', {
          next_tasks: [{ at: 'open', text: 'Gọi lại', side: 'me', due: at(2), due_original: at(-2) }],
        }),
      ],
      now,
    );
    expect(result.promises.kept).toMatchObject({ numerator: 1, denominator: 2, percent: 50 });
    expect(result.promises.overdue).toMatchObject({ numerator: 1, denominator: 1 });
    expect(result.promises.kept.customerIds).toContain('kept');
  });

  it('returns per-customer health with a human-readable reason', () => {
    const healthy = customer('healthy', {
      qualified_at: at(-10),
      care_stage: 'Đang chăm sóc',
      care_stage_updated_at: at(-1),
      call_attempts: [{ at: at(-1), result: 'talked' }],
    });
    expect(careHealth(healthy, now)).toMatchObject({ health: 'ok', reason: expect.stringContaining('7 ngày') });
    expect(careHealth(customer('empty', { created_at: undefined, registered_at: undefined }), now)).toMatchObject({
      health: 'unknown',
      reason: expect.stringContaining('Chưa có'),
    });
  });

  it('caps weekly rule-based lessons at three and exposes denominators and drill-down IDs', () => {
    const people = Array.from({ length: 12 }, (_, index) =>
      customer(`lead-${index}`, {
        call_attempts: [{ at: at(-1, 9), result: index < 10 ? 'no_answer' : 'talked' }],
      }),
    );
    const result = fullCareMetrics(people, now);
    expect(result.lessons.length).toBeLessThanOrEqual(3);
    expect(result.lessons.every((lesson) => lesson.denominator >= 5 && lesson.customerIds.length > 0)).toBe(true);
  });
});
