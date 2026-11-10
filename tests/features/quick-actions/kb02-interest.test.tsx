import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { QuickActionsHost } from '@/features/quick-actions/QuickActions';
import { clearQuickAction, openQuickAction } from '@/features/quick-actions/store';
import { ToastProvider } from '@/ui';

const session = vi.hoisted(() => ({ account: null as unknown }));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => session.account }));
vi.mock('@/data/callSource', () => ({ installCallSource: () => ({ dispose: vi.fn() }) }));
let customer: Customer;
const update = vi.fn(async (_id, patch) => {
  customer = { ...customer, ...patch };
  return customer;
});
const logCall = vi.fn(async (_id, attempt, options) => {
  customer = { ...customer, ...options.patch, call_attempts: [...(customer.call_attempts ?? []), attempt] };
  return customer;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T02:00:00Z'));
  customer = {
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Khách thử',
    phone: '0901234567',
    interest_level: 20,
    call_attempts: [],
    qualified_at: '2026-11-09T02:00:00Z',
    care_stage: 'Đang chăm sóc',
  } as unknown as Customer;
  session.account = {
    customers: {
      get: async () => customer,
      getSnapshot: () => [customer],
      update,
      logCall,
      sync: { local: { userId: 'u1' } },
    },
    sync: { local: { userId: 'u1' }, isOnline: () => false },
  };
});
afterEach(() => {
  clearQuickAction();
  vi.clearAllMocks();
  vi.useRealTimers();
});
async function open() {
  render(
    <ToastProvider>
      <QuickActionsHost />
    </ToastProvider>,
  );
  act(() => openQuickAction('c1', 'outcome'));
  return within(await screen.findByRole('dialog', { name: /Kết quả cuộc gọi/ }));
}
describe('KB-02 — mức quan tâm trong cuộc gọi', () => {
  it('talked: chọn sẵn bậc cũ, chọn khác lưu trong cùng logCall, Hoàn tác trả mức cũ và giữ nhật ký cuộc gọi', async () => {
    const sheet = await open();
    expect(sheet.queryByRole('group', { name: 'Mức quan tâm' })).toBeNull();
    fireEvent.click(sheet.getByRole('radio', { name: 'Nói chuyện được' }));
    expect(sheet.getByRole('button', { name: 'Lạnh' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sheet.getByRole('button', { name: 'Nóng' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(logCall).toHaveBeenCalledTimes(1));
    expect(logCall).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ result: 'talked' }),
      expect.objectContaining({ patch: expect.objectContaining({ interest_level: 60 }) }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(customer.interest_level).toBe(60);
    expect(customer.call_attempts).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(customer.interest_level).toBe(20));
    expect(customer.call_attempts).toHaveLength(1);
    expect(update).toHaveBeenCalledExactlyOnceWith('c1', { interest_level: 20 });
  });
  it.each(['không chọn', 'chọn trùng', 'đổi kết quả'])(
    '%s: không có khóa interest_level trong lần lưu',
    async (mode) => {
      const sheet = await open();
      fireEvent.click(sheet.getByRole('radio', { name: 'Nói chuyện được' }));
      if (mode === 'chọn trùng') fireEvent.click(sheet.getByRole('button', { name: 'Lạnh' }));
      if (mode === 'đổi kết quả') {
        fireEvent.click(sheet.getByRole('button', { name: 'Nóng' }));
        fireEvent.click(sheet.getByRole('radio', { name: 'Không nghe' }));
        expect(sheet.queryByRole('group', { name: 'Mức quan tâm' })).toBeNull();
      }
      fireEvent.click(sheet.getByRole('button', { name: 'Lưu' }));
      await waitFor(() => expect(logCall).toHaveBeenCalledTimes(1));
      expect(logCall.mock.calls[0]?.[2].patch).not.toHaveProperty('interest_level');
    },
  );
  it('người ghi giùm không thấy hàng mức quan tâm', async () => {
    customer = { ...customer, owner_id: 'u2' };
    const sheet = await open();
    fireEvent.click(sheet.getByRole('radio', { name: 'Nói chuyện được' }));
    expect(sheet.queryByRole('group', { name: 'Mức quan tâm' })).toBeNull();
    fireEvent.click(sheet.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(logCall).toHaveBeenCalledTimes(1));
    expect(logCall.mock.calls[0]?.[2].patch).not.toHaveProperty('interest_level');
  });
});
