import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { route } from '@/features/profile/route';
import { ToastProvider } from '@/ui';

const update = vi.fn();
let customer: Customer;
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => false },
  customers: { update },
  remote: { listDocuments: async () => [] },
};
vi.mock('@/data/hooks', () => ({
  useCustomer: () => customer,
  useRepositoryAccount: () => account,
}));

const wrap = () =>
  render(
    <MemoryRouter>
      <ToastProvider>{route.element}</ToastProvider>
    </MemoryRouter>,
  );

const base = (overrides: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Nguyễn Lan',
    phone: '0901234567',
    gender: 'Nữ',
    marital_status: 'Độc thân',
    occupation: 'Giáo viên',
    contact_prefs: {},
    ...overrides,
  }) as Customer;

beforeEach(() => {
  update.mockReset().mockResolvedValue(undefined);
  customer = base();
});

describe('CL-03 — hồ sơ gọn', () => {
  it('Bổ sung (n) ẩn/hiện ô trống; Họ tên + SĐT luôn hiện', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
    expect(screen.getByLabelText('Họ tên')).toBeTruthy();
    expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
    expect(screen.queryByLabelText('Thu nhập')).toBeNull();
    expect(screen.queryByLabelText('Nơi ở')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Ngày sinh' })).toBeNull();

    const toggle = screen.getByRole('button', { name: /^Bổ sung/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Thu nhập')).toBeTruthy();
    expect(screen.getByLabelText('Nơi ở')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Ngày sinh' })).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Thu nhập')).toBeNull();
  });

  it('khách chỉ xem: ô trống ẩn và không có nút Bổ sung', async () => {
    customer = base({ archived_at: '2026-10-20T00:00:00.000Z' });
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
    expect(screen.getByLabelText('Số điện thoại')).toHaveProperty('disabled', true);
    expect(screen.queryByLabelText('Thu nhập')).toBeNull();
    expect(screen.queryByLabelText('Nơi ở')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Ngày sinh' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Bổ sung/ })).toBeNull();
  });

  it('Nhu cầu theo đợt + Người cùng quyết định chỉ hiện sau Nâng cao ở tab Nhu cầu & căn', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('tab', { name: 'Nhu cầu & căn' }));
    expect(screen.queryByText('Nhu cầu theo đợt')).toBeNull();
    expect(screen.queryByLabelText('Dự án quan tâm mới')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Nâng cao' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Nhu cầu theo đợt')).toBeTruthy();
    expect(screen.getByLabelText('Dự án quan tâm mới')).toBeTruthy();
    expect(screen.getByLabelText('Tên người cùng quyết định')).toBeTruthy();
  });

  it('Ngày sinh gõ đủ ngày/tháng/năm ghi dob + menh + cung trong một lần lưu', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
    await user.click(screen.getByRole('button', { name: /^Bổ sung/ }));
    await user.type(screen.getByRole('textbox', { name: 'Ngày sinh — ngày/tháng/năm' }), '15/08/1985');
    await user.tab();
    expect(update).toHaveBeenLastCalledWith(
      'c1',
      expect.objectContaining({
        dob: '1985-08-15',
        menh: 'Mệnh Kim — Hải Trung Kim (Ất Sửu, 1985 AL)',
        cung: 'Sư Tử',
        field_meta: expect.objectContaining({ dob: expect.objectContaining({ by: 'sale' }) }),
      }),
    );
  });
});
