import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import type { Signal } from '@/domain/signals';
import { capacityPlan, currentCallSlot, type QueueRow, queueRows, visibleQueue } from '@/features/today/model';

function row(
  id: string,
  priority: Signal['priority'],
  opts: { appointment?: boolean; minutes?: number } = {},
): QueueRow {
  const customer = { id, next_call_at: opts.appointment ? '2026-10-16T09:30:00+07:00' : null } as Customer;
  const signal = {
    id,
    customerId: id,
    priority,
    due: undefined,
    dedupeKey: id,
    actions: ['call'],
  } as Signal;
  return { customer, signal, minutes: opts.minutes ?? 5 };
}

describe('T3.2 today queue and capacity', () => {
  it('keeps all P0 rows even when they exceed the normal seven-row window', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`p0-${i}`, 'P0')).concat([row('p1', 'P1')]);
    expect(visibleQueue(rows, 'priority')).toHaveLength(8);
    expect(visibleQueue(rows, 'priority').every((item) => item.signal.priority === 'P0')).toBe(true);
  });

  it('does not suggest moving a customer with a timed appointment', () => {
    const plan = capacityPlan(
      [row('fixed', 'P2', { appointment: true, minutes: 20 }), row('flex', 'P2', { minutes: 20 })],
      new Date('2026-10-16T09:55:00+07:00').getTime(),
    );
    expect(plan.slot?.name).toBe('Sáng');
    expect(plan.suggested.map((item) => item.customer.id)).not.toContain('fixed');
    expect(plan.suggested.map((item) => item.customer.id)).toContain('flex');
  });

  it('does not suggest moving a customer with an open timed task appointment', () => {
    const scheduled = row('task-booked', 'P2', { minutes: 20 });
    scheduled.customer.next_tasks = [
      { at: '2026-10-16T09:00:00+07:00', text: 'Gọi theo hẹn', due: '2026-10-16T10:00:00+07:00' },
    ];
    const plan = capacityPlan(
      [scheduled, row('flex-task', 'P2', { minutes: 20 })],
      new Date('2026-10-16T09:55:00+07:00').getTime(),
    );
    expect(plan.suggested.map((item) => item.customer.id)).not.toContain('task-booked');
    expect(plan.suggested.map((item) => item.customer.id)).toContain('flex-task');
  });

  it('returns no call capacity outside a configured slot', () => {
    expect(currentCallSlot(new Date('2026-10-16T10:30:00+07:00').getTime())).toBeNull();
  });

  it('keeps an 18:30 appointment exactly once when a new lead is added', () => {
    const now = new Date(2026, 9, 16, 18, 0).getTime();
    const appointment = {
      id: 'booked',
      owner_id: 'me',
      full_name: 'Khách hẹn',
      phone: '0900000001',
      registered_at: new Date(now - 3_600_000).toISOString(),
      created_at: new Date(now - 3_600_000).toISOString(),
      next_call_at: new Date(2026, 9, 16, 18, 30).toISOString(),
      call_attempts: [],
      next_tasks: [],
    } as Customer;
    const newLead = {
      id: 'new',
      owner_id: 'me',
      full_name: 'Khách mới',
      phone: '0900000002',
      registered_at: new Date(now - 3_600_000).toISOString(),
      created_at: new Date(now - 3_600_000).toISOString(),
      call_attempts: [],
      next_tasks: [],
    } as Customer;
    const rows = queueRows([appointment, newLead], now, 'me');
    expect(rows.filter((item) => item.customer.id === 'booked')).toHaveLength(1);
    const booked = rows.find((item) => item.customer.id === 'booked')?.signal;
    expect(booked?.rule === 'S02' || booked?.secondaryReasons?.some((signal) => signal.rule === 'S02')).toBe(true);
    expect(rows.find((item) => item.customer.id === 'booked')?.minutes).toBe(5);
    expect(rows.some((item) => item.customer.id === 'new')).toBe(true);
  });

  it('keeps P0 visible when another queue filter is selected', () => {
    const rows = [row('p0', 'P0'), row('p2', 'P2')];
    expect(visibleQueue(rows, 'opportunity').map((item) => item.customer.id)).toContain('p0');
  });
});
