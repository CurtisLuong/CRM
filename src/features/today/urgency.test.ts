import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import type { Signal } from '@/domain/signals';
import type { QueueRow } from './model';
import { todayUrgencyCounts, urgencyForRow } from './model';

const ownerId = 'today-owner';
const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'customer-1',
  owner_id: ownerId,
  full_name: 'Khách thử',
  phone: '0900000001',
  call_attempts: [],
  ...overrides,
});

function row(
  customerRecord: Customer,
  options: {
    due?: number;
    group?: Signal['group'];
    evidence?: Signal['evidence'];
    rule?: Signal['rule'];
    secondaryReasons?: Signal[];
  } = {},
): QueueRow {
  const signal: Signal = {
    id: `signal-${customerRecord.id}`,
    rule: options.rule ?? 'S03',
    customerId: customerRecord.id,
    priority: 'P1',
    title: 'Việc cần xử lý',
    reason: 'Việc cần xử lý',
    evidence: options.evidence ?? [],
    due: options.due,
    actions: ['call'],
    dedupeKey: customerRecord.id,
    fingerprint: customerRecord.id,
    group: options.group,
    sort: [],
    secondaryReasons: options.secondaryReasons,
  };
  return { signal, customer: customerRecord, minutes: 3 };
}

describe('urgencyForRow', () => {
  it('áp mốc quá hạn +30 phút cho việc có giờ', () => {
    const item = row(customer(), { due: Date.parse('2026-10-28T10:00:00+07:00') });
    expect(urgencyForRow(item, Date.parse('2026-10-28T10:29:00+07:00'))).toBe('soon');
    expect(urgencyForRow(item, Date.parse('2026-10-28T10:31:00+07:00'))).toBe('alert');
  });

  it('dùng SLA khách mới: đúng mục tiêu, quá mục tiêu rồi quá hạn mức', () => {
    const registered = '2026-10-28T09:00:00+07:00';
    const item = row(
      customer({ id: 'new-lead', care_stage: 'Đăng kí mới', registered_at: registered, created_at: registered }),
      {
        group: 'new',
        rule: 'S01',
        due: Date.parse('2026-10-28T13:00:00+07:00'),
        evidence: [
          { field: 'registered_at', value: registered },
          { field: 'sla_anchor_at', value: undefined },
        ],
      },
    );
    expect(urgencyForRow(item, Date.parse('2026-10-28T09:20:00+07:00'))).toBe('ok');
    expect(urgencyForRow(item, Date.parse('2026-10-28T11:00:00+07:00'))).toBe('soon');
    expect(urgencyForRow(item, Date.parse('2026-10-28T14:00:00+07:00'))).toBe('alert');
  });

  it('mức của dòng = mức gấp nhất: SLA quá hạn mức không bị việc phụ hạ xuống', () => {
    const due = '2026-10-28T10:00:00+07:00';
    const task = { at: 'task-at', text: 'Gọi khách', due, kind: 'call' as const };
    const customerRecord = customer({
      id: 'mixed-signals',
      care_stage: 'Đang chăm sóc',
      qualified_at: '2026-10-01T09:00:00+07:00',
      care_stage_updated_at: '2026-10-01T09:00:00+07:00',
      next_tasks: [task],
    });
    const slaSignal = row(customerRecord, {
      due: Date.parse('2026-10-21T09:00:00+07:00'),
      group: 'sla',
      evidence: [{ field: 'phase', value: 'care' }],
      rule: 'S05',
    }).signal;
    const taskSignal: Signal = {
      ...slaSignal,
      id: 'S03:mixed-signals',
      rule: 'S03',
      group: 'tasks',
      evidence: [{ field: 'task', value: task }],
      due: Date.parse(due),
      actions: ['complete'],
    };
    const item = row(customerRecord, {
      due: slaSignal.due,
      group: 'sla',
      evidence: slaSignal.evidence,
      rule: 'S05',
      secondaryReasons: [taskSignal],
    });

    // Đang chăm sóc từ 01/10 → 27 ngày > hạn mức 20 ngày (D-008) → alert dù việc phụ 10:00 còn trong +30 phút.
    expect(urgencyForRow(item, Date.parse('2026-10-28T10:29:00+07:00'))).toBe('alert');
    expect(urgencyForRow(item, Date.parse('2026-10-28T10:31:00+07:00'))).toBe('alert');

    // Vào bậc 26/10 → SLA còn đúng mục tiêu; việc phụ 10:00 quyết định: 10:29 soon, 10:31 alert (D-010).
    const fresh = { ...item, customer: { ...customerRecord, care_stage_updated_at: '2026-10-26T09:00:00+07:00' } };
    expect(urgencyForRow(fresh, Date.parse('2026-10-28T10:29:00+07:00'))).toBe('soon');
    expect(urgencyForRow(fresh, Date.parse('2026-10-28T10:31:00+07:00'))).toBe('alert');
  });
});

describe('todayUrgencyCounts', () => {
  it('đếm đúng mỗi mức trên các dòng hàng đợi', () => {
    const now = Date.parse('2026-10-28T09:20:00+07:00');
    const late = row(customer({ id: 'late' }), { due: Date.parse('2026-10-28T08:00:00+07:00') });
    const due = row(customer({ id: 'due' }), { due: Date.parse('2026-10-28T10:00:00+07:00') });
    const registered = '2026-10-28T09:00:00+07:00';
    const newLead = row(
      customer({ id: 'new', care_stage: 'Đăng kí mới', registered_at: registered, created_at: registered }),
      {
        group: 'new',
        rule: 'S01',
        due: Date.parse('2026-10-28T13:00:00+07:00'),
        evidence: [{ field: 'registered_at', value: registered }],
      },
    );

    expect(todayUrgencyCounts([late, due, newLead], now)).toEqual({ alert: 1, soon: 1, ok: 1 });
  });
});
