import { describe, expect, it } from 'vitest';
import { BANKS } from '@/config/banks';
import {
  type BankRate,
  bankRateRows,
  type Overrides,
  parseOverride,
  rateFreshness,
  rateWarnings,
} from '@/features/bank-rates/model';

const now = Date.parse('2026-11-30T09:00:00+07:00');
const loan: BankRate = { bank_code: 'bidv', promo_rate: 6, published_on: '2026-11-16' };
const deposit: BankRate = {
  bank_code: 'bidv',
  kind: 'deposit',
  deposit_rate: 5,
  published_on: '2026-11-16',
};
const row = (rates: BankRate[], overrides: Overrides = {}) => {
  const bank = bankRateRows(rates, overrides)[0];
  if (!bank) throw new Error('Danh sách phải có BIDV');
  return bank;
};

// Mỗi ngân hàng đủ gửi + vay; thả nổi không bắt buộc.
const complete = BANKS.flatMap(({ code }) => [
  { ...deposit, bank_code: code },
  { ...loan, bank_code: code },
]);

describe('BR-07 tuổi từng ô và số còn thiếu', () => {
  it('luật 1–2: published_on thắng lần lấy mới; đúng 14 ngày không cũ, 15 ngày là cũ', () => {
    const bank = row([
      { ...loan, published_on: '2026-11-15', fetched_at: '2026-11-30T01:00:00Z', floating_rate: 10 },
      deposit,
    ]);
    expect(rateFreshness(bank, now).cells).toEqual([
      { key: 'deposit', label: 'Gửi 12T', day: '2026-11-16', age: 14, stale: false },
      { key: 'promo', label: 'Vay ưu đãi', day: '2026-11-15', age: 15, stale: true },
      { key: 'floating', label: 'Thả nổi', day: '2026-11-15', age: 15, stale: true },
    ]);
  });

  it.each([
    ['2026-12-01T02:00:00Z', '2026-11-16', 15],
    ['2027-01-01T02:00:00Z', '2026-12-17', 15],
    ['2028-03-01T02:00:00Z', '2028-02-16', 14],
  ])('luật 2: giao tháng/năm và năm nhuận %s', (time, day, age) => {
    expect(rateFreshness(row([{ ...loan, published_on: day }]), Date.parse(time)).cells[1]).toMatchObject({
      age,
      stale: age > 14,
    });
  });

  it('luật 1–2: fallback fetched_at và hôm nay đều theo VN, ngay hai bên nửa đêm UTC+7', () => {
    const bank = row([{ ...loan, published_on: null, fetched_at: '2026-11-15T17:00:00Z' }]);
    expect(rateFreshness(bank, Date.parse('2026-11-30T16:59:59Z')).cells[1]).toMatchObject({
      day: '2026-11-16',
      age: 14,
      stale: false,
    });
    expect(rateFreshness(bank, Date.parse('2026-11-30T17:00:00Z')).cells[1]).toMatchObject({
      age: 15,
      stale: true,
    });
    const beforeMidnight = row([{ ...loan, published_on: null, fetched_at: '2026-11-15T16:59:59Z' }]);
    expect(rateFreshness(beforeMidnight, now).cells[1]).toMatchObject({ day: '2026-11-15', age: 15, stale: true });
  });

  it('luật 3: chỉ thiếu gửi hoặc thiếu cả hai số vay; thả nổi trống không tính thiếu', () => {
    expect(rateFreshness(row([loan, deposit]), now).missing).toEqual([]);
    expect(rateFreshness(row([{ ...loan, promo_rate: null, floating_rate: 10 }, deposit]), now).missing).toEqual([]);
    expect(rateFreshness(row([loan]), now).missing).toEqual(['Gửi 12T']);
    expect(rateFreshness(row([deposit]), now).missing).toEqual(['Số vay']);
    expect(rateFreshness(row([]), now).missing).toEqual(['Gửi 12T', 'Số vay']);
  });

  it('luật 4: đếm theo ngân hàng, một ngân hàng có thể vừa cũ vừa thiếu', () => {
    const rows = bankRateRows(
      [
        { ...loan, published_on: '2026-11-01', floating_rate: 10 },
        { bank_code: 'mb', kind: 'deposit', deposit_rate: 6, published_on: '2026-11-01' },
      ],
      {},
    );
    expect(rateWarnings(rows, now)).toEqual({ hasRates: true, staleBanks: 2, missingBanks: 10, warning: true });
  });

  it('luật 4–5: đủ số mới không cảnh báo; không có số nào giữ trạng thái trống', () => {
    expect(rateWarnings(bankRateRows(complete, {}), now)).toEqual({
      hasRates: true,
      staleBanks: 0,
      missingBanks: 0,
      warning: false,
    });
    expect(rateWarnings(bankRateRows([], {}), now)).toMatchObject({ hasRates: false, warning: false });
  });

  it('luật 5: thẻ chỉ xét Big 4, ngăn kéo xét cả 10', () => {
    const rows = bankRateRows(
      complete.map((rate) => (rate.bank_code === 'mb' ? { ...rate, published_on: '2026-11-15' } : rate)),
      {},
    );
    expect(rateWarnings(rows, now)).toMatchObject({ staleBanks: 1, warning: true });
    expect(
      rateWarnings(
        rows.filter((bank) => bank.big4),
        now,
      ),
    ).toMatchObject({ warning: false });
  });

  it('luật 6: ngày tự sửa thay riêng ô, có thể cũ; sửa mới không che ô nguồn vẫn cũ', () => {
    const draft = { deposit_rate: '', promo_rate: '8', promo_months: '', floating_rate: '', note: '' };
    const old = parseOverride(draft, Date.parse('2026-11-14T17:00:00Z'));
    const recent = parseOverride(draft, Date.parse('2026-11-29T17:00:00Z'));
    if (typeof old === 'string' || typeof recent === 'string') throw new Error('Bản sửa mẫu phải hợp lệ');
    expect(rateFreshness(row([loan, deposit], { bidv: old }), now).cells[1]).toMatchObject({
      day: '2026-11-15',
      age: 15,
      stale: true,
    });
    const bank = row([{ ...loan, published_on: '2026-11-01', floating_rate: 10 }, deposit], { bidv: recent });
    expect(rateFreshness(bank, now).staleCells.map((cell) => cell.key)).toEqual(['floating']);
    expect(rateFreshness(bank, now).cells[1]).toMatchObject({ day: '2026-11-30', age: 0, stale: false });
    expect(bank).toMatchObject({ promo_rate: 8, floating_rate: 10, deposit_rate: 5 });
  });
});
