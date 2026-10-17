import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetargetPage } from '@/features/retarget/route';

const state = vi.hoisted(() => ({
  account: null as unknown,
  customers: [] as unknown[],
  remote: { getUiStateRemote: vi.fn(), saveUiStateRemote: vi.fn() },
}));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => state.account, useCustomers: () => state.customers }));
vi.mock('@/ui', async () => {
  const actual = await vi.importActual<typeof import('@/ui')>('@/ui');
  return { ...actual, useToast: () => vi.fn() };
});

describe('retarget route', () => {
  beforeEach(() => {
    localStorage.clear();
    state.remote.getUiStateRemote = vi.fn().mockResolvedValue(null);
    state.remote.saveUiStateRemote = vi.fn().mockResolvedValue(true);
    state.account = {
      sync: { local: { userId: 'u1' } },
      remote: state.remote,
      customers: { getSnapshot: () => state.customers, update: vi.fn() },
    };
    state.customers = [
      { id: 'ok', owner_id: 'u1', full_name: 'Khách được phép', phone: '0901', projects: ['Dự án A'], apt_type: '2N' },
      {
        id: 'dnc',
        owner_id: 'u1',
        full_name: 'Khách không liên hệ',
        phone: '0902',
        contact_prefs: { do_not_contact: true },
      },
      { id: 'team', owner_id: 'u2', full_name: 'Khách đồng nghiệp', phone: '0903' },
    ];
  });

  it('never renders DNC or another owner in the segment and saves a live filter', async () => {
    render(
      <MemoryRouter>
        <RetargetPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Khách được phép')).toBeTruthy();
    expect(screen.queryByText('Khách không liên hệ')).toBeNull();
    expect(screen.queryByText('Khách đồng nghiệp')).toBeNull();
    fireEvent.change(screen.getByLabelText('Loại căn'), { target: { value: '2N' } });
    fireEvent.change(screen.getByLabelText('Tên tệp'), { target: { value: 'Tệp 2N' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tệp' }));
    await waitFor(() =>
      expect(state.remote.saveUiStateRemote).toHaveBeenCalledWith({
        retarget: {
          segments: [expect.objectContaining({ name: 'Tệp 2N', filters: expect.objectContaining({ aptType: '2N' }) })],
        },
      }),
    );
  });
});
