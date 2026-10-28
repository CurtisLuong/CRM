import { CARE_STAGE_DISPLAY, CARE_STAGE_DROPPED, CARE_STAGE_NURTURE, CARE_STAGE_WON } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { isQualified, leadStatus, normStage } from '@/domain/customer/normalize';
import { compile, highlight, match, type SearchDoc } from '@/domain/search/search';

type PaletteItem = {
  id: string;
  label: string;
  sub?: string;
  icon?: import('@/config/icons').IconName;
  group: string;
  keywords?: string;
  shortcut?: string[];
  labelHtml?: string;
  collapsed?: boolean;
  onSelect: () => void;
};

/**
 * Tìm toàn app (PF-06): phân nhóm khách theo luật nghiệp vụ 5–6 → Bảng lệnh vẽ dòng phụ + "Xem thêm".
 * Hàm thuần: nhận danh sách khách + tài liệu tìm đã chuẩn bị (searchable), không đọc React/IndexedDB.
 */

/** Số khách mỗi nhóm hiện trước dòng "Xem thêm" (luật 6). */
export const GROUP_LIMIT = 5;

export type CustomerGroupKey = 'potential' | 'new' | 'longterm' | 'archived';

/** Thứ tự hiển thị (luật 5): tiềm năng → khách mới → nuôi dài hạn/đã mua → lưu trữ/đã loại. */
export const CUSTOMER_GROUPS: ReadonlyArray<{ key: CustomerGroupKey; label: string }> = [
  { key: 'potential', label: 'Khách tiềm năng' },
  { key: 'new', label: 'Khách mới' },
  { key: 'longterm', label: 'Nuôi dài hạn & đã mua' },
  { key: 'archived', label: 'Đã lưu trữ / Đã loại' },
];

export type CustomerMatch = {
  customer: Customer;
  score: number;
  highlights: string[];
  /** Nằm sau `GROUP_LIMIT` dòng đầu của nhóm — Bảng lệnh ẩn tới khi bấm "Xem thêm". */
  collapsed: boolean;
};

export type CustomerMatchGroup = {
  key: CustomerGroupKey;
  label: string;
  /** Đã sắp điểm cao trước, cùng điểm thì updated_at mới trước; gồm cả dòng đang ẩn. */
  rows: CustomerMatch[];
  visibleCount: number;
  hiddenCount: number;
};

/** Nhóm của một khách — xét theo đúng thứ tự ưu tiên luật 5; mỗi khách chỉ thuộc 1 nhóm. */
export function customerGroupOf(customer: Customer): CustomerGroupKey {
  const stage = normStage(customer.care_stage);
  // Đã lưu trữ / đã loại xét trước để không lọt vào nhóm chăm sóc.
  if (customer.archived_at || stage === CARE_STAGE_DROPPED) return 'archived';
  if (!isQualified(customer)) return leadStatus(customer) === 'dropped' ? 'archived' : 'new';
  if (stage === CARE_STAGE_NURTURE || stage === CARE_STAGE_WON) return 'longterm';
  return 'potential';
}

const updatedAt = (customer: Customer): number => Date.parse(customer.updated_at || customer.created_at || '') || 0;

function compareMatches(a: CustomerMatch, b: CustomerMatch): number {
  if (b.score !== a.score) return b.score - a.score;
  const byUpdated = updatedAt(b.customer) - updatedAt(a.customer);
  if (byUpdated) return byUpdated;
  // Cùng điểm và cùng giờ: tên để kết quả ổn định giữa các lần gõ.
  return (a.customer.full_name || '').localeCompare(b.customer.full_name || '', 'vi');
}

/** Lọc + phân nhóm + sắp + cắt `limit` (luật 4–6). Nhóm rỗng không trả về. */
export function searchCustomers(
  customers: readonly Customer[],
  docs: ReadonlyMap<string, SearchDoc>,
  query: string,
  limit = GROUP_LIMIT,
): CustomerMatchGroup[] {
  const compiled = compile(query);
  if (!compiled.active) return [];

  const buckets = new Map<CustomerGroupKey, CustomerMatch[]>();
  for (const customer of customers) {
    const doc = docs.get(customer.id);
    if (!doc) continue;
    const found = match(doc, compiled);
    if (!found.match) continue;
    const key = customerGroupOf(customer);
    const row: CustomerMatch = {
      customer,
      score: found.score,
      highlights: found.highlights,
      collapsed: false,
    };
    const rows = buckets.get(key);
    if (rows) rows.push(row);
    else buckets.set(key, [row]);
  }

  const groups: CustomerMatchGroup[] = [];
  for (const { key, label } of CUSTOMER_GROUPS) {
    const rows = buckets.get(key);
    if (!rows?.length) continue;
    rows.sort(compareMatches);
    const visibleCount = Math.min(limit, rows.length);
    groups.push({
      key,
      label,
      rows: rows.map((row, index) => ({ ...row, collapsed: index >= visibleCount })),
      visibleCount,
      hiddenCount: rows.length - visibleCount,
    });
  }
  return groups;
}

/** Dòng phụ một kết quả khách: bậc (nhãn hiển thị) · SĐT · dấu đã lưu trữ/đã loại (luật 7). */
export function customerRowSub(customer: Customer): string {
  const stage = normStage(customer.care_stage) || '';
  const stageLabel = CARE_STAGE_DISPLAY[stage] || stage;
  const marker = customer.archived_at ? 'Đã lưu trữ' : customerGroupOf(customer) === 'archived' ? 'Đã loại' : '';
  return [stageLabel, customer.phone, marker].filter(Boolean).join(' · ');
}

/** Nhóm khách → dòng Bảng lệnh. Giữ cả dòng `collapsed` để "Xem thêm" mở ngay trong danh sách. */
export function customerPaletteItems(
  groups: readonly CustomerMatchGroup[],
  open: (customer: Customer) => void,
): PaletteItem[] {
  return groups.flatMap((group) =>
    group.rows.map(
      (row): PaletteItem => ({
        id: `customer:${row.customer.id}`,
        label: row.customer.full_name,
        // highlight() đã escape HTML; Bảng lệnh bôi phần khớp bằng <mark>.
        labelHtml: highlight(row.customer.full_name, row.highlights),
        sub: customerRowSub(row.customer),
        icon: 'person',
        group: group.label,
        keywords: row.customer.phone,
        collapsed: row.collapsed,
        onSelect: () => open(row.customer),
      }),
    ),
  );
}
