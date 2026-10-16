import { status } from '@/domain/velocity';
import { active, make } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S05',
  evaluate(c, { now }) {
    const st = status(c, now);
    if (!st || st.state === 'ok') return [];
    const s = make(
      'S05',
      c,
      active(c) && st.state === 'over' ? 'sla' : undefined,
      `${st.label} · ${st.text}`,
      st.key === 'new_lead' ? 'P0' : 'P1',
      ['open_profile'],
      { phase: st.key, start: st.start, care_stage: c.care_stage, sla_anchor_at: c.sla_anchor_at },
      st.start + (st.state === 'over' ? st.max : st.target),
      [-(st.elapsed - st.max)],
    );
    if (st.state === 'over')
      s.notification = { ruleKey: 'sla_over', level: st.key === 'new_lead' ? 'urgent' : 'warn', sortAt: st.start };
    return [s];
  },
} satisfies SignalRule;
