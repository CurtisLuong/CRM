import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { AiZaloDraft } from '@/features/ai/AiZaloDraft';
import { requestAi } from '@/features/ai/model';

vi.mock('@/features/ai/model', async (original) => ({
  ...(await original<typeof import('@/features/ai/model')>()),
  requestAi: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('ZL-01 AI chưa sẵn sàng', () => {
  it.each([
    { reason: 'chưa cấu hình AI', workerUrl: '', online: true },
    { reason: 'mất mạng', workerUrl: 'http://127.0.0.1:54322', online: false },
  ])('giữ mục đích và nút AI khi $reason; không gọi AI', ({ workerUrl, online }) => {
    vi.stubEnv('VITE_WORKER_URL', workerUrl);
    const account = {
      sync: { local: { userId: 'zl01-unavailable' }, isOnline: () => online },
    } as unknown as RepositoryAccount;
    const customer = { id: 'zl01-unavailable', full_name: 'Khách thử' } as Customer;
    render(<AiZaloDraft account={account} customer={customer} onDraft={vi.fn()} />);

    const goal = screen.getByRole('textbox', { name: 'Mục đích tin (tuỳ chọn)' });
    const button = screen.getByRole('button', { name: 'Soạn bằng AI' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(goal, { target: { value: 'Hẹn xem nhà' } });
    expect((goal as HTMLInputElement).value).toBe('Hẹn xem nhà');
    fireEvent.click(button);
    expect(requestAi).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
