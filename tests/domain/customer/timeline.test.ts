import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';

const base = { id: 'c1', owner_id: 'u1', full_name: 'Lan', phone: '0901234567' };

describe('customerTimeline', () => {
  it('merges calls, notes, interactions, stage changes, completed tasks and approved AI facts newest first', () => {
    const customer = {
      ...base,
      call_attempts: [{ at: '2026-10-10T00:00:00.000Z', result: 'talked', note: 'Trao đổi' }],
      notes_manual: [{ at: '2026-10-11T00:00:00.000Z', text: 'Gửi bảng giá' }],
      interactions: [{ at: '2026-10-12T00:00:00.000Z', channel: 'zalo', kind: 'sent', template: 'Giới thiệu dự án' }],
      care_stage_history: [{ at: '2026-10-13T00:00:00.000Z', stage: 'Đang chăm sóc', auto: 'sla' }],
      next_tasks: [{ at: '2026-10-08T00:00:00.000Z', text: 'Gọi lại', done_at: '2026-10-14T00:00:00.000Z' }],
      field_meta: { purpose: { at: '2026-10-15T00:00:00.000Z', by: 'ai', confirmed: true } },
    } as Customer;
    const before = structuredClone(customer);
    const entries = customerTimeline(customer);
    expect(entries.map((entry) => entry.kind)).toEqual(['approved', 'task', 'stage', 'interaction', 'note', 'call']);
    expect(entries[3]).toMatchObject({ title: 'Đã gửi Zalo', detail: 'Mẫu: Giới thiệu dự án' });
    expect(entries[2]?.automatic).toBe(true);
    expect(customer).toStrictEqual(before);
  });

  it('ignores undated and unconfirmed records', () => {
    const entries = customerTimeline({
      ...base,
      call_attempts: [{ result: 'talked' }],
      field_meta: { purpose: { at: '2026-10-15', by: 'ai', confirmed: false } },
    } as Customer);
    expect(entries).toEqual([]);
  });
});
