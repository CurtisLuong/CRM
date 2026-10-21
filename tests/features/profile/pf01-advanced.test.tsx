import { render, screen, waitFor, within } from '@testing-library/react';
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

const openMemory = async (user: ReturnType<typeof userEvent.setup>) => {
  wrap();
  await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
};

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
    advanced: { life_stage: 'Mới cưới', pain_points: 'Nhà thuê chật', x_old: 1 },
    field_meta: { x_future: { keep: true } },
  } as Customer;
});

describe('PF-01 — khu Nâng cao mặc định đóng', () => {
  it('mở hồ sơ → ô Bối cảnh sống ẩn; bấm Nâng cao → hiện; bấm lại → ẩn', async () => {
    const user = userEvent.setup();
    await openMemory(user);
    expect(screen.queryByLabelText('Bối cảnh sống')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Nâng cao' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Bối cảnh sống')).toBeTruthy();
    expect(screen.getByLabelText('Ngày sinh')).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Bối cảnh sống')).toBeNull();
  });

  it('Tài sản đúng 3 ô nhập; ghi cũ tài chính chỉ đọc', async () => {
    customer = {
      ...customer,
      advanced: { ...customer.advanced, monthly_payment: 8_000_000 },
    } as Customer;
    const user = userEvent.setup();
    await openMemory(user);
    await user.click(screen.getByRole('button', { name: 'Nâng cao' }));
    const assets = screen.getByRole('group', { name: 'Tài sản' });
    expect(within(assets).getAllByRole('spinbutton')).toHaveLength(3);
    expect(within(assets).getByLabelText('Giá trị tài sản')).toBeTruthy();
    expect(within(assets).getByLabelText('Vốn hiện có')).toBeTruthy();
    expect(within(assets).getByLabelText('Nhu cầu vay')).toBeTruthy();
    expect(within(assets).getByText(/Khoản trả hàng tháng chấp nhận/)).toBeTruthy();
    expect(within(assets).queryByLabelText('Khoản trả hàng tháng chấp nhận')).toBeNull();
  });

  it('chép ghi cũ chỉ điền vào ô, chưa lưu; rời ô mới ghi advanced giữ khoá cũ + khoá lạ', async () => {
    const user = userEvent.setup();
    await openMemory(user);
    await user.click(screen.getByRole('button', { name: 'Nâng cao' }));
    expect(screen.getByText('Giai đoạn cuộc sống')).toBeTruthy();
    expect(screen.getByText('Nỗi đau hiện tại')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Chép ghi cũ vào ô' }));
    const field = screen.getByLabelText('Bối cảnh sống') as HTMLTextAreaElement;
    expect(field.value).toBe('- Giai đoạn cuộc sống: Mới cưới\n- Nỗi đau hiện tại: Nhà thuê chật');
    expect(update).not.toHaveBeenCalled();

    await user.tab();
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        'c1',
        expect.objectContaining({
          advanced: {
            life_stage: 'Mới cưới',
            pain_points: 'Nhà thuê chật',
            x_old: 1,
            life_context: '- Giai đoạn cuộc sống: Mới cưới\n- Nỗi đau hiện tại: Nhà thuê chật',
          },
        }),
      ),
    );
  });

  it('ô gộp đã có chữ → không còn khối ghi cũ', async () => {
    customer = {
      ...customer,
      advanced: { ...customer.advanced, life_context: 'Đã ghi trước đó' },
    } as Customer;
    const user = userEvent.setup();
    await openMemory(user);
    await user.click(screen.getByRole('button', { name: 'Nâng cao' }));
    expect((screen.getByLabelText('Bối cảnh sống') as HTMLTextAreaElement).value).toBe('Đã ghi trước đó');
    expect(screen.queryByRole('button', { name: 'Chép ghi cũ vào ô' })).toBeNull();
    expect(screen.queryByText('Giai đoạn cuộc sống')).toBeNull();
  });
});

describe('PF-01 — Sở thích bất động sản ở tab Nhu cầu & căn', () => {
  it('hiện sẵn đúng 3 ô; sửa Khu vực giữ khoá lạ trong advanced', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('tab', { name: 'Nhu cầu & căn' }));
    const section = screen.getByRole('heading', { name: 'Sở thích bất động sản' }).parentElement as HTMLElement;
    expect(within(section).getAllByRole('textbox')).toHaveLength(3);
    expect(within(section).getByLabelText('Khu vực')).toBeTruthy();
    expect(within(section).getByLabelText('Loại sản phẩm')).toBeTruthy();
    expect(within(section).getByLabelText('Điều kiện')).toBeTruthy();

    const area = within(section).getByLabelText('Khu vực');
    await user.clear(area);
    await user.type(area, 'Thuỷ Nguyên');
    await user.tab();
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        'c1',
        expect.objectContaining({
          advanced: { life_stage: 'Mới cưới', pain_points: 'Nhà thuê chật', x_old: 1, pref_area: 'Thuỷ Nguyên' },
        }),
      ),
    );
  });
});
