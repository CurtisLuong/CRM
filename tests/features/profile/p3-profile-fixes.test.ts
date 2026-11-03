// Curtis 03/11 — hồ sơ khách: nhóm dưới tên, Giá ước tính, Vốn trong "Đã biết".
import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';
import { customerGroupOf } from '@/features/customers/model';
import { estimatePrice, formatVndShort, type PriceCatalog } from '@/features/profile/model';

const customer = (patch: Record<string, unknown> = {}) =>
  ({ id: 'c1', phone: '0900000000', full_name: 'Lan', owner_id: 'me', ...patch }) as Customer;

const catalog: PriceCatalog = {
  projectByName: (name) => (name === 'Vin TC' ? { id: 'p1' } : name === 'Chưa giá' ? { id: 'p2' } : null),
  buildingByCode: (projectId, code) => (projectId === 'p1' && code === 'A1' ? { id: 'b1' } : null),
  unitByCode: (buildingId, code) => (buildingId === 'b1' && code === '1201' ? { id: 'u1' } : null),
  unitPrice: () => 60_000_000,
  buildingPrice: () => 55_000_000,
  projectPrice: (project) => ((project as { id: string }).id === 'p1' ? 50_000_000 : null),
};

describe('Giá ước tính = diện tích × giá/m² Giỏ hàng', () => {
  it('lấy giá căn > toà > dự án', () => {
    expect(estimatePrice(customer({ apt_area: 45, projects: ['Vin TC'] }), catalog)).toEqual({
      total: 2_250_000_000,
      area: 45,
      pricePerM2: 50_000_000,
    });
    expect(estimatePrice(customer({ apt_area: 45, projects: ['Vin TC'], building_code: 'A1' }), catalog)).toMatchObject(
      { pricePerM2: 55_000_000 },
    );
    expect(
      estimatePrice(customer({ apt_area: 45, projects: ['Vin TC'], building_code: 'A1', apt_code: '1201' }), catalog),
    ).toMatchObject({ total: 2_700_000_000, pricePerM2: 60_000_000 });
  });

  it('thiếu diện tích / dự án / giá → nói rõ thiếu gì', () => {
    expect(estimatePrice(customer({ projects: ['Vin TC'] }), catalog)).toEqual({ missing: 'area' });
    expect(estimatePrice(customer({ apt_area: 45 }), catalog)).toEqual({ missing: 'project' });
    expect(estimatePrice(customer({ apt_area: 45, projects: ['Lạ'] }), catalog)).toEqual({ missing: 'project' });
    expect(estimatePrice(customer({ apt_area: 45, projects: ['Chưa giá'] }), catalog)).toEqual({ missing: 'price' });
    expect(estimatePrice(customer({ apt_area: 45, projects: ['Vin TC'] }), null)).toEqual({ missing: 'project' });
  });

  it('định dạng tỷ / triệu', () => {
    expect(formatVndShort(2_340_000_000)).toBe('2,34 tỷ');
    expect(formatVndShort(850_000_000)).toBe('850 triệu');
  });
});

describe('nhóm khách dưới tên', () => {
  it('cùng luật với chip màn Khách hàng', () => {
    expect(customerGroupOf(customer(), 'me')).toBe('new');
    expect(customerGroupOf(customer({ qualified_at: '2026-10-01T00:00:00Z' }), 'me')).toBe('potential');
    expect(customerGroupOf(customer({ owner_id: 'other', qualified_at: '2026-10-01T00:00:00Z' }), 'me')).toBe('team');
  });
});

describe('Đã biết → Tài chính đọc Vốn hiện có', () => {
  const finance = (patch: Record<string, unknown>) =>
    customerBrief(customer(patch)).find((fact) => fact.key === 'finance')?.value;
  it('ưu tiên Vốn hiện có (Trí nhớ), không có thì vốn ghi lúc nhập khách', () => {
    expect(finance({ advanced: { capital: 800_000_000 }, finance: 500_000_000 })).toContain('Vốn 800000000');
    expect(finance({ finance: 500_000_000 })).toContain('Vốn 500000000');
    expect(finance({})).toBe('Chưa biết');
  });
});
