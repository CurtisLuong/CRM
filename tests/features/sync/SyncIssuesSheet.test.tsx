import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const discardRejected = vi.fn(async () => null);
const refresh = vi.fn(async () => {});
const flushQueue = vi.fn(async () => ({}));
const status = {
  syncing: false,
  pending: 2,
  lastSyncedAt: null,
  error: null,
  assignError: null,
  liveStatus: 'off',
  rejected: [
    {
      opId: 7,
      type: 'update' as const,
      recordId: 'c1',
      code: '23514',
      message: 'new row for relation "customers" violates check constraint "customers_care_stage_check"',
    },
  ],
};
const account = {
  sync: { local: { isClosed: false }, isOnline: () => true, discardRejected, flushQueue },
  customers: { refresh },
};
vi.mock('@/data/hooks', () => ({
  useRepositoryAccount: () => account,
  useSyncStatus: () => status,
  useCustomers: () => [{ id: 'c1', full_name: 'Nguyễn Thị Lan' }],
}));
vi.mock('@/data/queue', () => ({
  queueGetAll: async () => [{ opId: 7, type: 'update', recordId: 'c1', payload: { care_stage: 'x', updated_at: 'y' } }],
}));

const { SyncIssuesSheet } = await import('@/features/sync/SyncIssuesSheet');

describe('SyncIssuesSheet', () => {
  it('hiện lý do dễ hiểu; bỏ thao tác phải xác nhận rồi mới gọi discardRejected', async () => {
    render(<SyncIssuesSheet open onOpenChange={() => {}} />);
    expect(screen.getByText('Nguyễn Thị Lan')).toBeTruthy();
    expect(
      screen.getByText(/Dữ liệu không hợp lệ theo quy tắc của máy chủ \(customers_care_stage_check\)/),
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Thay đổi: bậc chăm sóc')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thao tác này' }));
    expect(discardRejected).not.toHaveBeenCalled();
    expect(screen.getByText(/Khách sẽ quay về dữ liệu đang có trên máy chủ/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Giữ lại' }));
    expect(discardRejected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thao tác này' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bỏ' }));
    await waitFor(() => expect(discardRejected).toHaveBeenCalledWith(7));
    expect(refresh).toHaveBeenCalled();
  });
});
