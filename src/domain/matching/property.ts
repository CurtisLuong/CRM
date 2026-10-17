/**
 * Ghép căn ↔ khách, tất định — port 1:1 từ legacy/js/property-search.js (CRMPropertySearch).
 * "Vốn sẵn có" (finance) là vốn tự có, KHÔNG phải ngân sách mua → không dùng để lọc giá.
 * Giá căn tính bằng engine vay (`@/domain/loan` calcPrice, cùng công thức v1).
 */
import { calcPrice } from '@/domain/loan';
import { aliases, normalize } from '@/domain/search';

type Numeric = number | string;

export interface MatchProject {
  name: string;
  vat_rate?: Numeric | null;
  kpbt_rate?: Numeric | null;
}

export interface MatchUnit {
  project_id: string;
  apt_type?: string | null;
  net_price_override?: Numeric | null;
  direction?: string | null;
  floor?: Numeric | null;
  status?: string | null;
}

export interface MatchCustomer {
  projects?: unknown;
  apt_type?: string | null;
  apt_direction?: string | null;
  apt_floor?: Numeric | null;
  apt_area?: Numeric | null;
}

/** Nguồn dữ liệu giỏ hàng (v1: đối tượng Catalog). */
export interface MatchCatalog<U extends MatchUnit = MatchUnit> {
  project(id: string): MatchProject | null | undefined;
  unitArea(unit: U): number | null | undefined;
  unitPrice(unit: U): number | null | undefined;
}

export interface UnitMatch {
  score: number;
  reasons: string[];
  missing: string[];
  total: number | null;
}

/** Loại căn khách muốn có khớp loại căn thật không ("2N" khớp "2N-2WC", "2N+" khớp "2N+, 2WC"). */
export function typeCompatible(wanted: unknown, actual: unknown): boolean {
  const a = aliases(wanted);
  const b = aliases(actual);
  return (
    !!a &&
    !!b &&
    (/^\d+n\+?$/.test(a) ? b === a || b.startsWith(`${a}-`) || b.startsWith(`${a},`) || b.startsWith(`${a}+`) : a === b)
  );
}

/** Giá FULL (gồm VAT + KPBT) của căn; thiếu dự án / thiếu cả giá nhập tay lẫn diện tích × đơn giá → null. */
export function price<U extends MatchUnit>(unit: U, catalog: MatchCatalog<U>): number | null {
  const p = catalog.project(unit.project_id);
  const area = catalog.unitArea(unit);
  const perM2 = catalog.unitPrice(unit);
  if (!p || (!unit.net_price_override && (!area || !perM2))) return null;
  return calcPrice({
    area: area || 0,
    pricePerM2: perM2 || 0,
    netPriceOverride: unit.net_price_override,
    vatRate: p.vat_rate == null ? 5 : Number(p.vat_rate),
    kpbtRate: p.kpbt_rate == null ? 2 : Number(p.kpbt_rate),
  }).full;
}

/** Căn có hợp với khách không: null = không hợp; có kết quả = điểm + lý do + thông tin còn thiếu. */
export function match<U extends MatchUnit>(
  customer: MatchCustomer,
  unit: U,
  catalog: MatchCatalog<U>,
  maxPrice: number | null = null,
): UnitMatch | null {
  const p = catalog.project(unit.project_id);
  const reasons: string[] = [];
  const missing: string[] = [];
  if (
    !p ||
    !Array.isArray(customer.projects) ||
    !customer.projects.includes(p.name) ||
    !typeCompatible(customer.apt_type, unit.apt_type)
  )
    return null;
  let score = 90;
  reasons.push('Đúng dự án', 'Đúng loại căn');
  const total = price(unit, catalog);
  if (maxPrice != null && (total == null || total > maxPrice)) return null;
  if (maxPrice != null) reasons.push('Trong giá tối đa đã chọn');
  if (total == null) missing.push('giá');
  if (customer.apt_direction) {
    if (!unit.direction) missing.push('hướng');
    else if (normalize(customer.apt_direction) === normalize(unit.direction)) {
      score += 10;
      reasons.push('Cùng hướng hồ sơ');
    } else reasons.push('Hướng khác hồ sơ');
  }
  if (customer.apt_floor != null) {
    if (unit.floor == null) missing.push('tầng');
    else if (Number(customer.apt_floor) === Number(unit.floor)) {
      score += 10;
      reasons.push('Cùng tầng hồ sơ');
    } else reasons.push('Tầng khác hồ sơ');
  }
  const area = catalog.unitArea(unit);
  if (customer.apt_area != null) {
    if (area == null) missing.push('diện tích');
    else if (Math.abs(Number(customer.apt_area) - area) <= 5) {
      score += 10;
      reasons.push('Diện tích gần hồ sơ (±5 m²)');
    } else reasons.push('Diện tích khác hồ sơ');
  }
  if (unit.status !== 'available') return null;
  return { score, reasons, missing, total };
}

export interface CustomerForUnit<C> {
  customer: C;
  match: UnitMatch;
}

/**
 * Chiều ngược: 1 căn → các khách hợp, điểm cao trước (cùng điểm giữ thứ tự đầu vào).
 * Như v1 (catalog-search-ui "Khách phù hợp"), người gọi tự loại khách đã loại / đã xong trước khi truyền vào.
 */
export function customersForUnit<C extends MatchCustomer, U extends MatchUnit>(
  unit: U,
  customers: readonly C[],
  catalog: MatchCatalog<U>,
  maxPrice: number | null = null,
): CustomerForUnit<C>[] {
  const hits: CustomerForUnit<C>[] = [];
  for (const customer of customers) {
    const m = match(customer, unit, catalog, maxPrice);
    if (m) hits.push({ customer, match: m });
  }
  return hits.sort((a, b) => b.match.score - a.match.score);
}
