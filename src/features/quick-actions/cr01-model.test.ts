import { describe, expect, it, vi } from 'vitest';
import type { CallResult } from '@/config/callResults';
import type { CustomerRepository } from '@/data/repositories/customers';
import type { Customer } from '@/domain/customer';
import { callSuggestion, initialCallResult, nextModeFor, saveCall } from './model';

const NOW = Date.parse('2026-11-05T10:00:00+07:00');
const customer = {
  id: 'cr01-lead',
  owner_id: 'cr01-user',
  full_name: 'Khách thử',
  phone: '0901234567',
  qualified_at: null,
  registered_at: '2026-11-04T01:00:00.000Z',
  call_attempts: [{ at: '2026-11-04T02:00:00.000Z', result: 'hung_up', note: null }],
} as Customer;

describe('CR-01 — chọn sẵn theo thời lượng máy', () => {
  it.each([
    { seconds: 75, result: 'talked', kind: 'schedule', mode: 'suggested' },
    { seconds: 60, result: 'talked', kind: 'schedule', mode: 'suggested' },
    { seconds: 59, result: 'busy', kind: 'ask', mode: 'custom' },
    { seconds: 1, result: 'busy', kind: 'ask', mode: 'custom' },
    { seconds: 0, result: 'no_answer', kind: 'schedule', mode: 'suggested' },
    { seconds: undefined, result: null, kind: undefined, mode: 'suggested' },
    { seconds: null, result: null, kind: undefined, mode: 'suggested' },
  ] as const)('$seconds giây → $result và bước tiếp theo $kind', ({ seconds, result, kind, mode }) => {
    const draft = { at: new Date(NOW).toISOString(), duration: seconds };
    const selected = initialCallResult(draft);
    expect(selected).toBe(result);
    const suggestion = callSuggestion(customer, draft, selected, NOW);
    expect(suggestion?.kind).toBe(kind);
    expect(nextModeFor(suggestion)).toBe(mode);
  });

  it.each(['talked', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'hung_up', 'line_busy'] as CallResult[])(
    'giữ kết quả %s đã ghi dù thời lượng mâu thuẫn',
    (recorded) => {
      for (const duration of [75, 0, undefined])
        expect(initialCallResult({ at: new Date(NOW).toISOString(), duration }, recorded)).toBe(recorded);
    },
  );

  it('không dùng thời gian rời app để suy kết quả ghi tay', () => {
    expect(initialCallResult({ at: new Date(NOW).toISOString(), estimateSec: 75, origin: 'manual' })).toBeNull();
  });

  it('lưu lần cúp máy thứ hai bằng patch loại, không tạo lịch hay ghi chú nhắn Zalo', async () => {
    const logCall = vi.fn(async () => customer);
    const repo = {
      sync: { local: { userId: customer.owner_id } },
      get: vi.fn(async () => customer),
      logCall,
    } as unknown as CustomerRepository;
    const draft = { at: new Date(NOW).toISOString() };
    const suggestion = callSuggestion(customer, draft, 'hung_up', NOW);
    expect(nextModeFor(suggestion)).toBe('drop');
    await saveCall(repo, customer.id, draft, 'hung_up', '', nextModeFor(suggestion), null, NOW);
    expect(logCall).toHaveBeenCalledExactlyOnceWith(
      customer.id,
      expect.objectContaining({ result: 'hung_up' }),
      expect.objectContaining({
        patch: {
          disqualified_at: new Date(NOW).toISOString(),
          disqualify_reason: 'cup_may',
          disqualify_note: 'Cúp máy 2 lần liên tiếp → chuyển Loại "Cúp máy".',
          next_call_at: null,
          next_call_end: null,
          next_call_reason: null,
        },
      }),
    );
  });
});
