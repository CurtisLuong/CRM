import type { Customer, Task } from '@/domain/customer';
import { countdownTag, startOfDayMs } from '@/domain/deadlines';

export const TASK_GROUPS = [
  { id: 'overdue', label: 'Quá hạn' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: '7 ngày tới' },
  { id: 'later', label: 'Sau đó' },
  { id: 'no_due', label: 'Chưa có hạn' },
  { id: 'done', label: 'Đã xong' },
] as const;
export type TaskGroupId = (typeof TASK_GROUPS)[number]['id'];
export type TaskSideFilter = 'all' | 'me' | 'customer';
export type TaskRow = { customer: Customer; task: Task; group: TaskGroupId };

function calendarDayDiff(dueMs: number, now: number) {
  const due = new Date(startOfDayMs(dueMs));
  const today = new Date(startOfDayMs(now));
  return Math.round(
    (Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86400000,
  );
}

/** Buckets active tasks using the shared D-010 countdown state and local calendar boundaries. */
export function groupTask(task: Task, now: number): TaskGroupId {
  if (task.done_at) return 'done';
  const dueMs = task.due ? Date.parse(task.due) : Number.NaN;
  const countdown = countdownTag(dueMs, dueMs, !!task.due_allday, now);
  if (!countdown) return 'no_due';
  if (countdown.state === 'missed') return 'overdue';
  // D-010's grace window remains actionable today even if the original date was yesterday.
  if (countdown.state === 'due') return 'today';
  const days = calendarDayDiff(dueMs, now);
  if (days <= 0) return 'today';
  return days <= 7 ? 'week' : 'later';
}

export function taskRows(customers: Customer[], now: number, kind = 'all', side: TaskSideFilter = 'all'): TaskRow[] {
  const rows: TaskRow[] = [];
  for (const customer of customers) {
    for (const task of Array.isArray(customer.next_tasks) ? customer.next_tasks : []) {
      if (!task) continue;
      if (kind !== 'all' && task.kind !== kind) continue;
      if (side !== 'all' && (task.side || 'me') !== side) continue;
      rows.push({ customer, task, group: groupTask(task, now) });
    }
  }
  const rank = new Map(TASK_GROUPS.map((group, index) => [group.id, index]));
  return rows.sort((a, b) => {
    const section = (rank.get(a.group) ?? 0) - (rank.get(b.group) ?? 0);
    if (section) return section;
    const aDue = a.task.due ? Date.parse(a.task.due) : Number.POSITIVE_INFINITY;
    const bDue = b.task.due ? Date.parse(b.task.due) : Number.POSITIVE_INFINITY;
    return aDue - bDue || (a.task.at || '').localeCompare(b.task.at || '');
  });
}
