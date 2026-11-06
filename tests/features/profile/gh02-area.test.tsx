import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { createCatalogRepository } from '@/data/repositories/catalog';
import { CustomerSync } from '@/data/sync';
import type { Customer } from '@/domain/customer';
import { estimatePrice, type PriceCatalog } from '@/features/profile/model';
import { ProfileNeedsFields } from '@/features/profile/needs';
import { ToastProvider } from '@/ui';

const customer = (patch: Record<string, unknown> = {}) =>
  ({
    id: 'c1',
    owner_id: 'gh02',
    full_name: 'Lan',
    phone: '0900000000',
    projects: ['Vin TC'],
    ...patch,
  }) as Customer;

let local: LocalDB;
let catalog: ReturnType<typeof createCatalogRepository>;

beforeEach(async () => {
  local = await LocalDB.open('gh02', new IDBFactory());
  const data = {
    projects: [{ id: 'p1', name: 'Vin TC', typical_price_per_m2: 25_000_000 }],
    buildings: [{ id: 'b1', project_id: 'p1', code: 'A1' }],
    units: [
      {
        id: 'u1',
        project_id: 'p1',
        building_id: 'b1',
        code: '1201',
        apt_type: '2N',
        price_per_m2_override: 27_000_000,
      },
      { id: 'u2', project_id: 'p1', building_id: 'b1', code: '1202', apt_type: '2N', area_m2: 65 },
      { id: 'u3', project_id: 'p1', building_id: 'b1', code: '1203' },
    ],
    projectTypes: [{ project_id: 'p1', apt_type: '2N', typical_area_m2: 60 }],
    buildingTypes: [{ project_id: 'p1', building_id: 'b1', apt_type: '2N', area_m2: 62 }],
  };
  const storage = { getItem: () => JSON.stringify(data) } as unknown as Storage;
  catalog = createCatalogRepository(new CustomerSync(local, {} as SupabaseClient, () => false), storage);
});

afterEach(() => local.close());

describe('GH-02 — diện tích hiệu lực và Giá ước tính', () => {
  it.each([
    ['dự án + loại căn', { apt_type: '2N' }, 60, 25_000_000, 1_500_000_000],
    ['loại căn của toà', { apt_type: '2N', building_code: 'A1' }, 62, 25_000_000, 1_550_000_000],
    [
      'căn dùng diện tích của toà và giá riêng',
      { building_code: 'A1', apt_code: '1201' },
      62,
      27_000_000,
      1_674_000_000,
    ],
    ['diện tích riêng của khách', { apt_type: '2N', apt_area: 45 }, 45, 25_000_000, 1_125_000_000],
  ])('%s', (_name, patch, area, pricePerM2, total) => {
    const row = customer(patch);
    const before = structuredClone(row);
    const estimate = estimatePrice(row, catalog);
    expect(estimate).toMatchObject({ area, pricePerM2, total });
    expect(estimate.areaSource).toBe('apt_area' in patch ? undefined : 'catalog');
    expect(row).toEqual(before);
  });

  it('chỉ có dự án, không loại căn / diện tích → vẫn thiếu diện tích', () => {
    expect(estimatePrice(customer(), catalog)).toEqual({ missing: 'area' });
  });

  it('diện tích riêng của căn thắng loại căn, diện tích khách thắng căn', () => {
    const patch = { building_code: 'A1', apt_code: '1202', apt_type: '1N' };
    expect(estimatePrice(customer(patch), catalog)).toMatchObject({ area: 65, total: 1_625_000_000 });
    expect(estimatePrice(customer({ ...patch, apt_area: 45 }), catalog)).toEqual({
      area: 45,
      total: 1_125_000_000,
      pricePerM2: 25_000_000,
    });
  });

  it('toà / căn không khớp thì dùng đúng lớp trên và loại căn của khách', () => {
    expect(estimatePrice(customer({ apt_type: '2N', building_code: 'Lạ', apt_code: '1201' }), catalog)).toMatchObject({
      area: 60,
      pricePerM2: 25_000_000,
    });
    for (const apt_code of ['Lạ', '1203']) {
      expect(estimatePrice(customer({ apt_type: '2N', building_code: 'A1', apt_code }), catalog)).toMatchObject({
        area: 62,
        pricePerM2: 25_000_000,
      });
    }
  });

  it('chọn dự án quan tâm đầu tiên có trong Giỏ hàng', () => {
    expect(estimatePrice(customer({ projects: ['Dự án cũ', 'Vin TC'], apt_type: '2N' }), catalog)).toMatchObject({
      area: 60,
      total: 1_500_000_000,
    });
  });

  it('catalog cũ thiếu hàm diện tích vẫn giữ hành vi cũ', () => {
    const { unitArea: _unitArea, typicalArea: _typicalArea, ...oldCatalog } = catalog;
    const legacy: PriceCatalog = oldCatalog;
    expect(estimatePrice(customer({ apt_type: '2N' }), legacy)).toEqual({ missing: 'area' });
    expect(estimatePrice(customer({ apt_area: 45 }), legacy)).toEqual({
      total: 1_125_000_000,
      area: 45,
      pricePerM2: 25_000_000,
    });
    expect(estimatePrice(customer({ apt_type: '2N' }), null)).toEqual({ missing: 'area' });
    expect(estimatePrice(customer({ apt_area: 45 }), null)).toEqual({ missing: 'project' });
  });

  it('thiếu giá vẫn giữ diện tích kế thừa để hiển thị', () => {
    const noPrice = { ...catalog, projectPrice: () => null };
    expect(estimatePrice(customer({ apt_type: '2N' }), noPrice)).toEqual({
      missing: 'price',
      area: 60,
      areaSource: 'catalog',
    });
  });
});

