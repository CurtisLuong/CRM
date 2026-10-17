import { SIGNALS_CONFIG as C } from '@/config/signals';
import { CARE_STAGE_NURTURE } from '@/config/stages';
import { DAY } from '@/config/velocity';
import { normStage } from '@/domain/customer';
import { startOfDayMs } from '@/domain/deadlines';
import { make } from '../shared';
import type { SignalRule } from '../types';

export default {
  id: 'S18',
  evaluate(c, { now }) {
    const due = Date.parse(c.next_call_at || '');
    if (
      normStage(c.care_stage) !== CARE_STAGE_NURTURE ||
      c.contact_prefs?.do_not_contact ||
      !Number.isFinite(due) ||
      due < startOfDayMs(now) + DAY ||
      due > now + C.nurtureCallbackReminderDays * DAY
    )
      return [];
    return [
      make(
        'S18',
        c,
        undefined,
        `Khách nuôi dài hạn đến hạn gọi lại trong ${Math.max(1, Math.ceil((due - now) / DAY))} ngày`,
        'P1',
        ['call', 'zalo'],
        { care_stage: c.care_stage, next_call_at: c.next_call_at, next_call_reason: c.next_call_reason },
        due,
        [due],
      ),
    ];
  },
} satisfies SignalRule;
