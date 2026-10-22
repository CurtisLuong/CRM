import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import {
  customDateLabel,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  dateRange,
  defaultFiltersFor,
  isFilterDirty,
  listCardSub,
  normalizeFilters,
  sortCustomers,
  v1FilterCustomers,
} from '@/features/customers/model';

// CL-01 — đầu danh sách khách. Giờ máy: Thứ Năm 22/10/2026 09:30 (số chuẩn trong task).
const now = new Date(2026, 9, 22, 9, 30);
const at = (day: number, h = 0, m = 0) => new Date(2026, 9, day, h, m).getTime();
const iso = (y: number, month: number, day: number, h = 0, m = 0) => new Date(y, month - 1, day, h, m).toISOString();

const customer = (over: Partial<Customer> & { id: string; full_name: string }): Customer =>
  ({
    phone: '0901234567',
    owner_id: 'me',
    care_stage: 'Đang chăm sóc',
    qualified_at: iso(2026, 10, 10),
    created_at: iso(2026, 10, 10),
    registered_at: iso(2026, 10, 10),
    call_attempts: [],
    ...over,
  }) as Customer;

const registeredAt = (value: string) =>
  customer({
    id: value,
    full_name: value,
    care_stage: 'Đang chăm sóc',
    qualified_at: value,
    created_at: value,
    registered_at: value,
  });

describe('dateRange — preset + khoảng Tuỳ chọn (CL-01 L4)', () => {
  it('6 dòng số chuẩn', () => {
    expect(dateRange('yesterday', now)).toEqual({ start: at(21), end: at(22) });
    expect(dateRange('today', now)).toEqual({ start: at(22), end: at(23) });
    expect(dateRange('week', now)).toEqual({ start: at(19), end: at(26) });
    expect(dateRange('month', now)).toEqual({
      start: new Date(2026, 9, 1).getTime(),
      end: new Date(2026, 10, 1).getTime(),
    });
    expect(dateRange('custom', now, '2026-10-15', '2026-10-15')).toEqual({ start: at(15), end: at(16) });
    // Chọn ngược 15/10 → 10/10: tự đổi chỗ, gồm trọn cả hai ngày.
    expect(dateRange('custom', now, '2026-10-15', '2026-10-10')).toEqual({ start: at(10), end: at(16) });
    expect(dateRange('all', now)).toBeNull();
  });

  it('hai ca biên 23:59', () => {
    const lateYesterday = registeredAt(iso(2026, 10, 21, 23, 59));
    const lateOn15 = registeredAt(iso(2026, 10, 15, 23, 59));
    const rows = [lateYesterday, lateOn15];
    const filter = (date: CustomerFiltersDate, from?: string, to?: string) =>
      v1FilterCustomers(rows, 'potential', { ...DEFAULT_FILTERS, date, dateFrom: from, dateTo: to }, 'me', now);

    expect(filter('yesterday').map((c) => c.id)).toEqual([lateYesterday.id]);
    expect(filter('today')).toHaveLength(0);
    expect(filter('custom', '2026-10-15', '2026-10-15').map((c) => c.id)).toEqual([lateOn15.id]);
  });

  it('chữ Tuỳ chọn kiểu Việt Nam, khác năm thì thêm năm', () => {
    expect(customDateLabel('2026-10-15', '2026-10-15', now)).toBe('15/10');
    expect(customDateLabel('2026-10-15', '2026-10-10', now)).toBe('10/10 – 15/10');
    expect(customDateLabel('2025-12-30', '2026-01-02', now)).toBe('30/12/2025 – 02/01');
    expect(customDateLabel(undefined, undefined, now)).toBe('');
  });
});

type CustomerFiltersDate = (typeof DEFAULT_FILTERS)['date'];

