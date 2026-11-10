import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerRepository } from '@/data/repositories/customers';
import type { Customer } from '@/domain/customer';
import { disqualifyLead, qualifyLead, reopenLead } from '@/features/leads/model';
import { saveCall } from '@/features/quick-actions/model';
import { QuickActionsHost } from '@/features/quick-actions/QuickActions';
import { clearQuickAction, openQuickAction } from '@/features/quick-actions/store';
import { ToastProvider } from '@/ui';

const NOW = Date.parse('2026-11-10T02:00:00Z');
let customer: Customer;
const update = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
  customer = { ...customer, ...patch };
  return customer;
});
const logCall = vi.fn(async (_id: string, attempt, options) => {
  customer = { ...customer, ...options?.patch, call_attempts: [...(customer.call_attempts ?? []), attempt] };
  return customer;
});
const repo = {
  get: async () => customer,
  getSnapshot: () => [customer],
  update,
  logCall,
  sync: { local: { userId: 'u1' } },
};
const account = { customers: repo, sync: { local: { userId: 'u1' }, isOnline: () => false } };
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => account }));
vi.mock('@/data/callSource', () => ({ installCallSource: () => ({ dispose: vi.fn() }) }));
const repository = repo as unknown as CustomerRepository;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  update.mockClear();
  logCall.mockClear();
  customer = {
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Khách thử',
    phone: '0901234567',
    interest_level: 60,
    care_stage: 'Đăng kí mới',
    registered_at: '2026-11-09T01:00:00Z',
    call_attempts: [{ at: '2026-11-09T02:00:00Z', result: 'hung_up' }],
  } as Customer;
});
afterEach(() => {
  clearQuickAction();
  vi.useRealTimers();
});

describe('KB-03 — patch Loại / mở lại / Đạt', () => {
  it('Loại Nóng 60 → 0; mở lại Nguội 0 → 20', async () => {
    await disqualifyLead(repository, 'c1', 'so_sai', '');
    expect(update.mock.calls[0]?.[1]).toHaveProperty('interest_level', 0);
    await reopenLead(repository, 'c1');
    expect(update.mock.calls[1]?.[1]).toHaveProperty('interest_level', 20);
  });
  it('Đạt từ 20 không gửi interest_level', async () => {
    customer = { ...customer, interest_level: 20, call_attempts: [{ at: '2026-11-09T02:00:00Z', result: 'talked' }] };
    await qualifyLead(repository, 'c1');
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('interest_level');
  });
  it('tự loại trong logCall ghi 0 cùng cuộc gọi', async () => {
    await saveCall(repository, 'c1', { at: new Date(NOW).toISOString() }, 'hung_up', '', 'drop', null, NOW);
    expect(logCall.mock.calls[0]?.[2]?.patch).toMatchObject({ interest_level: 0, disqualify_reason: 'cup_may' });
  });
  it('tự loại có Hoàn tác trả đúng số 60 và giữ cuộc gọi', async () => {
    render(
      <ToastProvider>
        <QuickActionsHost />
      </ToastProvider>,
    );
    act(() => openQuickAction('c1', 'outcome', { at: new Date(NOW).toISOString() }));
    const sheet = within(await screen.findByRole('dialog', { name: /Kết quả cuộc gọi/ }));
    fireEvent.click(sheet.getByRole('button', { name: 'Khác…' }));
    fireEvent.click(sheet.getByRole('radio', { name: 'Cúp máy' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(customer.interest_level).toBe(0));
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0]?.[1]).toMatchObject({ disqualified_at: null, interest_level: 60 });
    expect(customer.call_attempts).toHaveLength(2);
  });
  it('chọn đúng Lạnh khi thiếu số trong khung gọi không ghi mức', async () => {
    customer = { ...customer, interest_level: undefined };
    await saveCall(repository, 'c1', { at: new Date(NOW).toISOString() }, 'talked', '', 'none', null, NOW, [], 'lanh');
    expect(logCall.mock.calls[0]?.[2]?.patch).not.toHaveProperty('interest_level');
  });
});
