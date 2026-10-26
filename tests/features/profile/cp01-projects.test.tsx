import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { route } from '@/features/profile/route';
import { ToastProvider } from '@/ui';

const update = vi.fn();
let customer: Customer;
let online = true;
let catalogRows: Array<{ id: string; name: string; archived_at?: string | null }> = [];
const catalog = {
  projects: () => catalogRows,
  load: vi.fn(async () => true),
  onChange: vi.fn(() => () => {}),
  addProject: vi.fn(async (name: string) => {
    const row = { id: `p-${name}`, name };
    catalogRows = [...catalogRows, row];
    return row;
  }),
  archiveProject: vi.fn(async (id: string) => {
    catalogRows = catalogRows.filter((row) => row.id !== id);
  }),
};
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => online },
  customers: { update },
  remote: { listDocuments: async () => [] },
  catalog,
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

// PC-01 (Curtis 26/10): Dự án quan tâm là ô gọn, bấm mới mở phần chọn/sửa/xoá.
const openProjects = async () =>
  userEvent.setup().click(await screen.findByRole('button', { name: /^Dự án quan tâm/ }));

const base = (overrides: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Nguyễn Lan',
    phone: '0901234567',
    contact_prefs: {},
    field_meta: { x_future: { keep: true } },
    x_import: { keep: true },
    ...overrides,
  }) as Customer;

beforeEach(() => {
  update.mockReset().mockResolvedValue(undefined);
  catalog.addProject.mockClear();
  catalog.archiveProject.mockClear();
  catalogRows = [
    { id: 'p-a', name: 'Dự án A' },
    { id: 'p-b', name: 'Dự án B' },
  ];
  online = true;
  customer = base({ projects: ['Dự án A', 'D cũ'] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CP-01 — Dự án quan tâm chọn nhiều từ catalog', () => {
  it('chọn A + B lưu đúng mảng, giữ giá trị cũ và khoá lạ', async () => {
    const user = userEvent.setup();
    wrap();
    await openProjects();

    expect(screen.getByRole('checkbox', { name: 'Dự án A' })).toHaveProperty('checked', true);
    const b = screen.getByRole('checkbox', { name: 'Dự án B' });
    expect(b).toHaveProperty('checked', false);
    const legacy = screen.getByRole('list', { name: 'Dự án cũ trong hồ sơ' });
    expect(within(legacy).getByText(/D cũ/)).toBeTruthy();
    expect(within(legacy).getByText('(cũ/đã ngừng dùng)')).toBeTruthy();

    await user.click(b);
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith('c1', {
        projects: ['Dự án A', 'D cũ', 'Dự án B'],
        field_meta: {
          x_future: { keep: true },
          projects: expect.objectContaining({ by: 'sale', confirmed: true }),
        },
      }),
    );
  });

  it('bỏ chọn giá trị cũ không đụng tới dự án khác', async () => {
    const user = userEvent.setup();
    wrap();
    await openProjects();
    await user.click(screen.getByRole('button', { name: 'Bỏ chọn dự án D cũ (cũ/đã ngừng dùng)' }));
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        'c1',
        expect.objectContaining({
          projects: ['Dự án A'],
          field_meta: expect.objectContaining({ x_future: { keep: true } }),
        }),
      ),
    );
    // Không tự ghi lại các trường không liên quan trên bản ghi cũ.
    expect(customer.x_import).toEqual({ keep: true });
  });

  it('Thêm mới: tên rỗng báo lỗi; tên mới gọi addProject rồi mới chọn và báo thành công', async () => {
    const user = userEvent.setup();
    wrap();
    await openProjects();
    await user.click(screen.getByRole('button', { name: 'Thêm mới' }));
    await user.click(screen.getByRole('button', { name: 'Thêm dự án' }));
    expect(screen.getByRole('alert').textContent).toContain('không được để trống');
    expect(catalog.addProject).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: 'Tên dự án mới' }), '  Dự án C  ');
    await user.click(screen.getByRole('button', { name: 'Thêm dự án' }));
    expect(catalog.addProject).toHaveBeenCalledWith('Dự án C', undefined);
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        'c1',
        expect.objectContaining({ projects: ['Dự án A', 'D cũ', 'Dự án C'] }),
      ),
    );
    expect(await screen.findByText('Đã thêm dự án', { exact: true })).toBeTruthy();
  });

  it('tên trùng repository trả bản ghi cũ → không nhân đôi, không ghi hồ sơ', async () => {
    customer = base({ projects: ['Dự án A'] });
    const user = userEvent.setup();
    wrap();
    await openProjects();
    catalog.addProject.mockResolvedValueOnce({ id: 'p-a', name: 'Dự án A' });
    await user.click(screen.getByRole('button', { name: 'Thêm mới' }));
    await user.type(screen.getByRole('textbox', { name: 'Tên dự án mới' }), 'Dự án A');
    await user.click(screen.getByRole('button', { name: 'Thêm dự án' }));
    expect(await screen.findByText('Dự án đã có trong hồ sơ', { exact: true })).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('xoá dự án: hủy không gọi archive; xác nhận gọi archiveProject, không ghi hồ sơ', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    wrap();
    await openProjects();

    await user.click(screen.getByRole('button', { name: 'Lưu trữ dự án Dự án B' }));
    expect(confirm).toHaveBeenCalled();
    expect(catalog.archiveProject).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Lưu trữ dự án Dự án B' }));
    await waitFor(() => expect(catalog.archiveProject).toHaveBeenCalledWith('p-b'));
    expect(screen.getByText('Đã lưu trữ dự án', { exact: true })).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('lỗi server khi lưu trữ vẫn báo lỗi, không đổi hồ sơ', async () => {
    customer = base({ projects: ['Dự án A'] });
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    catalog.archiveProject.mockRejectedValueOnce(new Error('RLS từ chối'));
    wrap();
    await openProjects();
    await user.click(screen.getByRole('button', { name: 'Lưu trữ dự án Dự án A' }));
    expect(await screen.findByText('Chưa lưu trữ được dự án', { exact: true })).toBeTruthy();
    expect(screen.getByText('RLS từ chối')).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('offline: vẫn chọn dự án trong cache và lưu khách; thêm/xoá danh mục bị vô hiệu', async () => {
    online = false;
    const user = userEvent.setup();
    wrap();
    await openProjects();

    expect(screen.getByText(/Cần mạng để thêm hoặc lưu trữ dự án/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm mới' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Lưu trữ dự án Dự án B' })).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('checkbox', { name: 'Dự án B' }));
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        'c1',
        expect.objectContaining({ projects: ['Dự án A', 'D cũ', 'Dự án B'] }),
      ),
    );
  });

  it('khách chỉ xem hoặc đã lưu trữ: chỉ hiện tên, không quản lý danh mục', () => {
    customer = base({ projects: ['Dự án A', 'D cũ'], archived_at: '2026-10-20T00:00:00.000Z' });
    wrap();
    expect(screen.getByText('Dự án A')).toBeTruthy();
    expect(screen.getByText('(cũ/đã ngừng dùng)')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu trữ dự án/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm mới' })).toBeNull();
  });
});

it('giữ nguyên tên cũ khi chọn thêm và báo lỗi tải danh mục', async () => {
  customer = base({ projects: ['  Tên cũ  ', 'Dự án A'] });
  catalog.load.mockResolvedValueOnce(false);
  wrap();
  await openProjects();
  await screen.findByRole('alert');
  await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Dự án B' }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ projects: ['  Tên cũ  ', 'Dự án A', 'Dự án B'] }),
    ),
  );
});
