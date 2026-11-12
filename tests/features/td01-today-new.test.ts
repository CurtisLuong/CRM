import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import {
  big4Average,
  formatRate,
  parseOverride,
  rateFor,
  readRateCache,
  writeRateCache,
} from '@/features/bank-rates/model';
import { greeting, lunarDate, todayDateLine } from '@/features/today/lunar';
import { importantTasks } from '@/features/today/model';

const now = new Date(2026, 10, 12, 9).getTime();

describe('TD-01 âm lịch UTC+7', () => {
  it.each([
    [10, 2, 2024, 1, 1, 2024],
    [17, 9, 2024, 15, 8, 2024],
    [29, 1, 2025, 1, 1, 2025],
    [6, 10, 2025, 15, 8, 2025],
    [17, 2, 2026, 1, 1, 2026],
  ])('%i/%i/%i', (d, m, y, day, month, year) => {
    expect(lunarDate(d, m, y)).toEqual({ day, month, year, leap: false });
  });
  it('nhận tháng 2 nhuận năm Quý Mão, hết tháng nhuận và ngày dương nhuận', () => {
    expect(lunarDate(22, 3, 2023)).toEqual({ day: 1, month: 2, year: 2023, leap: true });
    expect(lunarDate(20, 4, 2023)).toEqual({ day: 1, month: 3, year: 2023, leap: false });
    expect(lunarDate(29, 2, 2024)).toEqual({ day: 20, month: 1, year: 2024, leap: false });
    expect(todayDateLine(new Date(2023, 2, 22, 9).getTime())).toContain('Mùng 1 tháng 2 nhuận Quý Mão');
  });
  it('định dạng thứ, ngày dương và can chi theo năm âm', () => {
    expect(todayDateLine(now)).toBe('Thứ Năm, 12/11/2026 · Mùng 4 tháng 10 Bính Ngọ');
    expect(todayDateLine(new Date(2025, 9, 6, 9).getTime())).toContain('15 tháng 8 Ất Tỵ');
    expect(todayDateLine(new Date(2024, 1, 10, 9).getTime())).toContain('Mùng 1 tháng 1 Giáp Thìn');
    expect(todayDateLine(new Date(2025, 0, 28, 9).getTime())).toContain('Giáp Thìn');
  });
});

describe('TD-01 lời chào', () => {
  it.each([
    [4, 59, 'tối'],
    [5, 0, 'sáng'],
    [10, 59, 'sáng'],
    [11, 0, 'trưa'],
    [13, 59, 'trưa'],
    [14, 0, 'chiều'],
    [17, 59, 'chiều'],
    [18, 0, 'tối'],
    [0, 0, 'tối'],
  ])('biên %i:%i', (h, m, period) => {
    const time = new Date(2026, 10, 12, Number(h), Number(m)).getTime();
    expect(greeting(time, ' Curtis ')).toBe(`Chào buổi ${period}, Curtis`);
    expect(greeting(time)).toBe(`Chào buổi ${period}`);
    expect(greeting(time, ' ')).toBe(`Chào buổi ${period}`);
  });
});

