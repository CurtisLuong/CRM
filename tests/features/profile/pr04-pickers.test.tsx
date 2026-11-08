import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { estimatePrice } from '@/features/profile/model';
import { ProfileNeedsFields } from '@/features/profile/needs';
import { ToastProvider } from '@/ui';

type Building = { id: string; project_id: string; code: string };
type Unit = { id: string; building_id: string; code: string; direction?: string; floor?: number; apt_type?: string };
let buildings: Building[];
let units: Unit[];
let online: boolean;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
const norm = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const projects = [
  { id: 'p1', name: 'Dự án A' },
  { id: 'p2', name: 'Dự án B' },
];
const update = vi.fn();
const getSnapshot = vi.fn<() => Customer[]>(() => []);
const catalog = {
  projectByName: (name: unknown) => projects.find((row) => norm(row.name) === norm(name)) ?? null,
  buildingByCode: (project: unknown, code: unknown) =>
    buildings.find((row) => row.project_id === project && norm(row.code) === norm(code)) ?? null,
  buildingsOf: (project: string) => buildings.filter((row) => row.project_id === project),
  unitByCode: (building: unknown, code: unknown) =>
    units.find((row) => row.building_id === building && norm(row.code) === norm(code)) ?? null,
  unitsOf: (building: string) => units.filter((row) => row.building_id === building),
  onChange: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  saveBuilding: vi.fn(async (row: { project_id: string; code: string }) => {
    if (!online) throw new Error('Cần có mạng để sửa giỏ hàng.');
    buildings.push({ id: 'created-building', ...row });
    emit();
  }),
  saveUnit: vi.fn(async (row: { building_id: string; code: string }) => {
    if (!online) throw new Error('Cần có mạng để sửa giỏ hàng.');
    units.push({ id: 'created-unit', ...row });
    emit();
  }),
  unitArea: () => 64,
  typicalArea: () => null,
  unitPrice: () => 20_000_000,
  buildingPrice: () => 20_000_000,
  projectPrice: () => 20_000_000,
};
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => ({ catalog, customers: { update, getSnapshot } }) }));

function Harness({ patch = {}, writable = true }: { patch?: Partial<Customer>; writable?: boolean }) {
  const [row, setRow] = useState({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Lan',
    phone: '0900000000',
    projects: ['Dự án cũ', 'Dự án A', 'Dự án B'],
    field_meta: { x_keep: { future: true } },
    ...patch,
  } as Customer);
  update.mockImplementation(async (_id: string, values: Partial<Customer>) =>
    setRow((prev) => ({ ...prev, ...values })),
  );
  return (
    <ToastProvider>
      <ProfileNeedsFields
        customer={row}
        writable={writable}
        busy={false}
        showEmpty
        stayVisible={new Set()}
        onSaveField={(key, value) => {
          void update(row.id, { [key]: value });
        }}
        onSaveProjects={async () => true}
        catalog={null}
        online={online}
        projectsOpen={false}
        onToggleProjects={() => {}}
        estimate={estimatePrice(row, catalog)}
      />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  listeners.clear();
  getSnapshot.mockReturnValue([]);
  buildings = [
    { id: 'a1', project_id: 'p1', code: 'A1' },
    { id: 'a2', project_id: 'p1', code: 'A2' },
    { id: 'b1', project_id: 'p2', code: 'B1' },
  ];
  units = [
    { id: 'u1', building_id: 'a1', code: '101', direction: 'Đông Nam', floor: 0, apt_type: '2N' },
    { id: 'u2', building_id: 'a2', code: '201', direction: 'Bắc', floor: 2, apt_type: '1N' },
    { id: 'u3', building_id: 'b1', code: '301' },
  ];
  catalog.saveBuilding.mockImplementation(async (row) => {
    if (!online) throw new Error('Cần có mạng để sửa giỏ hàng.');
    buildings.push({ id: 'created-building', ...row });
    emit();
  });
  catalog.saveUnit.mockImplementation(async (row) => {
    if (!online) throw new Error('Cần có mạng để sửa giỏ hàng.');
    units.push({ id: 'created-unit', ...row });
    emit();
  });
});

