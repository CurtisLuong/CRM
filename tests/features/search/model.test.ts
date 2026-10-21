import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { searchable } from '@/features/customers/model';
import {
  CUSTOMER_GROUPS,
  customerGroupOf,
  customerPaletteItems,
  customerRowSub,
  GROUP_LIMIT,
  searchCustomers,
} from '@/features/search/model';

// PF-06: tìm toàn app — phân nhóm khách, sắp điểm/updated_at, cắt 5 + "Xem thêm".

const iso = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString();

const person = (over: Partial<Customer> & Pick<Customer, 'id' | 'full_name' | 'phone'>): Customer =>
  ({
    owner_id: 'u1',
    created_at: iso(1),
    updated_at: iso(1),
    registered_at: iso(1),
    ...over,
  }) as Customer;

const docsOf = (rows: Customer[]) => new Map(rows.map((customer) => [customer.id, searchable(customer)]));

// Số chuẩn luật 8.
const tran = person({
  id: 'tran',
  full_name: 'Trần Dũng',
  phone: '0915000001',
  care_stage: 'Đang chăm sóc',
  qualified_at: iso(2),
  updated_at: iso(18),
});
const le = person({ id: 'le', full_name: 'Lê Dũng', phone: '0915000002', care_stage: 'Đăng kí mới' });
const pham = person({
  id: 'pham',
  full_name: 'Phạm Dũng',
  phone: '0915000003',
  care_stage: 'Nuôi dài hạn',
  qualified_at: iso(3),
  updated_at: iso(10),
});
const vo = person({
  id: 'vo',
  full_name: 'Võ Dũng',
  phone: '0915000004',
  care_stage: 'Đang chăm sóc',
  qualified_at: iso(4),
  archived_at: iso(15),
  updated_at: iso(15),
});
const ha = person({
  id: 'ha',
  full_name: 'Hà Dũng',
  phone: '0915000005',
  care_stage: 'Đăng kí mới',
  disqualified_at: iso(12),
  updated_at: iso(12),
});
const standard = [tran, le, pham, vo, ha];

describe('searchCustomers — số chuẩn luật 8', () => {
  for (const query of ['dũng', 'dung']) {
    it(`"${query}" → 4 nhóm đúng thứ tự, mỗi khách 1 nhóm`, () => {
      const groups = searchCustomers(standard, docsOf(standard), query);
      expect(groups.map((group) => group.label)).toEqual([
        'Khách tiềm năng',
        'Khách mới',
        'Nuôi dài hạn & đã mua',
        'Đã lưu trữ / Đã loại',
      ]);
      expect(groups.map((group) => group.rows.map((row) => row.customer.full_name))).toEqual([
        ['Trần Dũng'],
        ['Lê Dũng'],
        ['Phạm Dũng'],
        ['Võ Dũng', 'Hà Dũng'],
      ]);
    });
  }

  it('gõ SĐT (≥ 3 số) cũng ra khách', () => {
    const groups = searchCustomers(standard, docsOf(standard), '0915000003');
    expect(groups.flatMap((group) => group.rows.map((row) => row.customer.id))).toEqual(['pham']);
  });

  it('khoảng trắng / rỗng → không có nhóm', () => {
    expect(searchCustomers(standard, docsOf(standard), '   ')).toEqual([]);
    expect(searchCustomers(standard, docsOf(standard), '')).toEqual([]);
  });
});

