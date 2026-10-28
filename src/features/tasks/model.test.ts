import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { type TaskRow, taskTiming } from './model';

function callRow(): TaskRow {
  const customer = { id: 'customer-1' } as Customer;
  return {
    type: 'call',
    customer,
    appointment: {
      start: new Date(2026, 9, 28, 9, 0).toISOString(),
      end: new Date(2026, 9, 28, 10, 0).toISOString(),
    },
    group: 'today',
  };
}

describe('taskTiming hẹn gọi D-010', () => {
  it('giữ mức đến hạn trong khung và 30 phút ân hạn, rồi mới quá hạn', () => {
    const row = callRow();
    const at1020 = new Date(2026, 9, 28, 10, 20).getTime();
    const at1031 = new Date(2026, 9, 28, 10, 31).getTime();

    expect(taskTiming(row, at1020)).toMatchObject({ state: 'due', endMs: new Date(2026, 9, 28, 10, 0).getTime() });
    expect(taskTiming(row, at1031)).toMatchObject({ state: 'missed', tone: 'over' });
  });
});
