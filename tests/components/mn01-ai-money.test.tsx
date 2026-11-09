import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { AiNoteReview } from '@/features/ai/AiNoteReview';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/ai/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/model')>()),
  getAiSettings: async () => ({}),
  requestAi: mocks.request,
}));
afterEach(() => vi.unstubAllEnvs());

it('MN-01 hộp duyệt AI hiển thị tiền triệu/tỷ và chưa ghi khi chỉ xem', async () => {
  vi.stubEnv('VITE_WORKER_URL', 'http://127.0.0.1:9999');
  mocks.request.mockResolvedValue({
    data: { cap_nhat: { finance: 500_000_000, apt_price: 2_058_000_000, income: '25000000' } },
  });
  const customer = { id: 'c', owner_id: 'u', full_name: 'Lan', updated_at: '2026-11-09' } as Customer;
  const update = vi.fn();
  const account = {
    sync: { local: { userId: 'u' }, isOnline: () => true },
    catalog: { projects: () => [] },
    customers: { getSnapshot: () => [customer], update },
  } as unknown as RepositoryAccount;
  render(<AiNoteReview customer={customer} account={account} note="Vốn 500 triệu" />);
  fireEvent.click(screen.getByRole('button', { name: 'Lưu + AI · xem đề xuất' }));
  await screen.findByTestId('ai-note-review');
  expect(screen.getByRole('checkbox', { name: 'Vốn sẵn có: 500 triệu' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Giá căn nhắm: 2,058 tỷ' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Thu nhập: 25 triệu/tháng' })).toBeTruthy();
  expect(update).not.toHaveBeenCalled();
});
