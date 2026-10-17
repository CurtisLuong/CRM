import { countdownTag, startOfDayMs } from '@/domain/deadlines';
import { callStart, DAY, make } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S02',
  evaluate(c, { now }) {
    const start = callStart(c);
    if (!Number.isFinite(start) || start >= startOfDayMs(now) + DAY) return [];
    if (c.disqualified_at && start > now) return [];
    const cd = countdownTag(start, Date.parse(c.next_call_end || c.next_call_at || ''), false, now);
    const s = make(
      'S02',
      c,
      c.disqualified_at ? undefined : start <= now ? 'due' : 'today',
      cd?.text || '',
      start <= now ? 'P0' : 'P1',
      ['call'],
      { next_call_at: c.next_call_at, next_call_end: c.next_call_end, next_call_reason: c.next_call_reason },
      start,
      [start],
    );
    if (start <= now) s.notification = { ruleKey: 'call_due', level: 'urgent', sortAt: start };
    return [s];
  },
} satisfies SignalRule;
