import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { ArchiveCustomerSection, ArchivedBanner, canArchive } from '@/features/profile/archive';
import { ToastProvider } from '@/ui';

const remove = vi.fn();
const restore = vi.fn();
const update = vi.fn();
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => false },
  customers: { remove, restore, update },
};
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => account }));

const base = (overrides: Partial<Customer> = {}) =>
  ({ id: 'c1', owner_id: 'u1', full_name: 'Lan', phone: '0901234567', ...overrides }) as Customer;
const wrap = (node: React.ReactNode) =>
  render(
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  remove.mockReset().mockResolvedValue(undefined);
  restore.mockReset().mockResolvedValue(undefined);
  update.mockReset().mockResolvedValue(undefined);
});

describe('archive customer (soft delete)', () => {
  it('only the owner may archive or restore (D-003)', () => {
    expect(canArchive(base(), 'u1')).toBe(true);
    expect(canArchive(base({ owner_id: 'u2' }), 'u1')).toBe(false);
    expect(canArchive(base(), null)).toBe(false);
  });

  it('asks for explicit confirmation, then archives through the repository soft-delete', async () => {
    const user = userEvent.setup();
    wrap(<ArchiveCustomerSection customer={base()} />);
    await user.click(screen.getByRole('button', { name: 'Lưu trữ khách…' }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Lưu trữ khách Lan?' })).toBeTruthy();
    expect(screen.getByText(/ẩn khỏi Danh sách khách, Hôm nay, Công việc/)).toBeTruthy();
    expect(screen.getByText(/Khôi phục bất cứ lúc nào/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Lưu trữ khách…' }));
    // PC-03 (Curtis 26/10): bắt buộc lý do; lưu trữ + dòng nhật ký ghi trong một patch.
    expect(screen.getByRole('button', { name: 'Lưu trữ khách' })).toHaveProperty('disabled', true);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lý do lưu trữ' }), 'so_sai');
    await user.click(screen.getByRole('button', { name: 'Lưu trữ khách' }));
    expect(update).toHaveBeenCalledExactlyOnceWith(
      'c1',
      expect.objectContaining({
        archived_at: expect.any(String),
        interactions: [expect.objectContaining({ kind: 'archived', reason: 'so_sai' })],
      }),
    );
    expect(await screen.findByText('Đã lưu trữ khách')).toBeTruthy();
  });

  it('hides the archive action from non-owners and already archived customers', () => {
    const { container, rerender } = wrap(<ArchiveCustomerSection customer={base({ owner_id: 'u2' })} />);
    expect(container.textContent).toBe('');
    rerender(
      <MemoryRouter>
        <ToastProvider>
          <ArchiveCustomerSection customer={base({ archived_at: '2026-10-17T03:00:00.000Z' })} />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Lưu trữ khách…' })).toBeNull();
  });

  it('archived banner restores for the owner only', async () => {
    const user = userEvent.setup();
    const archived = base({ archived_at: '2026-10-17T03:00:00.000Z' });
    const { unmount } = wrap(<ArchivedBanner customer={archived} />);
    expect(screen.getByText(/Khách đã lưu trữ ngày/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Khôi phục' }));
    expect(update).toHaveBeenCalledExactlyOnceWith(
      'c1',
      expect.objectContaining({ archived_at: null, interactions: [expect.objectContaining({ kind: 'restored' })] }),
    );
    unmount();

    wrap(<ArchivedBanner customer={{ ...archived, owner_id: 'u2' }} />);
    expect(screen.queryByRole('button', { name: 'Khôi phục' })).toBeNull();
    expect(screen.getByText(/Chỉ người phụ trách khôi phục được/)).toBeTruthy();
  });

  it('banner renders nothing for an active customer', () => {
    const { container } = wrap(<ArchivedBanner customer={base()} />);
    expect(container.textContent).toBe('');
  });
});
