import { CARE_STAGE_DROPPED } from '@/config/stages';
import { isQualified, parseDob } from '@/domain/customer';
import { startOfDayMs } from '@/domain/deadlines';
import { C, DAY, make } from '../shared';
import type { SignalRule } from '../types';

export default {
  id: 'S15',
  evaluate(c, { now }) {
    const dob = parseDob(c.dob);
    if (!dob || !isQualified(c) || c.care_stage === CARE_STAGE_DROPPED || c.contact_prefs?.do_not_contact) return [];
    const date = new Date(now);
    date.setMonth(dob.month - 1, dob.day);
    date.setHours(0, 0, 0, 0);
    if (date.getTime() < startOfDayMs(now)) date.setFullYear(date.getFullYear() + 1);
    const days = Math.round((date.getTime() - startOfDayMs(now)) / DAY);
    if (days > C.birthdayDays) return [];
    return [
      make(
        'S15',
        c,
        undefined,
        days === 0 ? 'Sinh nhật hôm nay' : `Sinh nhật sau ${days} ngày`,
        'P2',
        ['zalo', 'open_profile'],
        { dob: c.dob, due_at: date.toISOString() },
        date.getTime(),
        [days],
      ),
    ];
  },
} satisfies SignalRule;
