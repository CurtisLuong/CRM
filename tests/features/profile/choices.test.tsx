import { render, screen, waitFor } from '@testing-library/react';
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

const fields = [
  { label: 'Giới tính', key: 'gender', old: 'Nữ', values: ['nam', 'nữ', 'khác'], tab: 'Trí nhớ' },
  {
    label: 'Tình trạng hôn nhân',
    key: 'marital_status',
    old: 'Độc thân',
    values: ['đã kết hôn', 'chưa kết hôn'],
    tab: 'Trí nhớ',
  },
  {
    label: 'Nghề nghiệp',
    key: 'occupation',
    old: 'Giáo viên',
    values: ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội'],
    tab: 'Trí nhớ',
  },
  {
    label: 'Mục đích mua',
    key: 'purpose',
    old: 'Mua cho thuê',
    values: ['Ở', 'Đầu tư', 'Cho tặng'],
    tab: 'Nhu cầu & căn',
  },
];
const wrap = () =>
  render(
    <MemoryRouter>
      <ToastProvider>{route.element}</ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  update.mockReset().mockResolvedValue(undefined);
  customer = {
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Nguyễn Lan',
    phone: '0901234567',
    gender: 'Nữ',
    marital_status: 'Độc thân',
    occupation: 'Giáo viên',
    purpose: 'Mua cho thuê',
    field_meta: { x_future: { keep: true } },
    x_import: { keep: true },
  } as Customer;
});

describe('schema-compatible profile choices', () => {
  it.each(fields)(
    'preserves $key until explicitly changed and offers only legacy-compatible choices',
    async (field) => {
      const user = userEvent.setup();
      wrap();
      await user.click(screen.getByRole('tab', { name: field.tab }));
      const select = screen.getByRole('combobox', { name: field.label }) as HTMLSelectElement;
      expect(select.value).toBe(field.old);
      expect(Array.from(select.options, (option) => option.value)).toEqual(['', field.old, ...field.values]);
      await user.click(select);
      await user.tab();
      await user.selectOptions(select, field.old);
      expect(update).not.toHaveBeenCalled();
      for (const value of field.values) {
        await user.selectOptions(select, value);
        await waitFor(() =>
          expect(update).toHaveBeenLastCalledWith(
            'c1',
            expect.objectContaining({
              [field.key]: value,
              field_meta: expect.objectContaining({
                x_future: { keep: true },
                [field.key]: expect.objectContaining({ by: 'sale', confirmed: true }),
              }),
            }),
          ),
        );
      }
      await user.selectOptions(select, '');
      await waitFor(() =>
        expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ [field.key]: null })),
      );
      for (const [, patch] of update.mock.calls) expect(Object.keys(patch)).toEqual([field.key, 'field_meta']);
      expect(customer[field.key]).toBe(field.old);
      expect(customer.x_import).toEqual({ keep: true });
    },
  );

  // D-025 (2026-10-22): khách đồng nghiệp chưa lưu trữ nay sửa được thông tin (tests/e2e/d025-team-info-edit.spec.ts);
  // khách đã lưu trữ — của mình hay của đồng nghiệp — vẫn chỉ xem.
  it.each([{ archived_at: '2026-10-17T00:00:00.000Z' }, { owner_id: 'u2', archived_at: '2026-10-17T00:00:00.000Z' }])(
    'keeps choices read-only for %j',
    async (overrides) => {
      customer = { ...customer, ...overrides };
      const user = userEvent.setup();
      wrap();
      for (const tab of ['Trí nhớ', 'Nhu cầu & căn']) {
        await user.click(screen.getByRole('tab', { name: tab }));
        for (const field of fields.filter((field) => field.tab === tab)) {
          const select = screen.getByRole('combobox', { name: field.label }) as HTMLSelectElement;
          expect(select.disabled).toBe(true);
          await user.selectOptions(select, field.values[0] as string);
        }
      }
      expect(update).not.toHaveBeenCalled();
    },
  );
});
