import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '@/features/notifications/Bell';

// PF-06: chuông header — số đỏ = số tín hiệu đang cần xử lý; 0 thì không hiện số; bấm → /thong-bao.

const state = vi.hoisted(() => ({ signals: [] as unknown[] }));
vi.mock('@/data/hooks', () => ({
  useRepositoryAccount: () => ({
    sync: { local: { userId: 'u1' } },
    remote: { getUiStateRemote: async () => undefined },
  }),
  useCustomers: () => [],
}));
vi.mock('@/domain/signals', () => ({ computeSignals: () => state.signals }));

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname}</span>;
}

const view = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <NotificationBell />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('NotificationBell', () => {
  beforeEach(() => {
    state.signals = [];
    localStorage.clear();
  });

  it('0 tín hiệu → aria-label "Thông báo", không có số', () => {
    view();
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeTruthy();
    expect(document.querySelector('[data-bell-count]')).toBeNull();
  });

  it('N tín hiệu → aria-label "Thông báo, N mục" và số hiện đúng', () => {
    state.signals = [{ id: 'a' }, { id: 'b' }];
    view();
    expect(screen.getByRole('button', { name: 'Thông báo, 2 mục' })).toBeTruthy();
    expect(document.querySelector('[data-bell-count]')?.textContent).toBe('2');
  });

  it('bấm chuông → đi tới /thong-bao', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getByTestId('where').textContent).toBe('/thong-bao');
  });
});
