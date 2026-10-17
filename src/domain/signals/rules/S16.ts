import { SIGNALS_CONFIG as C } from '@/config/signals';
import { CARE_STAGE_WON } from '@/config/stages';
import { DAY } from '@/config/velocity';
import { normStage } from '@/domain/customer';
import { startOfDayMs } from '@/domain/deadlines';
import { make } from '../shared';
import type { SignalRule } from '../types';

export default {
  id: 'S16',
  evaluate(c, { now }) {
    if (c.contact_prefs?.do_not_contact) return [];
    const milestones = (Array.isArray(c.care_stage_history) ? c.care_stage_history : [])
      .filter(
        (item): item is NonNullable<typeof item> =>
          !!item && normStage(item.stage) === CARE_STAGE_WON && Number.isFinite(Date.parse(item.at || '')),
      )
      .map((item) => ({ at: item.at as string, value: Date.parse(item.at || '') }));
    if (
      normStage(c.care_stage) === CARE_STAGE_WON &&
      c.care_stage_updated_at &&
      Number.isFinite(Date.parse(c.care_stage_updated_at))
    ) {
      milestones.push({ at: c.care_stage_updated_at, value: Date.parse(c.care_stage_updated_at) });
    }
    const unique = [...new Map(milestones.map((milestone) => [milestone.value, milestone])).values()];
    const today = startOfDayMs(now);
    return unique.flatMap((milestone) => {
      const day = Math.round((today - startOfDayMs(milestone.value)) / DAY);
      const target = C.postPurchaseMilestonesDays.find(
        (value) => Math.abs(day - value) <= C.postPurchaseMilestoneWindowDays,
      );
      if (target == null) return [];
      const signal = make(
        'S16',
        c,
        undefined,
        `Đã mua ${target} ngày · xin giới thiệu`,
        'P2',
        ['call', 'open_profile'],
        { purchased_at: milestone.at, milestone_days: target },
        startOfDayMs(milestone.value) + target * DAY,
        [target],
      );
      signal.id += `:${target}`;
      return [signal];
    });
  },
} satisfies SignalRule;
