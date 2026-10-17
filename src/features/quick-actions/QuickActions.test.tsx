import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { ToastProvider } from '@/ui';
import { CallHistoryActions, QuickActionButtons, QuickActionsHost } from './QuickActions';
import { clearQuickAction } from './store';
import { contactPhones, defaultTemplates, zaloHref } from './zalo';

const mockSession = vi.hoisted(() => ({ account: null as unknown }));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => mockSession.account }));

const NOW = Date.parse('2026-10-16T03:00:00Z');
const customer = {
  id: 'quick-1',
  owner_id: 'u1',
  full_name: 'Trường Nguyễn',
  phone: '0901234567',
  qualified_at: '2026-10-01T00:00:00.000Z',
  care_stage: 'Đang chăm sóc',
  call_attempts: [],
  next_call_at: null,
} as unknown as Customer;
const logCall = vi.fn(async () => snapshotCustomer);
const updateCustomer = vi.fn(async () => customer);
let snapshotCustomer: Customer = customer;
const account = {
  customers: {
    getSnapshot: () => [snapshotCustomer],
    get: vi.fn(async () => snapshotCustomer),
    list: vi.fn(async () => [customer]),
    logCall,
    update: updateCustomer,
    sync: { local: { userId: 'u1', isClosed: false } },
  },
  sync: { local: { userId: 'u1', isClosed: false }, isOnline: () => false },
  remote: { getZaloTemplatesRemote: vi.fn(async () => null) },
} as never;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  clearQuickAction();
  mockSession.account = null;
  snapshotCustomer = customer;
  logCall.mockClear();
  updateCustomer.mockClear();
  delete (window as Window & { Capacitor?: unknown }).Capacitor;
});

