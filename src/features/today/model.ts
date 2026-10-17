import { CAPACITY_CONFIG } from '@/config/capacity';
import { type CallSlotKey, FOLLOWUP_CONFIG } from '@/config/followup';
import type { Customer, Task } from '@/domain/customer';
import { computeSignals, type Signal } from '@/domain/signals';

export type QueueFilter = 'priority' | 'new' | 'promise' | 'opportunity';
export type QueueRow = { signal: Signal; customer: Customer; minutes: number };
export type CapacitySnoozeCandidate = { customer: Customer; task: Task };

/** Start of the next configured calling slot, using local time like D-005. */
export function nextCallSlotStart(now: number, notBefore = now): number {
  const slots = Object.values(FOLLOWUP_CONFIG.callSlots)
    .map(({ range }) => Number(range.slice(0, 2)) * 60 + Number(range.slice(3, 5)))
    .sort((a, b) => a - b);
  const current = new Date(Math.max(now, notBefore));
  const minute = current.getHours() * 60 + current.getMinutes();
  const next = slots.find((start) => start > minute);
  if (next === undefined) current.setDate(current.getDate() + 1);
  const targetMinute = next ?? slots[0] ?? 9 * 60;
  current.setHours(Math.floor(targetMinute / 60), targetMinute % 60, 0, 0);
  return current.getTime();
}

/** Capacity can move one future all-day task per suggested P2 row; never move customer promises. */
export function capacitySnoozeCandidates(rows: readonly QueueRow[], now: number): CapacitySnoozeCandidate[] {
  const today = new Date(now);
  const result: CapacitySnoozeCandidate[] = [];
  const seen = new Set<string>();
  for (const { customer } of rows) {
    const task = (Array.isArray(customer.next_tasks) ? customer.next_tasks : []).find((entry) => {
      if (!entry || entry.done_at || entry.side === 'customer' || !entry.due || !entry.due_allday) return false;
      const due = new Date(entry.due);
      return (
        due.getFullYear() > today.getFullYear() ||
        (due.getFullYear() === today.getFullYear() && due.getMonth() > today.getMonth()) ||
        (due.getFullYear() === today.getFullYear() &&
          due.getMonth() === today.getMonth() &&
          due.getDate() > today.getDate())
      );
    });
    if (!task?.at) continue;
    const key = `${customer.id}:${task.key || task.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ customer, task });
  }
  return result;
}
export function queueRows(customers: readonly Customer[], now: number, ownerId?: string): QueueRow[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  return computeSignals(customers, { now, ownerId })
    .map((signal) => {
      const customer = byId.get(signal.customerId);
      return customer
        ? {
            signal,
            customer,
            minutes: Math.max(
              1,
              ...[signal, ...(signal.secondaryReasons ?? [])].flatMap((item) =>
                item.actions.map((action) => CAPACITY_CONFIG.minutes[action] ?? 3),
              ),
            ),
          }
        : null;
    })
    .filter((row): row is QueueRow => row !== null);
}

export function filterQueue(rows: readonly QueueRow[], filter: QueueFilter): QueueRow[] {
  if (filter === 'priority') return [...rows];
  const selected = rows.filter(({ signal }) => {
    if (filter === 'new') return signal.group === 'new';
    if (filter === 'promise') return signal.group === 'due' || signal.group === 'tasks' || signal.group === 'today';
    return signal.priority !== 'P0' && (signal.group === 'hot' || signal.group === 'warm' || signal.group === 'nonext');
  });
  const selectedIds = new Set(selected.map((row) => row.signal.dedupeKey));
  return [...rows.filter((row) => row.signal.priority === 'P0' && !selectedIds.has(row.signal.dedupeKey)), ...selected];
}

export function visibleQueue(rows: readonly QueueRow[], filter: QueueFilter): QueueRow[] {
  const filtered = filterQueue(rows, filter);
  const p0 = filtered.filter((row) => row.signal.priority === 'P0');
  const rest = filtered
    .filter((row) => row.signal.priority !== 'P0')
    .slice(0, Math.max(0, CAPACITY_CONFIG.maxRows - p0.length));
  // P0 cam kết không bị cắt khỏi danh sách, kể cả khi vượt 7 dòng.
  return [...p0, ...rest];
}

export function currentCallSlot(now: number): { key: CallSlotKey; name: string; remaining: number } | null {
  const minute = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  for (const key of Object.keys(FOLLOWUP_CONFIG.callSlots) as CallSlotKey[]) {
    const { range, name } = FOLLOWUP_CONFIG.callSlots[key];
    const [start, end] = range.split('-').map((part) => {
      const [hour, minutePart] = part.split(':').map(Number);
      return (hour ?? 0) * 60 + (minutePart ?? 0);
    });
    if (start !== undefined && end !== undefined && minute >= start && minute < end)
      return { key, name, remaining: end - minute };
  }
  return null;
}

export function capacityPlan(rows: readonly QueueRow[], now: number) {
  const slot = currentCallSlot(now);
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const overflow = slot ? Math.max(0, minutes - slot.remaining) : 0;
  const movable = rows.filter(
    (row) =>
      row.signal.priority === 'P2' &&
      !row.customer.next_call_at &&
      !(
        Array.isArray(row.customer.next_tasks) &&
        row.customer.next_tasks.some((task) => task && !task.done_at && !!task.due && !task.due_allday)
      ),
  );
  const suggested: QueueRow[] = [];
  let recovered = 0;
  for (const row of movable) {
    if (recovered >= overflow) break;
    suggested.push(row);
    recovered += row.minutes;
  }
  return { slot, minutes, overflow, suggested, recovered };
}

export function endOfDaySummary(customers: readonly Customer[], now: number) {
  const today = new Date(now).toDateString();
  const tomorrowDay = new Date(now);
  tomorrowDay.setDate(tomorrowDay.getDate() + 1);
  let kept = 0,
    late = 0,
    unrecorded = 0,
    tomorrow = 0;
  for (const customer of customers) {
    for (const task of Array.isArray(customer.next_tasks) ? customer.next_tasks : []) {
      if (!task) continue;
      if (task.side === 'me' && task.done_at && new Date(task.done_at).toDateString() === today) kept++;
      if (!task.done_at && task.side === 'me' && task.due && Date.parse(task.due) < now) late++;
      if (!task.done_at && task.due && new Date(task.due).toDateString() === tomorrowDay.toDateString()) tomorrow++;
    }
    for (const attempt of Array.isArray(customer.call_attempts) ? customer.call_attempts : []) {
      if (attempt?.at && new Date(attempt.at).toDateString() === today && !attempt.result) unrecorded++;
    }
  }
  return { kept, late, unrecorded, tomorrow };
}
