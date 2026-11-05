import { describe, expect, it } from 'vitest';
import type { CallResult } from '@/config/callResults';
import type { Customer } from '@/domain/customer';
import { afterCall, windowAfter } from '@/domain/followup';

const NOW = Date.parse('2026-11-05T10:00:00+07:00');
const lead = {
  id: 'cr01-lead',
  owner_id: 'cr01-user',
  full_name: 'Khách thử',
  phone: '0901234567',
  registered_at: '2026-11-04T08:00:00+07:00',
  qualified_at: null,
  care_stage: 'Đang tiếp cận',
} as Customer;
const calls = (results: Array<CallResult | null>) =>
  results.map((result, i) => ({ at: new Date(NOW - (results.length - i) * 3_600_000).toISOString(), result }));
const drop = {
  kind: 'drop',
  code: 'cup_may',
  auto: true,
  text: 'Cúp máy 2 lần liên tiếp → chuyển Loại "Cúp máy".',
  fallback: null,
};

describe('CR-01 — hai cuộc gần nhất cúp máy', () => {
  it.each([
    { results: ['hung_up'], next: 2 },
    { results: ['no_answer', 'hung_up'], next: 3 },
    { results: ['hung_up', 'no_answer', 'hung_up'], next: 4 },
  ] as const)('khách mới $results giữ nhịp gọi lần $next', ({ results, next }) => {
    const suggestion = afterCall(lead, calls([...results]), NOW);
    expect(suggestion?.kind).toBe('schedule');
    if (suggestion?.kind !== 'schedule') throw new Error('Thiếu lịch gọi lại');
    expect(suggestion.reason).toContain(`Gọi lần ${next} ·`);
    expect(+suggestion.start).toBeGreaterThan(NOW);
  });

  it.each([
    ['hung_up', 'hung_up'],
    ['no_answer', 'no_answer', 'no_answer', 'hung_up', 'hung_up'],
  ] satisfies CallResult[][])('khách mới %j ưu tiên loại Cúp máy', (...results) => {
    expect(afterCall(lead, calls(results), NOW)).toEqual(drop);
  });

  it('khách Tiềm năng vẫn giãn hai ngày và đổi khung', () => {
    const qualified = { ...lead, qualified_at: '2026-11-01T03:00:00.000Z', care_stage: 'Đang chăm sóc' };
    expect(afterCall(qualified, calls(['hung_up', 'hung_up']), NOW)).toMatchObject({
      kind: 'schedule',
      ...windowAfter(qualified, 2, 'alt', NOW),
      reason: 'Gọi lại (lần 3)',
    });
  });

  it('cuộc chưa ghi kết quả ở giữa ngắt chuỗi cúp máy', () => {
    expect(afterCall(lead, calls(['hung_up', null, 'hung_up']), NOW)?.kind).toBe('schedule');
  });

  it('năm cuộc không nghe vẫn loại Không liên lạc được', () => {
    expect(afterCall(lead, calls(Array<CallResult>(5).fill('no_answer')), NOW)).toMatchObject({
      kind: 'drop',
      code: 'khong_lien_lac_duoc',
      auto: true,
    });
  });
});
