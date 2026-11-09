import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { AiZaloDraft } from '@/features/ai/AiZaloDraft';
import { requestAi } from '@/features/ai/model';

vi.mock('@/features/ai/model', () => ({
  aiAvailable: (_url: unknown, online: boolean) => online,
  getAiSettings: vi.fn(async () => ({})),
  requestAi: vi.fn(),
}));
const customer = { id: 'zl01-ai', full_name: 'Lan', phone: '0901234567' } as Customer;
const account = {
  sync: { local: { userId: 'zl01-ai' }, isOnline: () => true },
  customers: { getSnapshot: () => [customer] },
} as unknown as RepositoryAccount;

beforeEach(() => vi.mocked(requestAi).mockReset());
afterEach(() => vi.restoreAllMocks());

describe('ZL-01 AI gọn', () => {
  it('giữ mục đích, trạng thái tải và điền nháp; bỏ tiêu đề, giải thích và chi tiết', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof requestAi>>) => void;
    vi.mocked(requestAi).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onDraft = vi.fn();
    const { container } = render(<AiZaloDraft account={account} customer={customer} onDraft={onDraft} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mục đích tin (tuỳ chọn)' }), {
      target: { value: 'Hẹn xem nhà' },
    });
    const button = screen.getByRole('button', { name: 'Soạn bằng AI' });
    await act(async () => fireEvent.click(button));
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve({ data: { tin_nhan: ' Bản nháp mới ', chi_tiet_dung: 'Chi tiết riêng' } }));
    expect(onDraft).toHaveBeenCalledExactlyOnceWith('Bản nháp mới');
    expect(button.getAttribute('aria-busy')).toBeNull();
    for (const removed of ['Soạn Zalo bằng AI', 'AI chỉ điền bản nháp', 'Chi tiết đã dùng:', 'Chi tiết riêng'])
      expect(container.textContent).not.toContain(removed);
    expect(requestAi).toHaveBeenCalledWith(
      account,
      'zalo',
      expect.anything(),
      { goal: 'Hẹn xem nhà', template: undefined },
      {},
    );
  });

  it('hiện lỗi ngắn ngay dưới nút AI và cho phép thử lại', async () => {
    vi.mocked(requestAi).mockRejectedValueOnce(new Error('Chưa tạo được bản nháp Zalo.'));
    render(<AiZaloDraft account={account} customer={customer} onDraft={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Soạn bằng AI' });
    await act(async () => fireEvent.click(button));
    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('Chưa tạo được bản nháp Zalo.');
    expect(button.nextElementSibling).toBe(error);
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  it('giữ lỗi mất mạng dưới nút khi yêu cầu đang chạy bị ngắt', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(requestAi).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    render(<AiZaloDraft account={account} customer={customer} onDraft={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Soạn bằng AI' });
    await act(async () => fireEvent.click(button));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      reject(new TypeError('Failed to fetch'));
    });
    expect(screen.getByRole('alert').textContent).toBe('Mất mạng. Kết nối lại để soạn tin.');
    expect(button.nextElementSibling).toBe(screen.getByRole('alert'));
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      vi.restoreAllMocks();
      window.dispatchEvent(new Event('online'));
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
