import { describe, expect, it } from 'vitest';
import type { Customer, Task } from '@/domain/customer';
import { type TaskRow, taskTiming } from '@/features/tasks/model';

const now = new Date(2026, 9, 16, 12, 0).getTime();
const customer = { id: 'c1', full_name: 'Lan', owner_id: 'u1', phone: '0900000000' } as Customer;
const taskRow = (task: Task): TaskRow => ({ type: 'task', customer, task, group: 'today' });

describe('task card timing (M5)', () => {
  it('maps D-010 states to the compact card tone', () => {
    expect(taskTiming(taskRow({ text: 'Quá hạn', at: 'a', due: '2026-10-15T10:00:00' }), now)).toMatchObject({
      state: 'missed',
      tone: 'over',
      text: 'quá hạn',
    });
    expect(taskTiming(taskRow({ text: 'Đến hạn', at: 'a', due: '2026-10-16T11:45:00' }), now)).toMatchObject({
      state: 'due',
      tone: 'soon',
    });
    expect(taskTiming(taskRow({ text: 'Sắp tới', at: 'a', due: '2026-10-16T18:00:00' }), now)).toMatchObject({
      state: 'soon',
      tone: 'soon',
    });
    // Việc còn xa không tô vạch — chỉ việc gấp mới mang màu.
    expect(taskTiming(taskRow({ text: 'Còn xa', at: 'a', due: '2026-10-20T10:00:00' }), now)).toMatchObject({
      state: 'far',
      tone: undefined,
    });
  });

  it('keeps all-day boundaries and no-deadline tasks neutral', () => {
    expect(
      taskTiming(taskRow({ text: 'Cả ngày hôm qua', at: 'a', due: '2026-10-15T00:00:00', due_allday: true }), now),
    ).toMatchObject({ state: 'missed', tone: 'over', allDay: true });
    expect(
      taskTiming(taskRow({ text: 'Cả ngày hôm nay', at: 'a', due: '2026-10-16T00:00:00', due_allday: true }), now),
    ).toMatchObject({ state: 'due', tone: 'soon', allDay: true });
    expect(taskTiming(taskRow({ text: 'Không hạn', at: 'a' }), now)).toBeNull();
  });

  it('uses the appointment end (plus grace) for a scheduled call', () => {
    const call = (start: string, end: string): TaskRow => ({
      type: 'call',
      customer,
      appointment: { start, end },
      group: 'today',
    });
    expect(taskTiming(call('2026-10-16T10:00:00', '2026-10-16T11:00:00'), now)).toMatchObject({
      state: 'missed',
      tone: 'over',
    });
    expect(taskTiming(call('2026-10-16T13:00:00', '2026-10-16T13:30:00'), now)).toMatchObject({
      state: 'soon',
      tone: 'soon',
    });
  });
});
