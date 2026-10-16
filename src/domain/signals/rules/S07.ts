import { openTasksOf } from '@/domain/customer';
import { active, C, futureCall, idleDays, lastTouchMs, make } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S07',
  evaluate(c, { now }) {
    if (!active(c) || futureCall(c, now)) return [];
    const idle = idleDays(c, now),
      interest = Number(c.interest_level) || 0,
      out = [];
    const evidence = { lastTouch: lastTouchMs(c), interest_level: interest, care_stage: c.care_stage };
    if (interest < C.hotInterestMin && idle >= C.idleWarmDays)
      out.push(
        make('S07', c, 'warm', `${idle} ngày chưa liên hệ`, 'P2', ['call', 'schedule'], evidence, undefined, [-idle]),
      );
    if (!openTasksOf(c).length)
      out.push(
        make('S07', c, 'nonext', 'Chưa có việc tiếp theo', 'P1', ['schedule'], evidence, undefined, [-interest, -idle]),
      );
    return out;
  },
} satisfies SignalRule;
