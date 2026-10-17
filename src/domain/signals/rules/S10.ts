import { CARE_STAGE_BOOKING } from '@/config/stages';
import { normStage } from '@/domain/customer';
import { bookingSteps } from '@/domain/velocity';
import { make } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S10',
  evaluate(c, { now }) {
    if (normStage(c.care_stage) !== CARE_STAGE_BOOKING || !c.qualified_at || c.disqualified_at) return [];
    return bookingSteps(c, now)
      .filter((s) => s.due != null && ['warn', 'over'].includes(s.state))
      .map((s) => {
        const signal = make(
          'S10',
          c,
          undefined,
          `${s.label} · ${s.text}`,
          'P0',
          ['zalo', 'open_profile'],
          { booking_steps: c.booking_steps, care_stage_updated_at: c.care_stage_updated_at, step: s.key, due: s.due },
          s.due ?? undefined,
        );
        signal.id += `:${s.key}`;
        return signal;
      });
  },
} satisfies SignalRule;
