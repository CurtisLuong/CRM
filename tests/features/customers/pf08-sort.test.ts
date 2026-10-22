import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { DEFAULT_SORT, listCardSub, parseSortChoice, type SortChoice, sortCustomers } from '@/features/customers/model';

// PF-08 — 12 khách + 5 thứ tự chuẩn (Curtis duyệt 2026-10-22). Giờ máy 22/10/2026 09:30.
const now = new Date(2026, 9, 22, 9, 30).getTime();
const oct = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const sep = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m).toISOString();

type NextCall = { start: string; end: string };

const person = (
  full_name: string,
  registered: string,
  enteredStage: string,
  called?: string,
  next?: NextCall,
): Customer =>
  ({
    id: full_name,
    owner_id: 'me',
    full_name,
    phone: '0912000000',
    care_stage: 'Đang chăm sóc',
    qualified_at: registered,
    created_at: registered,
    registered_at: registered,
    care_stage_updated_at: enteredStage,
    call_attempts: called ? [{ at: called, result: 'talked' }] : [],
    ...(next ? { next_call_at: next.start, next_call_end: next.end } : {}),
  }) as Customer;

const people: Customer[] = [
  person('Bình', oct(18, 9), oct(20, 9), oct(20, 9), { start: oct(21, 15), end: oct(21, 16) }),
  person('An', oct(17, 9), sep(22, 9, 30), sep(22, 9), { start: oct(22, 7), end: oct(22, 8) }),
  person('Cường', oct(16, 9), oct(20, 9), oct(20, 9), { start: oct(22, 9, 15), end: oct(22, 9, 45) }),
  person('Dũng', oct(14, 9), sep(27, 9, 30), sep(27, 9)),
  person('Em', oct(13, 9), sep(28, 9, 30), sep(28, 9)),
  person('Phúc', oct(15, 9), oct(7, 9, 30), oct(7, 9)),
  person('Giang', oct(20, 10), oct(20, 10)),
  person('Nam', oct(20, 12), oct(20, 12), oct(20, 14)),
  person('Hà', oct(20, 18), oct(20, 18), oct(21, 10)),
  person('Khoa', oct(20, 8), oct(20, 8), oct(21, 15)),
  person('Lan', oct(20, 19), oct(20, 19), oct(21, 9)),
  person('Mai', oct(19, 9), oct(19, 9), oct(20, 11)),
];

const names = (rows: readonly Customer[]) => rows.map((c) => c.full_name);
const byName = (name: string) => people.find((c) => c.full_name === name) as Customer;

const sortBy = (choice: Partial<SortChoice>, searching = false) =>
  names(sortCustomers(people, { ...DEFAULT_SORT, ...choice }, now, searching));

