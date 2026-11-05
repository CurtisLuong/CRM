import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLLOWUP_CONFIG } from '@/config/followup';
import type { Customer } from '@/domain/customer';
import { OutcomePicker } from '@/features/quick-actions/kit';
import { callDraftOf } from '@/features/quick-actions/model';
import { QuickActionsHost } from '@/features/quick-actions/QuickActions';
import { clearQuickAction, openQuickAction } from '@/features/quick-actions/store';
import { OutcomePicker as LegacyOutcomePicker } from '@/ui/pickers';
import { ToastProvider } from '@/ui/Toast';

const session = vi.hoisted(() => ({ account: null as unknown }));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => session.account }));
vi.mock('@/data/callSource', () => ({ installCallSource: () => ({ dispose: vi.fn() }) }));
const NOW = Date.parse('2026-11-05T10:00:00+07:00');
const base = {
  id: 'cr01-customer',
  owner_id: 'cr01-user',
  full_name: 'Khách thử',
  phone: '0901234567',
  qualified_at: null,
  registered_at: '2026-11-04T01:00:00.000Z',
  next_call_at: '2026-11-06T02:00:00.000Z',
  next_call_end: '2026-11-06T04:00:00.000Z',
  next_call_reason: 'Lịch cũ',
  call_attempts: [],
} as unknown as Customer;
let customer = base;
const logCall = vi.fn(async () => customer);
const update = vi.fn(async () => customer);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  customer = base;
  session.account = {
    customers: {
      getSnapshot: () => [customer],
      get: async () => customer,
      logCall,
      update,
      sync: { local: { userId: base.owner_id } },
    },
    sync: { local: { userId: base.owner_id }, isOnline: () => false },
  };
});
afterEach(() => {
  clearQuickAction();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  session.account = null;
});

function mount() {
  render(
    <ToastProvider>
      <QuickActionsHost />
    </ToastProvider>,
  );
}

describe('CR-01 — tấm kết quả cuộc gọi', () => {
  it.each([
    { duration: 75, label: 'Nói chuyện được', step: FOLLOWUP_CONFIG.leadTalkedReason },
    { duration: 59, label: 'Bận, hẹn lại', step: 'Đúng giờ khách hẹn' },
    { duration: 0, label: 'Không nghe', step: 'Gọi lần 2' },
  ])('$duration giây chọn $label và hiện bước tiếp theo ngay', async ({ duration, label, step }) => {
    mount();
    act(() => openQuickAction(customer.id, 'outcome', { at: new Date(NOW).toISOString(), duration }));
    const sheet = await screen.findByRole('dialog', { name: /Kết quả cuộc gọi/ });
    expect(within(sheet).getByRole('radio', { name: label }).getAttribute('aria-checked')).toBe('true');
    expect(within(sheet).getByRole('heading', { name: 'Bước tiếp theo' })).toBeTruthy();
    expect(within(sheet).getByText(new RegExp(step))).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(sheet).getByRole('radio', { name: 'Không nghe' }));
    expect(within(sheet).getByText(/Gọi lần 2/)).toBeTruthy();
  });

  it('ghi tay không chọn sẵn; chọn Bận vẫn yêu cầu xác nhận giờ', async () => {
    mount();
    act(() => openQuickAction(customer.id, 'outcome'));
    const sheet = await screen.findByRole('dialog', { name: /Kết quả cuộc gọi/ });
    expect(
      within(sheet)
        .getAllByRole('radio')
        .every((radio) => radio.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
    expect(within(sheet).queryByRole('heading', { name: 'Bước tiếp theo' })).toBeNull();
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Bận, hẹn lại' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Xác nhận đúng giờ khách hẹn.')).toBeTruthy();
    expect(logCall).not.toHaveBeenCalled();
  });

  it('mở lại Cúp máy giữ kết quả cũ và mở sẵn Khác dù máy ghi 75 giây', async () => {
    const attempt = { at: '2026-11-04T03:00:00.000Z', result: 'hung_up', note: null, duration: 75 };
    customer = { ...base, call_attempts: [attempt] };
    mount();
    act(() => openQuickAction(customer.id, 'outcome', callDraftOf(attempt)));
    const sheet = await screen.findByRole('dialog', { name: /Sửa kết quả cuộc gọi/ });
    expect(within(sheet).getByRole('radio', { name: 'Cúp máy' }).getAttribute('aria-checked')).toBe('true');
    expect(within(sheet).getAllByRole('radio')).toHaveLength(7);
  });

  it('Lưu tự loại có Hoàn tác và giữ nguyên nhật ký cuộc gọi', async () => {
    customer = { ...base, call_attempts: [{ at: '2026-11-04T03:00:00.000Z', result: 'hung_up', note: null }] };
    const open = vi.spyOn(window, 'open');
    mount();
    act(() => openQuickAction(customer.id, 'outcome'));
    await screen.findByRole('dialog', { name: /Kết quả cuộc gọi/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Khác…' }));
    await user.click(screen.getByRole('radio', { name: 'Cúp máy' }));
    expect(screen.getByText('Cúp máy 2 lần liên tiếp → chuyển Loại "Cúp máy".')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(logCall).toHaveBeenCalledTimes(1));
    expect(logCall).toHaveBeenCalledWith(
      customer.id,
      expect.objectContaining({ result: 'hung_up' }),
      expect.objectContaining({
        patch: expect.objectContaining({ disqualify_reason: 'cup_may' }),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }));
    expect(update).toHaveBeenCalledExactlyOnceWith(customer.id, {
      disqualified_at: null,
      disqualify_reason: null,
      disqualify_note: null,
      next_call_at: base.next_call_at,
      next_call_end: base.next_call_end,
      next_call_reason: base.next_call_reason,
    });
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe.each([
  ['kit', OutcomePicker],
  ['cũ', LegacyOutcomePicker],
] as const)('CR-01 — picker %s', (_name, Picker) => {
  it('ba nút chính, bốn mục Khác đúng thứ tự; đổi value sang mục Khác tự mở', async () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<Picker value={null} onValueChange={onValueChange} />);
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Nói chuyện được',
      'Bận, hẹn lại',
      'Không nghe',
    ]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Khác…' }));
    expect(
      screen
        .getAllByRole('radio')
        .slice(3)
        .map((radio) => radio.textContent),
    ).toEqual(['Thuê bao', 'Sai số', 'Cúp máy', 'Máy bận']);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Sai số' }));
    expect(onValueChange).toHaveBeenCalledWith('wrong_number');
    rerender(<Picker key="mới" value={null} onValueChange={onValueChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    rerender(<Picker key="mới" value="hung_up" onValueChange={onValueChange} />);
    expect(screen.getByRole('radio', { name: 'Cúp máy' }).getAttribute('aria-checked')).toBe('true');
  });
});
