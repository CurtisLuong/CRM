import { describe, expect, it, vi } from 'vitest';
import type { CustomerRepository } from '@/data/repositories/customers';
import type { Customer } from '@/domain/customer';
import { disqualifyLead, filterLeads, hasTalked, qualifyLead, reopenLead } from '@/features/leads/model';

const base = {
  id: 'lead-1',
  owner_id: 'owner-1',
  full_name: 'Mai Nguyễn',
  phone: '0901234567',
  care_stage: 'Đăng kí mới',
  interest_level: 20,
  call_attempts: [],
  x_future: { preserve: true },
} as unknown as Customer;

function repository(customer: Customer) {
  const update = vi.fn(async (_id: string, _payload: Record<string, unknown>, _options?: unknown) => customer);
  const repo = {
    sync: { local: { userId: 'owner-1' } },
    get: vi.fn(async () => customer),
    update,
  } as unknown as CustomerRepository;
  return { repo, update };
}

describe('T3.4 D-001 lead rules and v1 payload parity', () => {
  it('defaults to open funnel and keeps qualified records out of lead filters', () => {
    const talking = {
      ...base,
      id: 'lead-2',
      call_attempts: [{ at: '2026-10-16T09:00:00Z', result: 'talked' }],
    } as Customer;
    const dropped = { ...base, id: 'lead-3', disqualified_at: '2026-10-16T10:00:00Z' } as Customer;
    const qualified = { ...base, id: 'customer-1', qualified_at: '2026-10-16T11:00:00Z' } as Customer;
    expect(filterLeads([base, talking, dropped, qualified], 'open').map((c) => c.id)).toEqual(['lead-1', 'lead-2']);
    expect(filterLeads([base, talking, dropped, qualified], 'dropped').map((c) => c.id)).toEqual(['lead-3']);
    expect(hasTalked(talking)).toBe(true);
  });

  it('requires an explicit qualify action after a talked result and patches only v1-compatible fields', async () => {
    const blocked = repository(base);
    await expect(qualifyLead(blocked.repo, base.id)).rejects.toThrow('Nói chuyện được');
    expect(blocked.update).not.toHaveBeenCalled();

    const dropped = repository({
      ...base,
      disqualified_at: '2026-10-16T09:00:00.000Z',
      call_attempts: [{ at: '2026-10-16T08:00:00.000Z', result: 'talked' }],
    } as Customer);
    await expect(qualifyLead(dropped.repo, base.id)).rejects.toThrow('Mở lại khách');
    expect(dropped.update).not.toHaveBeenCalled();

    const talking = {
      ...base,
      call_attempts: [{ at: '2026-10-16T09:00:00Z', result: 'talked', note: 'Quan tâm', x_unknown: 7 }],
    } as Customer;
    const { repo, update } = repository(talking);
    await qualifyLead(repo, base.id, new Date('2026-10-16T10:00:00.000Z'));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toEqual({
      qualified_at: '2026-10-16T10:00:00.000Z',
      care_stage: 'Đang chăm sóc',
      interest_level: 60,
      disqualified_at: null,
      disqualify_reason: null,
      disqualify_note: null,
    });
    expect(talking.x_future).toEqual({ preserve: true });
    expect(talking.call_attempts?.[0]).toMatchObject({ x_unknown: 7 });
    expect(update.mock.calls[0]?.[2]).toMatchObject({ careStageNote: 'Đạt — xác nhận quan tâm sau 1 lần gọi' });
  });

  it('matches v1 drop payload and requires note only for Other', async () => {
    const { repo, update } = repository(base);
    await expect(disqualifyLead(repo, base.id, 'khac', '  ')).rejects.toThrow('cần mô tả thêm');
    expect(update).not.toHaveBeenCalled();
    await disqualifyLead(repo, base.id, 'khac', 'Đăng ký thử', new Date('2026-10-16T10:00:00Z'));
    expect(update.mock.calls[0]?.[1]).toEqual({
      disqualified_at: '2026-10-16T10:00:00.000Z',
      disqualify_reason: 'khac',
      disqualify_note: 'Đăng ký thử',
      next_call_at: null,
      next_call_end: null,
      next_call_reason: null,
    });
  });

  it('reopens locally without deleting the call history or changing unrelated fields', async () => {
    const dropped = {
      ...base,
      disqualified_at: '2026-10-15T10:00:00Z',
      disqualify_reason: 'khac',
      disqualify_note: 'test',
      call_attempts: [{ at: '2026-10-15T09:00:00Z', result: 'no_answer', x_legacy: true }],
    } as Customer;
    const { repo, update } = repository(dropped);
    await reopenLead(repo, dropped.id, new Date('2026-10-16T10:00:00Z'));
    expect(update.mock.calls[0]?.[1]).toEqual({
      disqualified_at: null,
      disqualify_reason: null,
      disqualify_note: null,
      sla_anchor_at: '2026-10-16T10:00:00.000Z',
    });
    expect(dropped.call_attempts?.[0]).toMatchObject({ x_legacy: true });
    expect(dropped.x_future).toEqual({ preserve: true });
  });
});
