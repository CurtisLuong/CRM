import { callAttemptsOf } from '@/domain/customer';
import { make } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S09',
  evaluate(c) {
    const calls = callAttemptsOf(c).filter((a) => !a.result),
      last = calls.at(-1);
    if (!last || !Number.isFinite(Date.parse(last.at))) return [];
    const s = make(
      'S09',
      c,
      'pending',
      `${calls.length} cuộc chưa ghi kết quả`,
      'P1',
      ['record_call'],
      { calls },
      Date.parse(last.at),
    );
    s.notification = { ruleKey: 'call_pending', level: 'warn', sortAt: Date.parse(last.at) };
    return [s];
  },
} satisfies SignalRule;
