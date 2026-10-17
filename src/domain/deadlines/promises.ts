import type { Task } from '@/domain/customer';

/** A stable identity for the same manually captured promise, safe to reuse on retries. */
export function promiseTaskKey(customerId: string, side: 'me' | 'customer', text: string, due?: string) {
  const canonical = `${customerId}\u0000${side}\u0000${text.trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ')}\u0000${due || ''}`;
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `promise:${(hash >>> 0).toString(36)}`;
}

/** Returns the existing list unchanged when this promise key was already captured. */
export function appendPromise(tasks: readonly (Task | null)[], task: Task): { tasks: (Task | null)[]; added: boolean } {
  if (task.key && tasks.some((entry) => entry?.key === task.key)) return { tasks: [...tasks], added: false };
  return { tasks: [...tasks, task], added: true };
}

/** Keep the first deadline as the original even when the task is moved repeatedly. */
export function snoozePromise<T extends Task>(task: T, due: string, reason: string): T {
  const moved = {
    ...task,
    ...(task.due_original ? {} : task.due ? { due_original: task.due } : {}),
    due,
    snoozed_reason: reason,
  } as T;
  delete moved.due_allday;
  return moved;
}

/** Restore only the snooze-owned fields so any unrelated task metadata remains intact. */
export function undoPromiseSnooze<T extends Task>(current: T, before: Task): T {
  const restored = { ...current } as Record<string, unknown>;
  for (const key of ['due', 'due_allday', 'due_original', 'snoozed_reason'] as const) {
    if (Object.hasOwn(before, key)) restored[key] = before[key];
    else delete restored[key];
  }
  return restored as T;
}