describe('searchCustomers — phân nhóm, sắp, cắt 5', () => {
  it('điểm match cao trước; bằng điểm thì updated_at mới trước', () => {
    const exact = person({ id: 'exact', full_name: 'Dũng', phone: '0916000001', updated_at: iso(2) });
    const later = person({ id: 'later', full_name: 'Trần Dũng', phone: '0916000002', updated_at: iso(20) });
    const groups = searchCustomers([exact, later], docsOf([exact, later]), 'dũng');
    expect(groups[0]?.rows.map((row) => row.customer.id)).toEqual(['exact', 'later']);

    const older = person({ id: 'older', full_name: 'Ngô Dũng', phone: '0916000003', updated_at: iso(3) });
    const newer = person({ id: 'newer', full_name: 'Đỗ Dũng', phone: '0916000004', updated_at: iso(9) });
    const tie = searchCustomers([older, newer], docsOf([older, newer]), 'dũng');
    expect(tie[0]?.rows.map((row) => row.customer.id)).toEqual(['newer', 'older']);
  });

  it(`nhóm > ${GROUP_LIMIT} khách: 5 dòng đầu hiện, còn lại ẩn + "Xem thêm"`, () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      person({
        id: `tiem-${i}`,
        full_name: `Nguyễn Tiềm ${i + 1}`,
        phone: `09170000${i}`,
        care_stage: 'Đang chăm sóc',
        qualified_at: iso(2),
        updated_at: iso(1 + i),
      }),
    );
    const [group] = searchCustomers(rows, docsOf(rows), 'tiem');
    expect(group?.key).toBe('potential');
    expect(group?.rows).toHaveLength(7);
    expect(group?.visibleCount).toBe(GROUP_LIMIT);
    expect(group?.hiddenCount).toBe(2);
    expect(group?.rows.map((row) => row.collapsed)).toEqual([false, false, false, false, false, true, true]);
    // updated_at mới nhất đứng đầu (07 → 01), nên 05 là dòng cuối còn hiện.
    expect(group?.rows.slice(0, GROUP_LIMIT).map((row) => row.customer.full_name)).toEqual([
      'Nguyễn Tiềm 7',
      'Nguyễn Tiềm 6',
      'Nguyễn Tiềm 5',
      'Nguyễn Tiềm 4',
      'Nguyễn Tiềm 3',
    ]);
  });

  it('nhóm rỗng không hiện; mọi nhóm theo đúng CUSTOMER_GROUPS', () => {
    const onlyNew = [le];
    const groups = searchCustomers(onlyNew, docsOf(onlyNew), 'dũng');
    expect(groups.map((group) => group.key)).toEqual(['new']);
    expect(CUSTOMER_GROUPS.map((group) => group.key)).toEqual(['potential', 'new', 'longterm', 'archived']);
  });
});

describe('customerGroupOf — ưu tiên luật 5', () => {
  it('lưu trữ / đã loại xét trước; qualified + Nuôi dài hạn hoặc Kí HĐMB → nuôi dài hạn & đã mua', () => {
    expect(customerGroupOf(vo)).toBe('archived');
    expect(customerGroupOf(ha)).toBe('archived');
    expect(customerGroupOf(tran)).toBe('potential');
    expect(customerGroupOf(le)).toBe('new');
    expect(customerGroupOf(pham)).toBe('longterm');
    expect(
      customerGroupOf(person({ id: 'won', full_name: 'A', phone: '1', qualified_at: iso(1), care_stage: 'Kí HĐMB' })),
    ).toBe('longterm');
    expect(
      customerGroupOf(person({ id: 'drop', full_name: 'B', phone: '2', qualified_at: iso(1), care_stage: 'Loại' })),
    ).toBe('archived');
  });
});

describe('dòng phụ + dòng Bảng lệnh', () => {
  it('bậc · SĐT, ghi rõ Đã lưu trữ / Đã loại', () => {
    expect(customerRowSub(tran)).toBe('Đang chăm sóc · 0915000001');
    expect(customerRowSub(vo)).toBe('Đang chăm sóc · 0915000004 · Đã lưu trữ');
    expect(customerRowSub(ha)).toBe('Đăng kí mới · 0915000005 · Đã loại');
  });

  it('bôi phần khớp bằng highlight; giữ cờ collapsed của nhóm', () => {
    const groups = searchCustomers(standard, docsOf(standard), 'dũng');
    const items = customerPaletteItems(groups, () => {});
    const first = items[0];
    expect(first?.label).toBe('Trần Dũng');
    expect(first?.labelHtml).toContain('<mark>Dũng</mark>');
    expect(first?.group).toBe('Khách tiềm năng');
    expect(first?.collapsed).toBe(false);
    expect(items.map((item) => item.id)).toEqual([
      'customer:tran',
      'customer:le',
      'customer:pham',
      'customer:vo',
      'customer:ha',
    ]);
  });
});
