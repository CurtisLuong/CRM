import { fireEvent, render, screen } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { route } from '@/features/team/route';

const state = vi.hoisted(() => ({ account: null as unknown, online: true }));
vi.mock('@/data/hooks', () => ({ useCustomers: () => [], useRepositoryAccount: () => state.account }));
vi.mock('@/ui', async () => {
  const actual = await vi.importActual<typeof import('@/ui')>('@/ui');
  return { ...actual, useToast: () => vi.fn() };
});
const member = { user_id: 'u1', full_name: 'Nguyễn Ánh', is_me: true };
function account(rpc = vi.fn().mockResolvedValue({ data: [], error: null })) {
  state.account = {
    sync: { local: { userId: 'u1', assertOpen: vi.fn() }, isOnline: () => state.online, client: { rpc } },
  };
  return rpc;
}

describe('team loading explanations (L2)', () => {
  beforeEach(() => {
    state.account = null;
    state.online = true;
    localStorage.clear();
  });

  it('asks unauthenticated users to sign in without diagnosing SQL', () => {
    render(route.element);
    expect(screen.getByText(/Bạn chưa đăng nhập/)).toBeTruthy();
    expect(screen.queryByText(/SQL\//)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tải lại' })).toBeNull();
  });

  it('shows offline cached members and retries when connectivity returns', async () => {
    state.online = false;
    localStorage.setItem('crm_team:u1', JSON.stringify([member]));
    const rpc = account();
    render(route.element);
    expect(await screen.findByText(/Ngoại tuyến/)).toBeTruthy();
    expect(screen.getByText('Nguyễn Ánh · Bạn')).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByText(/SQL\//)).toBeNull();
    state.online = true;
    fireEvent(window, new Event('online'));
    expect(await screen.findByText(/Nhóm chưa có thành viên/)).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('team_list');
  });

  it('distinguishes an empty team from a failed request', async () => {
    account();
    render(route.element);
    expect(await screen.findByText(/Nhóm chưa có thành viên/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/SQL\//)).toBeNull();
  });

  it('reports the server reason and lets users retry without suggesting SQL', async () => {
    const rpc = account(
      vi
        .fn()
        .mockResolvedValueOnce({ error: { code: '42501', message: 'Không có quyền xem nhóm' } })
        .mockResolvedValueOnce({ data: [member], error: null }),
    );
    render(route.element);
    expect((await screen.findByRole('alert')).textContent).toContain('Không có quyền xem nhóm');
    expect(screen.queryByText(/SQL\//)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(await screen.findByText('Nguyễn Ánh · Bạn')).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['PGRST202', '42883'])('suggests group setup only when team_list is missing (%s)', async (code) => {
    account(vi.fn().mockResolvedValue({ error: { code, message: 'Could not find the function public.team_list' } }));
    render(route.element);
    expect((await screen.findByRole('alert')).textContent).toContain('SQL/add_team_assign.sql');
  });

  it('does not suggest SQL when another function is missing', async () => {
    account(vi.fn().mockResolvedValue({ error: { code: '42883', message: 'function unknown_helper does not exist' } }));
    render(route.element);
    expect((await screen.findByRole('alert')).textContent).toContain('unknown_helper');
    expect(screen.queryByText(/SQL\//)).toBeNull();
  });

  it('identifies an expired session', async () => {
    account(vi.fn().mockResolvedValue({ error: { code: 'PGRST301', message: 'JWT expired' } }));
    render(route.element);
    expect(await screen.findByText(/Phiên đăng nhập không còn hợp lệ/)).toBeTruthy();
    expect(screen.queryByText(/SQL\//)).toBeNull();
  });

  it('ignores a request resolving after sign-out', async () => {
    let resolve: (value: unknown) => void = () => {};
    account(
      vi.fn().mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      ),
    );
    const view = render(route.element);
    expect(screen.getByText(/Đang tải danh sách nhóm/)).toBeTruthy();
    state.account = null;
    view.rerender(cloneElement(route.element as ReactElement));
    resolve({ data: [member], error: null });
    await screen.findByText(/Bạn chưa đăng nhập/);
    expect(screen.queryByText('Nguyễn Ánh · Bạn')).toBeNull();
    expect(localStorage.getItem('crm_team:u1')).toBeNull();
  });
});