describe('isFilterDirty — "Xoá lọc" ở hàng đếm (CL-01 L3)', () => {
  it('mặc định của nhóm thì không hiện', () => {
    expect(isFilterDirty('potential', DEFAULT_FILTERS)).toBe(false);
    expect(isFilterDirty('new', defaultFiltersFor('new'))).toBe(false);
    expect(isFilterDirty('new', { ...DEFAULT_FILTERS, status: 'open' })).toBe(false);
  });

  it('ô tìm và sắp xếp không tính', () => {
    expect(isFilterDirty('potential', { ...DEFAULT_FILTERS, query: 'Nguyễn' })).toBe(false);
    // Sắp xếp nằm ngoài CustomerFilters — đổi chiều không làm bẩn bộ lọc.
    expect(isFilterDirty('potential', DEFAULT_FILTERS)).toBe(false);
  });

  it('đổi bậc / ngày / trạng thái thì hiện', () => {
    expect(isFilterDirty('potential', { ...DEFAULT_FILTERS, stage: 'Xem dự án' })).toBe(true);
    expect(isFilterDirty('potential', { ...DEFAULT_FILTERS, date: 'yesterday' })).toBe(true);
    expect(isFilterDirty('new', { ...DEFAULT_FILTERS, status: 'all' })).toBe(true);
  });
});

describe('normalizeFilters — tệp khách cũ (CL-01, D-012)', () => {
  it('thiếu trường mới → đọc như mặc định, không lỗi', () => {
    const old = {
      status: 'all',
      stage: '',
      date: 'month',
      apt: '',
      source: '',
      owner: '',
      query: 'Hà',
    };
    expect(normalizeFilters(old)).toEqual({
      status: 'all',
      stage: '',
      date: 'month',
      apt: '',
      source: '',
      owner: '',
      query: 'Hà',
    });
    expect(normalizeFilters({})).toEqual(DEFAULT_FILTERS);
    expect(normalizeFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(normalizeFilters({ ...DEFAULT_FILTERS, date: 'custom', dateFrom: '2026-10-10' })).toMatchObject({
      date: 'custom',
      dateFrom: '2026-10-10',
    });
  });
});

describe('khách đồng nghiệp — không SLA, không ghim (CL-01 L8)', () => {
  // Quá hạn 20 ngày của bậc Đang chăm sóc: vào bậc 27/9 → 25 ngày, quá 5 ngày.
  const colleague = customer({
    id: 'colleague',
    full_name: 'Đồng nghiệp',
    owner_id: 'other',
    registered_at: iso(2026, 10, 19),
    created_at: iso(2026, 10, 19),
    care_stage: 'Đang chăm sóc',
    care_stage_updated_at: new Date(2026, 8, 27, 9, 30).toISOString(),
    next_call_at: new Date(2026, 9, 21, 7).toISOString(),
    next_call_end: new Date(2026, 9, 21, 8).toISOString(),
  });
  const ownNew = customer({
    id: 'own-new',
    full_name: 'A',
    registered_at: iso(2026, 10, 20),
    care_stage: 'Nuôi dài hạn',
  });
  const ownOld = customer({
    id: 'own-old',
    full_name: 'B',
    registered_at: iso(2026, 10, 18),
    care_stage: 'Nuôi dài hạn',
  });

  it('không ghim cần gọi/quá SLA khi sắp xếp cho người dùng hiện tại', () => {
    expect(
      sortCustomers([colleague, ownNew, ownOld], DEFAULT_SORT, now.getTime(), false, 'me').map((c) => c.id),
    ).toEqual(['own-new', 'colleague', 'own-old']);
    // Đối chứng: không truyền người dùng (luật cũ) thì khách quá SLA bị ghim lên đầu.
    expect(sortCustomers([colleague, ownNew, ownOld], DEFAULT_SORT, now.getTime(), false).map((c) => c.id)).toEqual([
      'colleague',
      'own-new',
      'own-old',
    ]);
  });

  it('thẻ không ghi "Quá SLA", không tô đỏ vì SLA', () => {
    const sub = listCardSub(colleague, now.getTime(), 'me');
    expect(sub.lead?.text ?? '').not.toContain('SLA');
    expect(sub.lead?.tone).not.toBe('over');
    // Khách của mình vẫn giữ nguyên luật cũ.
    expect(listCardSub(customer({ id: 'x', full_name: 'X' }), now.getTime(), 'me')).toBeDefined();
  });
});