function NeedsHarness({ onSave }: { onSave: (key: keyof Customer, value: unknown) => void }) {
  const [row, setRow] = useState(customer({ apt_type: '2N' }));
  return (
    <ToastProvider>
      <ProfileNeedsFields
        customer={row}
        writable
        busy={false}
        showEmpty={false}
        stayVisible={new Set()}
        onToggleSupplement={() => {}}
        onSaveField={(key, value) => {
          onSave(key, value);
          setRow((prev) => ({ ...prev, [key]: value }));
        }}
        onSaveProjects={async () => true}
        catalog={null}
        online={false}
        projectsOpen={false}
        onToggleProjects={() => {}}
        estimate={estimatePrice(row, catalog)}
      />
    </ToastProvider>
  );
}

// Curtis 06/11: Giá căn = thuần × (1 + VAT 5% + KPBT 2%) + phí: 1,5 tỷ thuần → 1,605; 1,125 → 1,204.
it('gợi ý hiện ngay; chỉ lưu khi nhập/xoá, xoá thì quay về Giỏ hàng', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<NeedsHarness onSave={onSave} />);
  const input = screen.getByLabelText('Diện tích (m²)') as HTMLInputElement;
  expect(input.value).toBe('');
  expect(input.placeholder).toBe('60');
  expect(screen.getByText('60 m² · theo Giỏ hàng')).toBeTruthy();
  expect((screen.getByLabelText('Giá căn (tỷ)') as HTMLInputElement).value).toBe('1,605');
  expect(screen.getByRole('button', { name: 'Mở rộng (5)' })).toBeTruthy();
  await user.click(input);
  await user.tab();
  expect(onSave).not.toHaveBeenCalled();

  await user.type(input, '45');
  await user.tab();
  expect(onSave).toHaveBeenLastCalledWith('apt_area', 45);
  expect((screen.getByLabelText('Giá căn (tỷ)') as HTMLInputElement).value).toBe('1,204');
  expect(screen.queryByText('60 m² · theo Giỏ hàng')).toBeNull();

  await user.clear(input);
  await user.tab();
  expect(onSave).toHaveBeenLastCalledWith('apt_area', null);
  expect(onSave).toHaveBeenCalledTimes(2);
  expect((screen.getByLabelText('Giá căn (tỷ)') as HTMLInputElement).value).toBe('1,605');
  expect(screen.getByText('60 m² · theo Giỏ hàng')).toBeTruthy();
});
