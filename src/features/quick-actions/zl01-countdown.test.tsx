import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { ToastProvider } from '@/ui';
import { QuickActionsHost } from './QuickActions';
import { clearQuickAction, openQuickAction } from './store';
import { copyAndOpenZalo, defaultTemplates } from './zalo';

const session = vi.hoisted(() => ({ account: null as unknown }));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => session.account }));
vi.mock('./zalo', async (original) => ({
  ...(await original<typeof import('./zalo')>()),
  copyAndOpenZalo: vi.fn().mockResolvedValue(undefined),
}));

const NOW = Date.parse('2026-11-09T03:00:00Z');
const customer = {
  id: 'zl01-customer',
  owner_id: 'zl01-user',
  full_name: 'Nguyễn Thị Lan',
  phone: '0901234567',
  qualified_at: '2026-11-01T03:00:00Z',
  care_stage: 'Đang chăm sóc',
  call_attempts: [],
  next_tasks: [],
} as unknown as Customer;
let current = customer;
const update = vi.fn(async () => current);
const account = {
  customers: {
    getSnapshot: () => [current],
    get: vi.fn(async () => current),
    list: vi.fn(async () => [current]),
    update,
    sync: { local: { userId: 'zl01-user', isClosed: false } },
  },
  sync: { local: { userId: 'zl01-user', isClosed: false }, isOnline: () => false },
  remote: { getZaloTemplatesRemote: vi.fn(async () => null) },
};

async function open() {
  const view = render(
    <ToastProvider>
      <QuickActionsHost />
    </ToastProvider>,
  );
  await act(async () => openQuickAction(customer.id, 'zalo'));
  return view;
}
async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}
const button = () => screen.getByRole('button', { name: /^Sao chép & mở Zalo/ });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(copyAndOpenZalo).mockReset().mockResolvedValue(undefined);
  update.mockClear();
  current = customer;
  session.account = account;
});
afterEach(() => {
  cleanup();
  clearQuickAction();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ZL-01 đếm ngược Zalo', () => {
  it('đếm 3, 2, 1 và mở đúng một lần sau 3 giây; chỉ ghi khi xác nhận đã gửi', async () => {
    await open();
    expect(button().textContent).toBe('Sao chép & mở Zalo · 3');
    await advance(1000);
    expect(button().textContent).toBe('Sao chép & mở Zalo · 2');
    await advance(1000);
    expect(button().textContent).toBe('Sao chép & mở Zalo · 1');
    expect(copyAndOpenZalo).not.toHaveBeenCalled();
    await advance(1000);
    expect(copyAndOpenZalo).toHaveBeenCalledExactlyOnceWith(defaultTemplates(customer, NOW)[0]?.text, customer.phone);
    await advance(6000);
    expect(copyAndOpenZalo).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('crm:resume')));
    expect(screen.getByText('Đã gửi tin trong Zalo?')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Đã gửi$/ })));
    expect(update).toHaveBeenCalledExactlyOnceWith(
      customer.id,
      expect.objectContaining({
        interactions: [expect.objectContaining({ channel: 'zalo', kind: 'sent' })],
      }),
    );
  });

  it.each(['pointer', 'touch', 'input', 'change', 'wheel', 'scroll', 'focus', 'key', 'header', 'footer'])(
    'huỷ ngay khi %s ở giây thứ 1 và không đếm lại',
    async (event) => {
      await open();
      await advance(1000);
      const dialog = screen.getByRole('dialog');
      const text = screen.getByRole('textbox', { name: 'Nội dung tin nhắn' });
      if (event === 'pointer') fireEvent.pointerDown(dialog);
      if (event === 'touch')
        fireEvent.touchStart(dialog, {
          touches: [{ clientX: 10, clientY: 10 }],
          changedTouches: [{ clientX: 10, clientY: 10 }],
        });
      if (event === 'input') fireEvent.input(text, { target: { value: 'Nội dung sửa' } });
      if (event === 'change') fireEvent.change(text, { target: { value: 'Tin vừa sửa' } });
      if (event === 'wheel') fireEvent.wheel(dialog);
      if (event === 'scroll') fireEvent.scroll(dialog.querySelector('[data-sheet-body]') as Element);
      if (event === 'focus') fireEvent.focus(text);
      if (event === 'key') fireEvent.keyDown(dialog, { key: 'Tab' });
      if (event === 'header') fireEvent.pointerDown(screen.getByRole('heading', { name: /Nhắn Zalo/ }));
      if (event === 'footer') fireEvent.pointerDown(button());
      expect(button().textContent).toBe('Sao chép & mở Zalo');
      fireEvent.change(text, { target: { value: 'Bản nháp mới' } });
      await advance(9000);
      expect(copyAndOpenZalo).not.toHaveBeenCalled();
    },
  );

  it('đóng trước 3 giây thì không mở; mở lại có bộ đếm mới', async () => {
    await open();
    await advance(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await advance(5000);
    expect(copyAndOpenZalo).not.toHaveBeenCalled();
    await act(async () => openQuickAction(customer.id, 'zalo'));
    expect(button().textContent).toContain(' · 3');
  });

  it('không đếm khi khách không liên hệ', async () => {
    current = { ...customer, contact_prefs: { do_not_contact: true } };
    await open();
    expect(screen.queryByRole('dialog')).toBeNull();
    await advance(5000);
    expect(copyAndOpenZalo).not.toHaveBeenCalled();
  });

  it('kiểm tra lại không liên hệ khi hết giờ', async () => {
    await open();
    await advance(1000);
    current = { ...customer, contact_prefs: { do_not_contact: true } };
    await advance(2000);
    expect(copyAndOpenZalo).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Khách yêu cầu không liên hệ.');
  });

  it('không đếm khi không có số điện thoại', async () => {
    current = { ...customer, phone: '' };
    await open();
    await advance(5000);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(copyAndOpenZalo).not.toHaveBeenCalled();
  });

  it('không đếm khi mẫu tin trống', async () => {
    account.remote.getZaloTemplatesRemote.mockResolvedValueOnce([] as never);
    await open();
    expect(button().textContent).toBe('Sao chép & mở Zalo');
    await advance(5000);
    expect(copyAndOpenZalo).not.toHaveBeenCalled();
  });

  it('clipboard tự động thất bại: không mở Zalo, hiện lỗi; bấm nút vẫn thử lại được', async () => {
    const actual = await vi.importActual<typeof import('./zalo')>('./zalo');
    vi.mocked(copyAndOpenZalo).mockImplementation(actual.copyAndOpenZalo);
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Clipboard blocked')).mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
    await open();
    await advance(3000);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Bấm Sao chép & mở Zalo để gửi');
    expect(button().textContent).toBe('Sao chép & mở Zalo');
    await advance(5000);
    expect(writeText).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(button()));
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(openWindow).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('crm:resume')));
    expect(screen.getByText('Đã gửi tin trong Zalo?')).toBeTruthy();
  });

  it('bấm trước khi hết giờ chỉ mở một lần bằng nội dung hiện tại', async () => {
    await open();
    await advance(1000);
    fireEvent.change(screen.getByRole('textbox', { name: 'Nội dung tin nhắn' }), { target: { value: 'Tin đã sửa' } });
    await act(async () => fireEvent.click(button()));
    await advance(5000);
    expect(copyAndOpenZalo).toHaveBeenCalledExactlyOnceWith('Tin đã sửa', customer.phone);
  });
});