describe('PR-04 — toà/căn theo Giỏ hàng', () => {
  it('toà theo dự án đầu tiên khớp, căn theo toà; không ghi khi mở', async () => {
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'A1', apt_code: 'căn cũ', apt_direction: 'đông nam' }} />);
    expect((screen.getByLabelText('Hướng') as HTMLSelectElement).value).toBe('Đông Nam');
    await user.click(screen.getByLabelText('Mã toà'));
    expect(screen.getByRole('button', { name: 'A2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'B1' })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText('Mã căn'));
    expect(screen.getByRole('button', { name: '101' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'căn cũ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '201' })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('mã toà cũ giữ lựa chọn riêng, mã căn vẫn gõ được khi toà chưa có trong Giỏ hàng', async () => {
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'toà cũ', apt_code: 'mã cũ', apt_direction: 'ĐN view hồ' }} />);
    expect((screen.getByLabelText('Mã căn') as HTMLInputElement).value).toBe('mã cũ');
    expect((screen.getByLabelText('Hướng') as HTMLSelectElement).value).toBe('ĐN view hồ');
    await user.click(screen.getByLabelText('Mã toà'));
    expect(screen.getByRole('button', { name: 'toà cũ' })).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('không có dự án khớp vẫn gõ tay và có gợi ý; chưa chọn toà thì mã căn gõ tay', async () => {
    const user = userEvent.setup();
    const view = render(<Harness patch={{ projects: ['Dự án cũ'] }} />);
    expect(screen.getByText('Chọn dự án quan tâm có trong Giỏ hàng để chọn toà/căn')).toBeTruthy();
    await user.type(screen.getByLabelText('Mã toà'), 'Tự nhập');
    await user.tab();
    expect(update).toHaveBeenCalledWith('c1', { building_code: 'Tự nhập' });
    view.unmount();
    render(<Harness />);
    expect(screen.getByRole('textbox', { name: 'Mã căn' })).toBeTruthy();
  });

  it('lọc danh sách và nhận thay đổi repository tức thì, huỷ đăng ký khi đóng', async () => {
    const user = userEvent.setup();
    const view = render(<Harness patch={{ building_code: 'A1' }} />);
    await user.click(screen.getByLabelText('Mã toà'));
    act(() => {
      buildings.push({ id: 'a3', project_id: 'p1', code: 'A3' });
      emit();
    });
    expect(screen.getByRole('button', { name: 'A3' })).toBeTruthy();
    await user.type(screen.getByLabelText('Tìm hoặc nhập mã toà'), 'a3');
    expect(screen.queryByRole('button', { name: 'A2' })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText('Mã căn'));
    act(() => {
      units.push({ id: 'u4', building_id: 'a1', code: '102' });
      emit();
    });
    expect(screen.getByRole('button', { name: '102' })).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it('chọn căn điền hướng/tầng/loại căn còn trống bằng một patch; diện tích vẫn kế thừa', async () => {
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'A1', apt_type: '  ' }} />);
    await user.click(screen.getByLabelText('Mã căn'));
    await user.click(screen.getByRole('button', { name: '101' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        apt_code: '101',
        apt_direction: 'Đông Nam',
        apt_floor: 0,
        apt_type: '2N',
        field_meta: expect.objectContaining({
          x_keep: { future: true },
          apt_code: expect.any(Object),
          apt_type: expect.any(Object),
        }),
      }),
    );
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('apt_area');
    expect((screen.getByLabelText('Diện tích (m²)') as HTMLInputElement).placeholder).toBe('64');
  });

  it('chọn căn giữ nguyên ô đã có, kể cả tầng 0 và hướng lạ', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        patch={{ building_code: 'A1', apt_direction: 'ĐN view hồ', apt_floor: 0, apt_type: '3N', apt_area: 45 }}
      />,
    );
    await user.click(screen.getByLabelText('Mã căn'));
    await user.click(screen.getByRole('button', { name: '101' }));
    const patch = update.mock.calls[0]?.[1];
    expect(patch).toMatchObject({ apt_code: '101' });
    for (const key of ['apt_direction', 'apt_floor', 'apt_type', 'apt_area']) expect(patch).not.toHaveProperty(key);
  });

  it('dùng bản khách local mới nhất để giữ ô và metadata vừa sửa trong lúc chờ', async () => {
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'A1' }} />);
    await user.click(screen.getByLabelText('Mã căn'));
    getSnapshot.mockReturnValueOnce([
      {
        id: 'c1',
        owner_id: 'u1',
        full_name: 'Lan',
        phone: '0900000000',
        building_code: 'A1',
        apt_direction: 'Bắc',
        apt_floor: 7,
        apt_type: '3N',
        field_meta: { just_saved: { future: true } },
      } as Customer,
    ]);
    await user.click(screen.getByRole('button', { name: '101' }));
    const patch = update.mock.lastCall?.[1];
    for (const key of ['apt_direction', 'apt_floor', 'apt_type']) expect(patch).not.toHaveProperty(key);
    expect(patch.field_meta).toHaveProperty('just_saved', { future: true });
  });

  it('thêm căn chuẩn hoá hướng đã biết trên căn mới, không đổi hướng cũ của khách', async () => {
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'A1', apt_direction: '  đông  nam ' }} />);
    await user.click(screen.getByLabelText('Mã căn'));
    await user.type(screen.getByLabelText('Tìm hoặc nhập mã căn'), '888');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(catalog.saveUnit).toHaveBeenCalledWith({ building_id: 'a1', code: '888', direction: 'Đông Nam' });
    expect(update.mock.lastCall?.[1]).not.toHaveProperty('apt_direction');
  });

  it('đổi toà xoá căn không thuộc toà mới trong cùng một lần lưu; giữ mã nếu toà mới cũng có', async () => {
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'A1', apt_code: '101' }} />);
    await user.click(screen.getByLabelText('Mã toà'));
    await user.click(screen.getByRole('button', { name: 'A2' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ building_code: 'A2', apt_code: null }));
    expect(screen.getByText('Đã lưu')).toBeTruthy();
    act(() => {
      units.push({ id: 'same-code', building_id: 'a2', code: '101' });
      emit();
    });
    await user.click(screen.getByLabelText('Mã căn'));
    await user.click(screen.getByRole('button', { name: '101' }));
    await user.click(screen.getByLabelText('Mã toà'));
    await user.click(screen.getByRole('button', { name: 'A1' }));
    expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ building_code: 'A1' }));
    expect(update.mock.lastCall?.[1]).not.toHaveProperty('apt_code');
  });

  it('Thêm toà khi danh sách trống, thêm căn mang theo các ô khách đã nhập', async () => {
    buildings = [];
    const user = userEvent.setup();
    render(<Harness patch={{ apt_direction: 'Đông', apt_floor: 12, apt_type: '2N', apt_area: 60 }} />);
    await user.click(screen.getByLabelText('Mã toà'));
    expect(screen.getByText('Chưa có')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeTruthy();
    await user.type(screen.getByLabelText('Tìm hoặc nhập mã toà'), 'A9');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(catalog.saveBuilding).toHaveBeenCalledWith({ project_id: 'p1', code: 'A9' });
    expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ building_code: 'A9' }));
    await user.click(screen.getByLabelText('Mã căn'));
    await user.type(screen.getByLabelText('Tìm hoặc nhập mã căn'), '1201');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(catalog.saveUnit).toHaveBeenCalledWith({
      building_id: 'created-building',
      code: '1201',
      direction: 'Đông',
      floor: 12,
      apt_type: '2N',
      area_m2: 60,
    });
    expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ apt_code: '1201' }));
    expect(units.some((row) => row.code === '1201')).toBe(true);
  });

  it('thêm căn bỏ các ô trống, lưu mã tay không cần tạo Giỏ hàng', async () => {
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'A1', apt_floor: 0 }} />);
    await user.click(screen.getByLabelText('Mã căn'));
    await user.type(screen.getByLabelText('Tìm hoặc nhập mã căn'), '999');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(catalog.saveUnit).toHaveBeenCalledWith({ building_id: 'a1', code: '999', floor: 0 });
    await user.click(screen.getByLabelText('Mã căn'));
    await user.type(screen.getByLabelText('Tìm hoặc nhập mã căn'), 'tay');
    await user.click(screen.getByRole('button', { name: 'Lưu mã vào hồ sơ' }));
    expect(catalog.saveUnit).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ apt_code: 'tay' }));
  });

  it.each(['toà', 'căn'] as const)(
    'ngoại tuyến: Thêm %s báo nguyên lỗi, không tạo và vẫn lưu mã khách',
    async (kind) => {
      online = false;
      const user = userEvent.setup();
      render(<Harness patch={{ building_code: 'A1' }} />);
      await user.click(screen.getByLabelText(kind === 'toà' ? 'Mã toà' : 'Mã căn'));
      await user.type(screen.getByLabelText(`Tìm hoặc nhập mã ${kind}`), 'mã mới');
      await user.click(screen.getByRole('button', { name: 'Thêm' }));
      expect(screen.getByRole('alert').textContent).toBe('Cần có mạng để sửa giỏ hàng.');
      expect(update).toHaveBeenLastCalledWith(
        'c1',
        expect.objectContaining({ [kind === 'toà' ? 'building_code' : 'apt_code']: 'mã mới' }),
      );
      expect(buildings.some((row) => row.code === 'mã mới')).toBe(false);
      expect(units.some((row) => row.code === 'mã mới')).toBe(false);
    },
  );

  it('lỗi quyền giữ nguyên chữ repository và vẫn lưu mã tay', async () => {
    catalog.saveUnit.mockRejectedValueOnce({ message: 'Không có quyền sửa Giỏ hàng.' });
    const user = userEvent.setup();
    render(<Harness patch={{ building_code: 'A1' }} />);
    await user.click(screen.getByLabelText('Mã căn'));
    await user.type(screen.getByLabelText('Tìm hoặc nhập mã căn'), '999');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(screen.getByRole('alert').textContent).toBe('Không có quyền sửa Giỏ hàng.');
    expect(update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ apt_code: '999' }));
  });

  it('hướng lạ chỉ đổi khi chọn, chọn — để xoá; chỉ xem không ghi', async () => {
    const user = userEvent.setup();
    const view = render(<Harness patch={{ apt_direction: 'ĐN view hồ' }} />);
    await user.selectOptions(screen.getByLabelText('Hướng'), 'Đông');
    expect(update).toHaveBeenLastCalledWith('c1', { apt_direction: 'Đông' });
    await user.selectOptions(screen.getByLabelText('Hướng'), '');
    expect(update).toHaveBeenLastCalledWith('c1', { apt_direction: null });
    view.unmount();
    update.mockClear();
    render(<Harness writable={false} patch={{ building_code: 'A1', apt_code: '101', apt_direction: 'Đông' }} />);
    await user.click(screen.getByLabelText('Mã toà'));
    expect(screen.queryByLabelText('Tìm hoặc nhập mã toà')).toBeNull();
    expect(update).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByLabelText('Hướng') as HTMLSelectElement).disabled).toBe(true));
  });
});
