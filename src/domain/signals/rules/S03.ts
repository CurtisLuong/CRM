import { startOfDayMs, taskDueInfo } from '@/domain/deadlines';
import { DAY, dueTasks, make, taskEvidence } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S03',
  evaluate(c, ctx) {
    if (c.disqualified_at) return [];
    return dueTasks(c)
      .filter((t) => t.side !== 'customer' && Date.parse(t.due || '') < startOfDayMs(ctx.now) + DAY)
      .flatMap((t) => {
        const info = taskDueInfo(t, ctx.now);
        if (!info) return [];
        const s = make(
          'S03',
          c,
          'tasks',
          t.text || info.label,
          ['due', 'overdue'].includes(info.state) ? 'P0' : 'P1',
          ['complete', 'zalo'],
          { task: taskEvidence(t) },
          info.ms,
          [info.ms],
        );
        s.id += `:${t.key || t.at || t.due}:${t.text || ''}`;
        return [s];
      });
  },
} satisfies SignalRule;
