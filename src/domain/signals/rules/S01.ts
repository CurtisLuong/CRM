import { callAttemptsOf } from '@/domain/customer';
import { status } from '@/domain/velocity';
import { futureCall, make, openLead } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S01',
  evaluate(c, { now }) {
    if (!openLead(c) || futureCall(c, now) || callAttemptsOf(c).length) return [];
    const registered = Date.parse(c.registered_at || c.created_at || '');
    if (!Number.isFinite(registered)) return [];
    const st = status(c, now);
    return [
      make(
        'S01',
        c,
        'new',
        st?.text || 'Chưa gọi lần đầu',
        'P0',
        ['call'],
        { registered_at: c.registered_at, created_at: c.created_at, sla_anchor_at: c.sla_anchor_at },
        st ? st.start + st.max : registered,
        [-registered],
      ),
    ];
  },
} satisfies SignalRule;
