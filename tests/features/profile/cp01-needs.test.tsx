import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { route } from '@/features/profile/route';
import { ToastProvider } from '@/ui';

const update = vi.fn();
let customer: Customer;
let online = false;
let catalogRows: Array<{ id: string; name: string; archived_at?: string | null }> = [];
const catalog = {
  projects: () => catalogRows,
  load: vi.fn(async () => true),
  onChange: vi.fn(() => () => {}),
  addProject: vi.fn(async (name: string) => {
    const row = { id: `p-${catalogRows.length + 1}`, name };
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

const tree = () => (
  <MemoryRouter>
    <ToastProvider>{cloneElement(route.element as ReactElement)}</ToastProvider>
  </MemoryRouter>
);
const wrap = () => render(tree());
const rerenderProfile = (view: ReturnType<typeof render>) => view.rerender(tree());

const base = (overrides: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Nguyễn Lan',
    phone: '0901234567',
    contact_prefs: {},
    ...overrides,
  }) as Customer;

beforeEach(() => {
  update.mockReset().mockResolvedValue(undefined);
  catalogRows = [];
  online = false;
  catalog.projects = () => catalogRows;
  customer = base();
});

describe('CP-01 — tab mặc định và ô nhu cầu', () => {
  it('mở hồ sơ mặc định tab Nhu cầu & căn, thứ tự needs → memory → timeline → docs → loan', () => {
    wrap();
    const list = screen.getByRole('tablist', { name: 'Nội dung hồ sơ khách' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Nhu cầu & căn',
      'Trí nhớ',
      'Dòng thời gian0',
      'Tài liệu0',
      'Tính vay',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('ô trống ẩn sau Bổ sung (n); số 0 vẫn hiện; mở/đóng không ghi dữ liệu', async () => {
    customer = base({ purpose: 'Ở', apt_area: 0 });
    const user = userEvent.setup();
    wrap();

    expect(screen.getByRole('combobox', { name: 'Mục đích mua' })).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: 'Diện tích (m²)' }) as HTMLInputElement).value).toBe('0');
    expect(screen.queryByLabelText('Loại căn')).toBeNull();
    expect(screen.queryByLabelText('Mã căn')).toBeNull();

    // 9 ô, 2 ô đã có giá trị (0 tính là có) → còn 7 ô trống đang ẩn.
    const toggle = screen.getByRole('button', { name: 'Bổ sung (7)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Loại căn')).toBeTruthy();
    expect(screen.getByLabelText('Mã căn')).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Loại căn')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('ô vừa xoá không biến mất dưới tay; mở khách lần sau mới ẩn', async () => {
    customer = base({ purpose: 'Ở', apt_area: 0 });
    const user = userEvent.setup();
    const view = wrap();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Mục đích mua' }), '');
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ purpose: null })));

    // Mô phỏng repository đã ghi: cùng khách, purpose rỗng nhưng vẫn hiện vì có giá trị lúc mở.
    customer = base({ purpose: null, apt_area: 0 });
    rerenderProfile(view);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Mục đích mua' })).toBeTruthy());

    // Đổi tab rồi quay lại trong cùng khách vẫn giữ ô vừa xoá.
    await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
    await user.click(screen.getByRole('tab', { name: 'Nhu cầu & căn' }));
    expect(screen.getByRole('combobox', { name: 'Mục đích mua' })).toBeTruthy();

    // Sang khách khác → lần mở mới, ô trống ẩn lại.
    customer = base({ id: 'c2', purpose: null, apt_area: 0 });
    rerenderProfile(view);
    await waitFor(() => expect(screen.queryByLabelText('Mục đích mua')).toBeNull());
  });

  it('khách chỉ xem: ẩn ô trống và không có nút Bổ sung', () => {
    customer = base({ purpose: 'Ở', archived_at: '2026-10-20T00:00:00.000Z' });
    wrap();
    expect(screen.getByRole('combobox', { name: 'Mục đích mua' })).toHaveProperty('disabled', true);
    expect(screen.queryByLabelText('Loại căn')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Bổ sung/ })).toBeNull();
  });

  it('mở khách khác reset tab needs và đóng Bổ sung/Nâng cao', async () => {
    customer = base({ purpose: 'Ở' });
    const user = userEvent.setup();
    const view = wrap();

    await user.click(screen.getByRole('button', { name: /^Bổ sung/ }));
    await user.click(screen.getByRole('button', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
    await user.click(screen.getByRole('button', { name: /^Bổ sung/ }));
    expect(screen.getByRole('button', { name: /^Bổ sung/ }).getAttribute('aria-expanded')).toBe('true');

    customer = base({ id: 'c2', purpose: 'Ở' });
    rerenderProfile(view);

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Nhu cầu & căn' }).getAttribute('aria-selected')).toBe('true'),
    );
    expect(screen.getByRole('button', { name: /^Bổ sung/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Nâng cao' }).getAttribute('aria-expanded')).toBe('false');

    await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
    expect(screen.getByRole('button', { name: /^Bổ sung/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('một nút Nâng cao chứa Sở thích BĐS + Nhu cầu theo đợt + Người cùng quyết định, giữ khoá lạ advanced', async () => {
    customer = base({ advanced: { x_keep: { a: 1 }, must_have: 'Gần trường' } });
    const user = userEvent.setup();
    wrap();

    expect(screen.queryByText('Sở thích bất động sản')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Nâng cao' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Nâng cao' }));

    expect(screen.getByText('Sở thích bất động sản')).toBeTruthy();
    expect(screen.getByText('Nhu cầu theo đợt')).toBeTruthy();
    expect(screen.getByLabelText('Tên người cùng quyết định')).toBeTruthy();

    const area = screen.getByLabelText('Khu vực');
    await user.clear(area);
    await user.type(area, 'Thuỷ Nguyên');
    await user.tab();
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        'c1',
        expect.objectContaining({
          advanced: { x_keep: { a: 1 }, must_have: 'Gần trường', pref_area: 'Thuỷ Nguyên' },
        }),
      ),
    );
  });

  it('Nhu cầu theo đợt ở route chọn dự án từ catalog bằng combobox, giữ đợt cũ', async () => {
    catalogRows = [
      { id: 'p-a', name: 'Dự án A' },
      { id: 'p-b', name: 'Dự án B' },
    ];
    customer = base({ interests: [{ id: 'old', project: 'Đợt cũ', status: 'open', x_keep: 1 }] });
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: 'Nâng cao' }));

    const select = screen.getByRole('combobox', { name: 'Dự án quan tâm mới' }) as HTMLSelectElement;
    expect(Array.from(select.options, (option) => option.value)).toEqual(['', 'Dự án A', 'Dự án B']);
    await user.selectOptions(select, 'Dự án B');
    await user.click(screen.getByRole('button', { name: 'Thêm đợt' }));

    expect(update).toHaveBeenLastCalledWith(
      'c1',
      expect.objectContaining({
        interests: [
          { id: 'old', project: 'Đợt cũ', status: 'open', x_keep: 1 },
          expect.objectContaining({ project: 'Dự án B', status: 'open', source: 'sale' }),
        ],
      }),
    );
  });
});
