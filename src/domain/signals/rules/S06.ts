import { callAttemptsOf } from '@/domain/customer';
import { C, futureCall, HOUR, make, openLead } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S06',
  evaluate(c, { now }) {
    if (!openLead(c) || futureCall(c, now)) return [];
    const calls = callAttemptsOf(c),
      last = calls.at(-1),
      talked = calls.filter((a) => a.result === 'talked').at(-1);
    if (
      !last ||
      !Number.isFinite(Date.parse((talked || last).at)) ||
      now - Date.parse((talked || last).at) < C.leadRetryHours * HOUR ||
      !Number.isFinite(Date.parse(last.at))
    )
      return [];
    return [
      make(
        'S06',
        c,
        talked ? 'decide' : 'retry',
        talked ? 'Đã nói chuyện — chờ phân loại' : `Đã gọi ${calls.length} lần`,
        'P1',
        talked ? ['classify'] : ['call'],
        { calls },
        Date.parse(last.at),
        talked ? [] : [calls.length, Date.parse(last.at)],
      ),
    ];
  },
} satisfies SignalRule;
