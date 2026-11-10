import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';
import { profileTaskSide, splitBrief } from '@/features/profile/model';
import { route } from '@/features/profile/route';
import { ToastProvider } from '@/ui';

let customer: Customer;
const update = vi.fn();
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => false },
  customers: { update },
  remote: { listDocuments: async () => [] },
};
vi.mock('@/data/hooks', () => ({ useCustomer: () => customer, useRepositoryAccount: () => account }));
const mount = () =>
  render(
    <MemoryRouter>
      <ToastProvider>{route.element}</ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  update.mockReset().mockResolvedValue(undefined);
  customer = { id: 'c1', owner_id: 'u1', full_name: 'Khách thử', phone: '0901234567', interest_level: 20 } as Customer;
});

describe('KB-02 — Đã biết và quyền đổi mức quan tâm', () => {
  it.each([{ tasks: [] }, { tasks: [{ at: '2026-11-10T01:00:00Z', text: 'Gửi bảng giá', side: 'me' }] }])(
    'bỏ lời hứa cả khi đã biết hoặc còn thiếu (%j)',
    ({ tasks }) => {
      const parts = splitBrief(customerBrief({ ...customer, next_tasks: tasks } as Customer));
      expect([...parts.known, ...parts.missing].some((item) => item.key === 'promise')).toBe(false);
    },
  );
  it.each([
    ['me', 'Em hứa'],
    ['customer', 'Khách hẹn'],
    [undefined, ''],
  ])('side %s → %s chỉ ở hồ sơ', (side, label) => {
    expect(profileTaskSide(side)).toBe(label);
    customer = { ...customer, next_tasks: [{ at: '2026-11-10T01:00:00Z', text: 'Gửi bảng giá', side }] } as Customer;
    mount();
    const next = within(screen.getByRole('region', { name: 'Việc tiếp theo' }));
    expect(next.queryByText('Em hứa')?.textContent ?? next.queryByText('Khách hẹn')?.textContent ?? '').toBe(label);
  });
  it('ẩn cả thẻ Thông tin thêm khi chỉ có thông tin đăng ký và số gọi', () => {
    customer = {
      ...customer,
      source: ['facebook_ads'],
      created_at: '2026-11-10T01:00:00Z',
      call_attempts: [{ at: '2026-11-10T02:00:00Z', result: 'talked' }],
    };
    mount();
    expect(screen.queryByRole('region', { name: 'Thông tin thêm' })).toBeNull();
  });
  it.each([
    [20, 'Nóng', 60],
    [70, 'Nóng', null],
    [90, 'Ấm', 35],
    [90, 'Nguội', 0],
    [20, 'Lạnh', null],
  ] as const)('lưu thật từ %s chọn %s → %s, patch chỉ interest_level', async (current, label, expected) => {
    customer = { ...customer, interest_level: current };
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Mức quan tâm:/ }));
    const choices = screen.getByRole('group', { name: 'Mức quan tâm' });
    expect(
      within(choices)
        .getAllByRole('button')
        .map((el) => el.textContent),
    ).toEqual(['Lạnh', 'Ấm', 'Nóng', 'Nguội']);
    fireEvent.click(within(choices).getByRole('button', { name: label }));
    if (expected === null) expect(update).not.toHaveBeenCalled();
    else await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith('c1', { interest_level: expected }));
  });
  it('lưu lỗi giữ giá trị cũ và báo lỗi như các ô hồ sơ', async () => {
    update.mockRejectedValue(new Error('Lỗi lưu thử'));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Mức quan tâm: Lạnh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nóng' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Mức quan tâm' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Mức quan tâm: Lạnh' })).toBeTruthy();
    expect(await screen.findByText('Chưa lưu được')).toBeTruthy();
  });
  it('khách nhóm chỉ có chữ mức quan tâm dù vẫn sửa được hồ sơ', () => {
    customer = { ...customer, owner_id: 'u2' };
    mount();
    const known = within(screen.getByRole('region', { name: 'Đã biết' }));
    expect(known.getByText('Lạnh')).toBeTruthy();
    expect(known.queryByRole('button', { name: /^Mức quan tâm:/ })).toBeNull();
  });
});
