import { describe, expect, it } from 'vitest';
import type { Customer, Task } from '@/domain/customer';
import { groupTask, taskRows } from '@/features/tasks/model';

const now = new Date(2026, 9, 16, 12, 0).getTime();
const task = (due?: string, extra: Partial<Task> = {}): Task =>
  ({ text: 'Gọi lại', at: '2026-10-15T10:00:00.000Z', ...(due ? { due } : {}), ...extra }) as Task;

describe('task deadline groups', () => {
  it('honors D-010 overdue grace and all-day boundaries', () => {
    expect(groupTask(task('2026-10-16T11:30:00'), now)).toBe('today');
    expect(groupTask(task('2026-10-16T11:29:59'), now)).toBe('overdue');
    expect(groupTask(task('2026-10-15T00:00:00', { due_allday: true }), now)).toBe('overdue');
    expect(groupTask(task('2026-10-16T00:00:00', { due_allday: true }), now)).toBe('today');
  });

  it('uses calendar days for today, seven-day and later boundaries; invalid or absent dates have no deadline', () => {
    expect(groupTask(task('2026-10-16T23:59:59'), now)).toBe('today');
    expect(groupTask(task('2026-10-23T12:00:00'), now)).toBe('week');
    expect(groupTask(task('2026-10-24T00:00:00'), now)).toBe('later');
    expect(groupTask(task(undefined), now)).toBe('no_due');
    expect(groupTask(task('bad-date'), now)).toBe('no_due');
    expect(groupTask(task('2026-10-16T10:00:00', { done_at: '2026-10-16T10:01:00Z' }), now)).toBe('done');
  });

  it('filters task type and promise side while retaining legacy tasks as Em hứa', () => {
    const customer = {
      id: 'c1',
      full_name: 'Lan',
      owner_id: 'u1',
      phone: '0900000000',
      next_tasks: [
        task('2026-10-16T13:00:00', { kind: 'docs' }),
        task('2026-10-17T13:00:00', { kind: 'docs', side: 'customer', at: 'b' }),
        task(undefined, { kind: 'message', at: 'c' }),
      ],
    } as Customer;
    expect(taskRows([customer], now, 'docs', 'me').map((row) => row.task.side || 'me')).toEqual(['me']);
    expect(taskRows([customer], now, 'docs', 'customer').map((row) => row.task.at)).toEqual(['b']);
    expect(taskRows([customer], now).map((row) => row.task.at)).toEqual(['2026-10-15T10:00:00.000Z', 'b', 'c']);
  });
});
