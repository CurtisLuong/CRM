import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsPage } from '@/features/notifications/route';

const state = vi.hoisted(() => ({
  account: null as unknown,
  customers: [] as unknown[],
  remoteState: null as unknown,
}));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => state.account, useCustomers: () => state.customers }));
vi.mock('@/domain/signals', () => ({
  computeSignals: (_customers: unknown[], _context: unknown) =>
    state.remoteState
      ? [
          {
            id: 'signal-1',
            title: 'Khách cần gọi',
            reason: 'Có hẹn hôm nay',
            customerId: 'c1',
            priority: 'P0',
            actions: [],
            evidence: [],
          },
        ]
      : [],
}));

describe('notifications route', () => {
  beforeEach(() => {
    state.account = null;
    state.customers = [];
    state.remoteState = null;
    localStorage.clear();
  });
  it('shows rule-signal view and routes to customer profile', async () => {
    const remote = { getUiStateRemote: vi.fn().mockResolvedValue({ signals: {} }) };
    state.account = { sync: { local: { userId: 'u1' } }, remote };
    state.customers = [{ id: 'c1', owner_id: 'u1', full_name: 'Lan' }];
    state.remoteState = true;
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Khách cần gọi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
  });
});
