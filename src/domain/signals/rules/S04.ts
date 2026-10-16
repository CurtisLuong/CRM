import { taskDueInfo } from '@/domain/deadlines';
import { dueTasks, make, taskEvidence } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S04',
  evaluate(c, ctx) {
    if (c.disqualified_at) return [];
    return dueTasks(c)
      .filter((t) => t.side === 'customer' && taskDueInfo(t, ctx.now)?.state === 'overdue')
      .map((t) => {
        const s = make(
          'S04',
          c,
          'tasks',
          t.text || 'Khách hẹn trả lời đã quá hạn',
          'P1',
          ['call'],
          { task: taskEvidence(t) },
          Date.parse(t.due || ''),
          [Date.parse(t.due || '')],
        );
        s.id += `:${t.key || t.at || t.due}:${t.text || ''}`;
        return s;
      });
  },
} satisfies SignalRule;