describe('sortCustomers — 3 tầng + ghim (PF-08)', () => {
  it('1. mặc định: mới nhất · chưa tương tác trước · A–Z; quên gọi/đến giờ gọi/quá SLA ở trên', () => {
    expect(sortBy({})).toEqual([
      'Bình',
      'An',
      'Cường',
      'Dũng',
      'Em',
      'Giang',
      'Nam',
      'Hà',
      'Khoa',
      'Lan',
      'Mai',
      'Phúc',
    ]);
  });

  it('2. tầng 2 "Gần nhất trước"', () => {
    expect(sortBy({ touch: 'recent' })).toEqual([
      'Bình',
      'An',
      'Cường',
      'Dũng',
      'Em',
      'Hà',
      'Khoa',
      'Lan',
      'Nam',
      'Giang',
      'Mai',
      'Phúc',
    ]);
  });

  it('3. tầng 3 "Z–A"', () => {
    expect(sortBy({ name: 'desc' })).toEqual([
      'Bình',
      'An',
      'Cường',
      'Dũng',
      'Em',
      'Giang',
      'Nam',
      'Lan',
      'Khoa',
      'Hà',
      'Mai',
      'Phúc',
    ]);
  });

  it('4. tầng 1 "Cũ nhất trước"', () => {
    expect(sortBy({ registered: 'asc' })).toEqual([
      'Bình',
      'An',
      'Cường',
      'Dũng',
      'Em',
      'Phúc',
      'Mai',
      'Giang',
      'Nam',
      'Hà',
      'Khoa',
      'Lan',
    ]);
  });

  it('5. đang tìm → ghim tắt, chỉ còn 3 tầng', () => {
    expect(sortBy({}, true)).toEqual([
      'Giang',
      'Nam',
      'Hà',
      'Khoa',
      'Lan',
      'Mai',
      'Bình',
      'An',
      'Cường',
      'Phúc',
      'Dũng',
      'Em',
    ]);
  });

  it('khách thiếu cả registered_at lẫn created_at nằm cuối ở cả hai chiều tầng 1', () => {
    const noDate = { ...person('Không ngày', oct(20, 9), oct(20, 9)), registered_at: null, created_at: null };
    const rows = [noDate as Customer, byName('Mai'), byName('Phúc')];
    expect(names(sortCustomers(rows, DEFAULT_SORT, now, false))).toEqual(['Mai', 'Phúc', 'Không ngày']);
    expect(names(sortCustomers(rows, { ...DEFAULT_SORT, registered: 'asc' }, now, false))).toEqual([
      'Phúc',
      'Mai',
      'Không ngày',
    ]);
  });

  it('bằng nhau ở nhóm ghim thì xét 3 tầng', () => {
    // Hai khách quá SLA bằng nhau (cùng mốc vào bậc) → tầng 1 quyết: mới đăng ký trước.
    const rows = [
      { ...byName('Em'), id: 'e2', full_name: 'Z', registered_at: oct(12, 9), created_at: oct(12, 9) },
      byName('Em'),
    ];
    expect(names(sortCustomers(rows, DEFAULT_SORT, now, false))).toEqual(['Em', 'Z']);
  });
});

describe('listCardSub — lý do trên thẻ (L3)', () => {
  it('quá SLA ghi "Quá SLA <fmt>" màu đỏ, vẫn giữ lần liên hệ cuối ngay sau', () => {
    expect(listCardSub(byName('Dũng'), now)).toEqual({
      lead: { text: 'Quá SLA 5 ngày', tone: 'over' },
      rest: '3 tuần trước · Đang chăm sóc',
    });
    expect(listCardSub(byName('Em'), now).lead).toEqual({ text: 'Quá SLA 4 ngày', tone: 'over' });
  });

  it('quên gọi thắng quá SLA', () => {
    const sub = listCardSub(byName('An'), now);
    expect(sub.lead).toEqual({ text: 'Quên gọi 07:00', tone: 'over' });
    expect(sub.lead?.text).not.toContain('SLA');
  });

  it('quá mục tiêu (warn) không ghim và không ghi "Quá SLA"', () => {
    const phuc = byName('Phúc');
    expect(listCardSub(phuc, now).lead).not.toEqual(expect.objectContaining({ text: expect.stringContaining('SLA') }));
    expect(sortCustomers(people, DEFAULT_SORT, now, false).indexOf(phuc)).toBe(people.length - 1);
  });
});

describe('parseSortChoice — nhớ lựa chọn / tệp cũ (L4)', () => {
  it('lựa chọn hợp lệ giữ nguyên', () => {
    expect(parseSortChoice({ registered: 'asc', touch: 'recent', name: 'desc' })).toEqual({
      registered: 'asc',
      touch: 'recent',
      name: 'desc',
    });
    expect(parseSortChoice(DEFAULT_SORT)).toEqual(DEFAULT_SORT);
  });

  it('sắp xếp kiểu cũ (SortRule[]) hoặc dữ liệu hỏng → mặc định, không lỗi', () => {
    expect(parseSortChoice([{ key: 'updated', direction: 'desc' }])).toEqual(DEFAULT_SORT);
    expect(parseSortChoice({ key: 'stage', direction: 'asc' })).toEqual(DEFAULT_SORT);
    expect(parseSortChoice(null)).toEqual(DEFAULT_SORT);
    expect(parseSortChoice('updated:desc')).toEqual(DEFAULT_SORT);
    expect(parseSortChoice({ registered: 'asc', touch: 'later' })).toEqual(DEFAULT_SORT);
  });
});
