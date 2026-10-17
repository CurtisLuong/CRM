// @vitest-environment node
// Ghép căn: port phần CRMPropertySearch của tests/search.test.js (v1), phát lại golden `property-match`,
// so với v1 (legacy/js/property-search.js + engine vay v1) và kiểm tra customersForUnit.
import { describe, expect, it } from 'vitest';
import {
  customersForUnit,
  type MatchCatalog,
  type MatchCustomer,
  type MatchUnit,
  match,
  price,
  typeCompatible,
} from '@/domain/matching';
import { apartmentGroup } from '@/domain/search';
import { canon, fixture, golden, V1Loan, V1Property, V1Search } from '../search/legacy';

describe('ca của tests/search.test.js', () => {
  it('typeCompatible', () => {
    expect(typeCompatible('2N+', '2N+, 2WC')).toBe(true);
    expect(typeCompatible('2N+,2WC', '2N+, 2WC')).toBe(true);
    expect(typeCompatible('2N+, 2WC', '2N-2WC')).toBe(false);
    expect(typeCompatible('2PN', '2N-3WC')).toBe(true);
    expect(typeCompatible('2N-2WC', '2N-3WC')).toBe(false);
  });

  const project = { id: 'p', name: 'Marquee Homes', vat_rate: 5, kpbt_rate: 2 };
  type U = MatchUnit & { area_m2: number | null };
  const catalog: MatchCatalog<U> = {
    project: () => project,
    unitArea: (u) => u.area_m2 ?? null,
    unitPrice: () => 20000000,
  };
  const c: MatchCustomer = { projects: ['Marquee Homes'], apt_type: '2N', apt_area: 53, apt_direction: 'Nam' };
  const u: U = { project_id: 'p', apt_type: '2N-2WC', area_m2: 50, direction: 'Nam', status: 'available' };

  it('giá + ghép', () => {
    expect(price(u, catalog)).toBe(1070000000);
    expect(match(c, u, catalog)).toBeTruthy();
    expect(match(c, u, catalog, 1000000000)).toBeNull();
    expect(match({ ...c, projects: [] }, u, catalog)).toBeNull();
    expect(match(c, { ...u, status: 'sold' }, catalog)).toBeNull();
    const incomplete = match(c, { ...u, area_m2: null, direction: null }, catalog);
    expect(incomplete?.missing).toContain('giá');
    expect(incomplete?.missing).toContain('hướng');
    expect(match(c, { ...u, area_m2: null }, catalog, 2e9)).toBeNull();
    expect(price({ ...u, net_price_override: 900000000 }, catalog)).toBe(963000000);
  });

  it('customersForUnit: chỉ khách hợp, điểm cao trước, cùng điểm giữ thứ tự', () => {
    const a = { ...c, id: 'a', apt_direction: 'Bắc' }; // 90 + 10 (diện tích)
    const b = { ...c, id: 'b' }; // 90 + 10 (hướng) + 10 (diện tích)
    const x = { ...c, id: 'x', projects: ['Khác'] }; // không hợp
    const d = { ...c, id: 'd', apt_direction: 'Tây' }; // 100, sau a
    const hits = customersForUnit(u, [a, b, x, d], catalog);
    expect(hits.map((h) => [h.customer.id, h.match.score])).toEqual([
      ['b', 110],
      ['a', 100],
      ['d', 100],
    ]);
    expect(customersForUnit(u, [a, b], catalog, 1000000000)).toEqual([]);
    expect(customersForUnit({ ...u, status: 'sold' }, [a, b], catalog)).toEqual([]);
  });
});

// Dựng lại đúng ca golden `property-match` (tests/legacy-harness/cases.js §7) bằng bản TS.
function propertyCase(impl: {
  apartmentGroup: (v: unknown) => string;
  typeCompatible: (a: unknown, b: unknown) => boolean;
  price: (u: Record<string, unknown>, cat: unknown) => unknown;
  match: (c: unknown, u: Record<string, unknown>, cat: unknown, max?: number) => unknown;
}) {
  const fx = fixture();
  const customers = (fx.customers as Record<string, unknown>[]).map(({ _case, ...rest }) => rest);
  const projects = Object.fromEntries((fx.catalog.projects as { id: string }[]).map((p) => [p.id, p]));
  const catalog = {
    project: (id: string) => projects[id] || null,
    unitArea: (u: { area_m2?: number | null }) => u.area_m2 ?? null,
    unitPrice: (u: { project_id: string }) => fx.catalog.unitPricePerM2[u.project_id] ?? null,
  };
  const types = [
    'Studio',
    '1N-1WC',
    '1N+, 1WC',
    '2N-2WC',
    '2N+, 2WC',
    '2N-2WC-G',
    '3N-2WC',
    '2PN',
    '2N',
    '2N+',
    '3BR',
    'Loft',
    '',
    null,
  ];
  const typeCompatibleOut: Record<string, boolean> = {};
  const apartmentGroupOut: Record<string, string> = {};
  for (const a of types) {
    apartmentGroupOut[String(a)] = impl.apartmentGroup(a);
    for (const b of types) typeCompatibleOut[`${a} | ${b}`] = impl.typeCompatible(a, b);
  }
  const units = fx.catalog.units as Record<string, unknown>[];
  const prices = Object.fromEntries(units.map((u) => [u.id, impl.price(u, catalog)]));
  const matches: Record<string, unknown> = {};
  for (const c of customers.filter((x) => Array.isArray(x.projects) && (x.projects as unknown[]).length)) {
    matches[c.id as string] = Object.fromEntries(
      units.map((u) => [
        u.id,
        {
          noMax: impl.match(c, u, catalog),
          max1_2ty: impl.match(c, u, catalog, 1200000000),
          max2ty: impl.match(c, u, catalog, 2000000000),
        },
      ]),
    );
  }
  return { apartmentGroup: apartmentGroupOut, typeCompatible: typeCompatibleOut, prices, matches };
}

describe('golden property-match + parity v1', () => {
  // biome-ignore lint/suspicious/noExplicitAny: so khớp dữ liệu fixture không kiểu
  const ts = propertyCase({ apartmentGroup, typeCompatible, price: price as any, match: match as any });

  it('khớp golden', () => {
    expect(canon(ts)).toStrictEqual(golden('property-match'));
  });

  it('khớp v1 chạy trực tiếp', () => {
    const v1 = propertyCase({
      apartmentGroup: V1Search.apartmentGroup,
      typeCompatible: V1Property.typeCompatible,
      price: (u, cat) => V1Property.price(u, cat, V1Loan),
      match: (c, u, cat, max) => V1Property.match(c, u, cat, V1Loan, max ?? null),
    });
    expect(ts).toStrictEqual(v1);
  });
});
