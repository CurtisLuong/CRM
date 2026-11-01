import type { Customer, Task } from '@/domain/customer';
import { type CountdownState, countdownTag, startOfDayMs } from '@/domain/deadlines';

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
export type TaskRow =
  | { type: 'task'; customer: Customer; task: Task; group: TaskGroupId }
  | {
      type: 'call';
      customer: Customer;
      appointment: { start: string; end?: string | null; reason?: string | null };
      group: TaskGroupId;
    };

/** Màu vạch trái + chữ hạn trên thẻ việc (D-023): đỏ quá hạn, vàng sắp/đến hạn. */
export type TaskCardTone = 'over' | 'soon';

export type TaskTiming = {
  state: CountdownState;
  /** Vạch trái chỉ tô khi thật sự gấp; việc còn xa không có vạch. */
  tone?: TaskCardTone;
  /** Mốc bắt đầu để in ngày: việc = hạn, hẹn gọi = giờ bắt đầu. */
  startMs: number;
  /** Mốc kết thúc dùng cho khoảng quá hạn của hẹn gọi. */
  endMs: number;
  allDay: boolean;
  /** Nhãn đếm ngược của D-010 ("quá hạn", "còn 2 ngày"…). */
  text: string;
};

/**
 * Thời hạn của một dòng việc dùng đúng `countdownTag` (D-010) — không tự tính lại.
 * `null` khi không có hạn hoặc hạn hỏng.
 */
export function taskTiming(row: TaskRow, now: number): TaskTiming | null {
  const startMs =
    row.type === 'call' ? Date.parse(row.appointment.start) : row.task.due ? Date.parse(row.task.due) : Number.NaN;
  const endMs = row.type === 'call' && row.appointment.end ? Date.parse(row.appointment.end) : startMs;
  const allDay = row.type === 'task' && !!row.task.due_allday;
  const tag = countdownTag(startMs, endMs, allDay, now);
  if (!tag) return null;
  const tone = tag.state === 'missed' ? 'over' : tag.state === 'due' || tag.state === 'soon' ? 'soon' : undefined;
  return { state: tag.state, tone, startMs, endMs, allDay, text: tag.text };
}

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

/** A scheduled call is a commitment row, not a synthetic next_tasks entry. */
export function groupCall(start: string, end: string | null | undefined, now: number): TaskGroupId {
  const startMs = Date.parse(start);
  const endMs = end ? Date.parse(end) : startMs;
  const countdown = countdownTag(startMs, endMs, false, now);
  if (!countdown) return 'no_due';
  if (countdown.state === 'missed') return 'overdue';
  if (countdown.state === 'due') return 'today';
  const days = calendarDayDiff(startMs, now);
  if (days <= 0) return 'today';
  return days <= 7 ? 'week' : 'later';
}

export function taskRows(customers: Customer[], now: number, kind = 'all', side: TaskSideFilter = 'all'): TaskRow[] {
  const rows: TaskRow[] = [];
  for (const customer of customers) {
    if (customer.disqualified_at) continue;
    const callStart = customer.next_call_at;
    if (callStart && (kind === 'all' || kind === 'call') && side === 'all') {
      rows.push({
        type: 'call',
        customer,
        appointment: {
          start: callStart,
          end: customer.next_call_end,
          reason: customer.next_call_reason,
        },
        group: groupCall(callStart, customer.next_call_end, now),
      });
    }
    for (const task of Array.isArray(customer.next_tasks) ? customer.next_tasks : []) {
      if (!task) continue;
      if (kind === 'call') continue;
      if (kind !== 'all' && task.kind !== kind) continue;
      if (side !== 'all' && (task.side || 'me') !== side) continue;
      rows.push({ type: 'task', customer, task, group: groupTask(task, now) });
    }
  }
  const rank = new Map(TASK_GROUPS.map((group, index) => [group.id, index]));
  return rows.sort((a, b) => {
    const section = (rank.get(a.group) ?? 0) - (rank.get(b.group) ?? 0);
    if (section) return section;
    const due = (row: TaskRow) => {
      if (row.type === 'call') return Date.parse(row.appointment.start);
      return row.task.due ? Date.parse(row.task.due) : Number.POSITIVE_INFINITY;
    };
    const identity = (row: TaskRow) => (row.type === 'call' ? row.appointment.start : row.task.at || '');
    return due(a) - due(b) || identity(a).localeCompare(identity(b));
  });
}