describe('TD-01 lãi Big 4', () => {
  const rates = [
    { bank_code: 'bidv', promo_rate: 6, floating_rate: 10, promo_months: 12 },
    { bank_code: 'vietcombank', promo_rate: 7, floating_rate: 12 },
    { bank_code: 'agribank', promo_rate: 2, floating_rate: 21 },
    { bank_code: 'vietinbank', promo_rate: Number.NaN, floating_rate: Number.POSITIVE_INFINITY },
    { bank_code: 'mb', promo_rate: 4, floating_rate: 5 },
  ];
  it('chỉ lấy số hợp lệ của Big 4, làm tròn 1 chữ số vi-VN', () => {
    expect(big4Average(rates, {})).toEqual({ promo: 6.5, floating: 11 });
    expect(formatRate(big4Average(rates, {}).promo)).toBe('6,5%');
    expect(big4Average([], {})).toEqual({ promo: null, floating: null });
    expect(formatRate(null)).toBe('—');
  });
  it('số tự sửa thắng theo từng trường, ô trống giữ số cập nhật', () => {
    const override = { promo_rate: 9, floating_rate: null, promo_months: null, note: 'CB tín dụng', at: '' };
    expect(big4Average(rates, { vietcombank: override })).toEqual({ promo: 7.5, floating: 11 });
    expect(rateFor(rates[0], override)).toMatchObject({ promo_rate: 9, floating_rate: 10, promo_months: 12 });
    expect(big4Average(rates, { vietcombank: null })).toEqual({ promo: 6.5, floating: 11 });
    expect(big4Average([], { vietcombank: override })).toEqual({ promo: 9, floating: null });
  });
  it('không lưu số ngoài khoảng, nhận dấu phẩy và xoá riêng trường', () => {
    const draft = { promo_rate: '6,5', floating_rate: '', promo_months: '12', note: ' hỏi CB ' };
    expect(parseOverride(draft, now)).toMatchObject({
      promo_rate: 6.5,
      floating_rate: null,
      promo_months: 12,
      note: 'hỏi CB',
    });
    for (const promo_rate of ['2', '21', 'NaN', 'Infinity', 'abc'])
      expect(typeof parseOverride({ ...draft, promo_rate }, now)).toBe('string');
    expect(typeof parseOverride({ ...draft, promo_months: '1.5' }, now)).toBe('string');
    expect(parseOverride({ ...draft, promo_rate: '3', floating_rate: '20' }, now)).toMatchObject({
      promo_rate: 3,
      floating_rate: 20,
    });
  });
  it('cache lãi và số tự sửa riêng theo tài khoản', () => {
    localStorage.clear();
    writeRateCache('a', { rates, overrides: {} });
    expect(readRateCache('a').rates[0]).toEqual(rates[0]);
    expect(readRateCache('b')).toEqual({ rates: [], overrides: {} });
  });
});

describe('TD-01 Việc quan trọng', () => {
  it('lọc loại, hôm nay/mai, hoàn tất, lưu trữ, người phụ trách; sắp theo giờ', () => {
    const due = (d: number, h = 10) => new Date(2026, 10, d, h).toISOString();
    const customer = {
      id: 'a',
      owner_id: 'me',
      full_name: 'Khách A',
      phone: '0900000001',
      next_tasks: [
        { at: 'tomorrow', kind: 'contract', due: due(13) },
        { at: 'today', kind: 'visit', due: due(12) },
        { at: 'allday', kind: 'docs', due: due(12, 0), due_allday: true },
        { at: 'cafe', kind: 'cafe', due: due(13, 11) },
        { at: 'done', kind: 'visit', due: due(12), done_at: due(12, 8) },
        { at: 'yesterday', kind: 'docs', due: due(11) },
        { at: 'later', kind: 'visit', due: due(14) },
        { at: 'call', kind: 'call', due: due(12) },
        { at: 'message', kind: 'message', due: due(12) },
        { at: 'nodue', kind: 'visit' },
        null,
      ],
    } as Customer;
    const result = importantTasks(
      [
        customer,
        { ...customer, id: 'archived', archived_at: due(11) },
        { ...customer, id: 'other', owner_id: 'other' },
      ],
      now,
      'me',
    );
    expect(result.map(({ task }) => task.at)).toEqual(['allday', 'today', 'tomorrow', 'cafe']);
    expect(result.map(({ day }) => day)).toEqual(['Hôm nay', 'Hôm nay', 'Mai', 'Mai']);
    expect(result[0]?.time).toBe('Cả ngày');
    expect(result[1]?.time).toBe('10:00');
    expect(importantTasks([{ ...customer, next_tasks: [] }], now, 'me')).toEqual([]);
  });
});
