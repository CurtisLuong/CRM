import { describe, expect, it } from 'vitest';
import type { Customer, Task } from '@/domain/customer';
import { groupCall, groupTask, type TaskRow, taskRows } from '@/features/tasks/model';

const now = new Date(2026, 9, 16, 12, 0).getTime();
const task = (due?: string, extra: Partial<Task> = {}): Task =>
  ({ text: 'Gọi lại', at: '2026-10-15T10:00:00.000Z', ...(due ? { due } : {}), ...extra }) as Task;
const tasksOnly = (rows: TaskRow[]) =>
  rows.filter((row): row is Extract<TaskRow, { type: 'task' }> => row.type === 'task').map((row) => row.task);

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
    expect(tasksOnly(taskRows([customer], now, 'docs', 'me')).map((item) => item.side || 'me')).toEqual(['me']);
    expect(tasksOnly(taskRows([customer], now, 'docs', 'customer')).map((item) => item.at)).toEqual(['b']);
    expect(tasksOnly(taskRows([customer], now)).map((item) => item.at)).toEqual(['2026-10-15T10:00:00.000Z', 'b', 'c']);
  });
});

describe('call appointments and legacy task exclusions', () => {
  it('uses the appointment end plus D-010 grace for the call group', () => {
    expect(groupCall('2026-10-16T10:00:00', '2026-10-16T11:30:00', now)).toBe('today');
    expect(groupCall('2026-10-16T10:00:00', '2026-10-16T11:29:59', now)).toBe('overdue');
    expect(groupCall('2026-10-20T09:00:00', '2026-10-20T10:00:00', now)).toBe('week');
    expect(groupCall('invalid', undefined, now)).toBe('no_due');
  });

  it('includes scheduled calls as call rows without creating task data, and filters them by call kind', () => {
    const customer = {
      id: 'appointment-customer',
      full_name: 'Hà',
      owner_id: 'u1',
      phone: '0900000001',
      next_call_at: '2026-10-16T13:00:00.000Z',
      next_call_end: '2026-10-16T14:00:00.000Z',
      next_call_reason: 'Khách xin gọi lại',
      next_tasks: [task('2026-10-16T13:00:00', { at: 'task-1', kind: 'docs' })],
    } as Customer;
    const all = taskRows([customer], now);
    const calls = taskRows([customer], now, 'call');
    expect(all.filter((row) => row.type === 'call')).toEqual([
      expect.objectContaining({
        type: 'call',
        customer,
        appointment: expect.objectContaining({
          start: customer.next_call_at,
          end: customer.next_call_end,
          reason: customer.next_call_reason,
        }),
      }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.type).toBe('call');
    expect(customer.next_tasks).toHaveLength(1);
  });

  it('excludes disqualified customers and their appointments from the queue', () => {
    const customer = {
      id: 'disqualified-customer',
      full_name: 'Đã loại',
      owner_id: 'u1',
      phone: '0900000002',
      disqualified_at: '2026-10-15T10:00:00.000Z',
      next_call_at: '2026-10-16T13:00:00.000Z',
      next_tasks: [task('2026-10-16T13:00:00', { at: 'task-2' })],
    } as Customer;
    expect(taskRows([customer], now)).toEqual([]);
  });
});
