import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { CustomerMemory } from '@/features/profile/memory';

const base = (overrides: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Lan',
    phone: '0901234567',
    ...overrides,
  }) as Customer;

describe('CustomerMemory', () => {
  it('adds another interest cycle without replacing prior entries or their unknown fields', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomerMemory
        customer={base({ interests: [{ id: 'old', project: 'Dự án cũ', status: 'open', x_keep: 1 }] })}
        writable
        onSave={onSave}
        now={Date.parse('2026-10-17T00:00:00Z')}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Dự án quan tâm mới' }), 'Dự án mới');
    await user.type(screen.getByRole('textbox', { name: 'Loại căn đợt mới' }), '2N-2WC');
    await user.type(screen.getByRole('spinbutton', { name: 'Ngân sách đợt mới' }), '1500000000');
    await user.type(screen.getByRole('textbox', { name: 'Mục đích đợt mới' }), 'Ở');
    await user.type(screen.getByRole('textbox', { name: 'Thời điểm đợt mới' }), '6 tháng');
    await user.click(screen.getByRole('button', { name: 'Thêm đợt' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        interests: [
          { id: 'old', project: 'Dự án cũ', status: 'open', x_keep: 1 },
          expect.objectContaining({
            project: 'Dự án mới',
            apt_type: '2N-2WC',
            budget_max: 1_500_000_000,
            purpose: 'Ở',
            timeline: '6 tháng',
            status: 'open',
            source: 'sale',
            at: '2026-10-17T00:00:00.000Z',
          }),
        ],
        field_meta: { interests: { by: 'sale', confirmed: true, at: expect.any(String) } },
      }),
      'Đã thêm đợt quan tâm',
    );
  });

  it('stores household role, optional phone and note as one customer fact', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<CustomerMemory customer={base()} writable onSave={onSave} now={Date.parse('2026-10-17T00:00:00Z')} />);
    await user.type(screen.getByRole('textbox', { name: 'Tên người cùng quyết định' }), 'Anh Minh');
    await user.type(screen.getByRole('textbox', { name: 'Vai trò người cùng quyết định' }), 'Chồng');
    await user.type(screen.getByRole('textbox', { name: 'Số điện thoại người cùng quyết định' }), '0912345678');
    await user.type(screen.getByRole('textbox', { name: 'Ghi chú người cùng quyết định' }), 'Cùng chọn căn');
    await user.click(screen.getByRole('button', { name: 'Thêm người' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        household: [
          expect.objectContaining({ name: 'Anh Minh', role: 'Chồng', phone: '0912345678', note: 'Cùng chọn căn' }),
        ],
      }),
      'Đã thêm người cùng quyết định',
    );
  });

  it('records a closure reason and extends retarget hints without dropping unknown keys', async () => {
    const onSave = vi.fn();
    render(
      <CustomerMemory
        customer={base({ care_stage: 'Nuôi dài hạn', retarget_hint: { note: 'old', x_future: true } })}
        writable
        onSave={onSave}
        now={Date.parse('2026-10-17T00:00:00Z')}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Lý do kết thúc' }), { target: { value: 'tai_chinh' } });
    fireEvent.change(screen.getByLabelText('Liên hệ lại sau ngày'), { target: { value: '2027-01-01' } });
    fireEvent.blur(screen.getByLabelText('Liên hệ lại sau ngày'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        close_reason: 'tai_chinh',
        field_meta: { close_reason: { by: 'sale', confirmed: true, at: '2026-10-17T00:00:00.000Z' } },
      }),
    );
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        retarget_hint: { note: 'old', x_future: true, after: '2027-01-01' },
        field_meta: { retarget_hint: { by: 'sale', confirmed: true, at: '2026-10-17T00:00:00.000Z' } },
      }),
    );
  });
});
