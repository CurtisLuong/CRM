import { describe, expect, it, vi } from 'vitest';
import type { CustomerRepository } from '@/data/repositories/customers';
import type { Customer } from '@/domain/customer';
import { saveCall } from './model';

const customer = {
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Trường Nguyễn',
  phone: '0901234567',
  qualified_at: '2026-10-01T00:00:00.000Z',
  care_stage: 'Đang chăm sóc',
  call_attempts: [{ at: '2026-10-10T03:00:00.000Z', result: 'no_answer', note: null, x_legacy: 'giữ' }],
  next_call_at: null,
  x_future: { keep: true },
} as unknown as Customer;

describe('quick action call payload parity', () => {
  it('uses the v1 call_attempts fields and one atomic local write', async () => {
    const logCall = vi.fn(async (_id: string, _attempt: unknown, _options: unknown) => customer);
    const repo = {
      sync: { local: { userId: 'u1' } },
      get: vi.fn(async () => customer),
      logCall,
    } as unknown as CustomerRepository;
    const draft = {
      at: '2026-10-15T09:10:00.000Z',
      duration: 90,
      origin: 'device',
      device_id: 'android-call-17',
      direction: 'out',
    };

    await saveCall(
      repo,
      'c1',
      draft,
      'talked',
      'Hẹn gửi bảng giá',
      'none',
      null,
      Date.parse('2026-10-16T00:00:00.000Z'),
    );

    expect(logCall).toHaveBeenCalledTimes(1);
    const [id, attempt, options] = logCall.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(id).toBe('c1');
    expect(Object.keys(attempt).sort()).toEqual(
      ['at', 'device_id', 'direction', 'duration', 'note', 'origin', 'result'].sort(),
    );
    expect(attempt).toEqual({
      at: draft.at,
      result: 'talked',
      note: 'Hẹn gửi bảng giá',
      duration: 90,
      origin: 'device',
      device_id: 'android-call-17',
      direction: 'out',
    });
    expect(options).toMatchObject({ editAt: undefined, forceLog: true, patch: { care_stage: 'Đang chăm sóc' } });
    expect(options.careStageNote).toContain('— Nói chuyện được. Hẹn gửi bảng giá');
    expect(options.careStageNote).toContain('(1p30s)');
  });

  it('edits the exact pending device call and keeps its source metadata', async () => {
    const pending = {
      at: '2026-10-16T02:00:00.000Z',
      result: null,
      note: null,
      duration: 0,
      origin: 'device',
      device_id: 'pending-1',
      direction: 'in',
    };
    const existing = { ...customer, call_attempts: [pending] } as Customer;
    const logCall = vi.fn(async (_id: string, _attempt: unknown, _options: unknown) => existing);
    const repo = {
      sync: { local: { userId: 'u1' } },
      get: vi.fn(async () => existing),
      logCall,
    } as unknown as CustomerRepository;

    await saveCall(
      repo,
      'c1',
      { at: pending.at, editAt: pending.at, duration: 0, origin: 'device', device_id: 'pending-1', direction: 'in' },
      'no_answer',
      '',
      'none',
      null,
      Date.parse('2026-10-16T03:00:00.000Z'),
    );

    expect(logCall).toHaveBeenCalledTimes(1);
    expect(logCall.mock.calls[0]?.[1]).toMatchObject({ at: pending.at, device_id: 'pending-1', direction: 'in' });
    expect(logCall.mock.calls[0]?.[2]).toMatchObject({ editAt: pending.at });
  });
});