describe('quick actions touch budget', () => {
  it('records a manual call for the owner without starting a phone call', async () => {
    mockSession.account = account;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <CallHistoryActions customer={customer} />
        <QuickActionsHost />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Ghi cuộc gọi' }));
    expect(await screen.findByRole('heading', { name: /Kết quả cuộc gọi/ })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Nói chuyện được' }));
    await user.type(screen.getByRole('textbox', { name: 'Ghi chú cuộc gọi' }), 'Khách quan tâm');
    await user.click(screen.getByRole('checkbox', { name: 'Không hẹn gọi tiếp' }));
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(logCall).toHaveBeenCalledTimes(1));
    expect(logCall).toHaveBeenCalledWith(
      'quick-1',
      expect.objectContaining({
        at: new Date(NOW).toISOString(),
        result: 'talked',
        note: 'Khách quan tâm',
        duration: null,
        origin: 'manual',
      }),
      expect.objectContaining({ forceLog: true }),
    );
  });

  it('edits a recorded call while preserving its timestamp and source metadata', async () => {
    mockSession.account = account;
    const attempt = {
      at: '2026-10-10T03:00:00.000Z',
      result: 'no_answer',
      note: 'Gọi lần trước',
      duration: 21,
      origin: 'device',
      device_id: 'android-9',
      direction: 'in',
      x_legacy: { keep: true },
    };
    snapshotCustomer = { ...customer, call_attempts: [attempt] } as unknown as Customer;
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <CallHistoryActions customer={snapshotCustomer} />
        <QuickActionsHost />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Sửa kết quả cuộc gọi/ }));
    expect(await screen.findByRole('heading', { name: /Sửa kết quả cuộc gọi/ })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Nói chuyện được' }));
    await user.clear(screen.getByRole('textbox', { name: 'Ghi chú cuộc gọi' }));
    await user.type(screen.getByRole('textbox', { name: 'Ghi chú cuộc gọi' }), 'Đã trao đổi');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(logCall).toHaveBeenCalledTimes(1));
    expect(logCall).toHaveBeenCalledWith('quick-1', { result: 'talked', note: 'Đã trao đổi' }, { editAt: attempt.at });
  });

  it('does not offer call editing for another owner’s customer', () => {
    mockSession.account = account;
    const otherOwner = {
      ...customer,
      owner_id: 'u2',
      call_attempts: [{ at: '2026-10-10T03:00:00Z', result: 'talked' }],
    };
    const { container } = render(<CallHistoryActions customer={otherOwner as Customer} />);
    expect(container.textContent).toBe('');
  });

  it('blocks Zalo when the latest customer preference is do-not-contact', async () => {
    mockSession.account = account;
    snapshotCustomer = { ...customer, contact_prefs: { do_not_contact: true, dnc_reason: 'Khách yêu cầu' } };
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <QuickActionButtons customer={customer} />
        <QuickActionsHost />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Zalo' }));
    await waitFor(() => expect(screen.getByText('Khách yêu cầu không liên hệ')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: /Nhắn Zalo/ })).toBeNull();
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it('records a meeting from the interaction sheet in one confirmation tap', async () => {
    mockSession.account = account;
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <QuickActionButtons customer={customer} />
        <QuickActionsHost />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Ghi tương tác' }));
    await user.click(await screen.findByRole('button', { name: 'Đã gặp' }));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer).toHaveBeenCalledWith(
      'quick-1',
      expect.objectContaining({
        interactions: [expect.objectContaining({ channel: 'meet', kind: 'meeting', by: 'u1', origin: 'v2' })],
      }),
    );
  });

  it('saves a Zalo interaction only after the user confirms sending', async () => {
    mockSession.account = account;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <QuickActionButtons customer={customer} />
        <QuickActionsHost />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Zalo' }));
    await user.click(await screen.findByRole('button', { name: 'Sao chép & mở Zalo' }));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    act(() => window.dispatchEvent(new Event('crm:resume')));
    await user.click(await screen.findByRole('button', { name: /^Đã gửi$/ }));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer).toHaveBeenCalledWith(
      'quick-1',
      expect.objectContaining({
        interactions: [expect.objectContaining({ channel: 'zalo', kind: 'sent', by: 'u1', origin: 'v2' })],
      }),
    );
  });

  it('records a call, outcome and note in three taps plus typing', async () => {
    mockSession.account = account;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const dial = vi.fn(async () => ({}));
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { CallLog: { dial } },
    };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let touches = 0;
    const countTouch = () => {
      touches += 1;
    };
    document.addEventListener('click', countTouch);
    render(
      <ToastProvider>
        <QuickActionButtons customer={customer} />
        <QuickActionsHost />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Gọi' }));
    expect(dial).toHaveBeenCalledWith({ number: '0901234567' });
    act(() => window.dispatchEvent(new Event('blur')));
    vi.setSystemTime(NOW + 10_000);
    act(() => window.dispatchEvent(new Event('crm:resume')));
    await screen.findByRole('dialog', { name: /Kết quả cuộc gọi/ });
    await user.click(screen.getByRole('radio', { name: 'Nói chuyện được' }));
    const note = screen.getByRole('textbox', { name: 'Ghi chú cuộc gọi' }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(note);
    fireEvent.change(note, { target: { value: 'Hẹn gửi bảng giá' } });
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(logCall).toHaveBeenCalledTimes(1));
    expect(touches).toBe(3);
    expect(logCall).toHaveBeenCalledWith(
      'quick-1',
      expect.objectContaining({ result: 'talked', note: 'Hẹn gửi bảng giá', origin: 'manual' }),
      expect.objectContaining({ forceLog: true }),
    );
    document.removeEventListener('click', countTouch);
  });

  it('deduplicates customer phone choices and preselects a filled suggested template', () => {
    const multi = {
      ...customer,
      phone: '0901234567',
      household: [{ phone: '+84901234567' }, { phone: '0912345678' }],
    } as Customer;
    expect(contactPhones(multi)).toEqual(['0901234567', '0912345678']);
    const templates = defaultTemplates(customer, NOW);
    expect(templates[0]?.id).toBeTruthy();
    expect(templates[0]?.text).toContain('Nguyễn');
    expect(zaloHref('0901234567', 'Android', 5)).toBe('https://zalo.me/0901234567');
  });
});
