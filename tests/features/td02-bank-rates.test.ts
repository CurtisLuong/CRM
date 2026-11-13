import { describe, expect, it } from 'vitest';
import {
  type BankRate,
  bankRateRows,
  formatRateDay,
  parseOverride,
  type RateOverride,
  rateSummary,
  readOverrides,
  readRateCache,
  sourceDay,
  vietnamDay,
  writeRateCache,
} from '@/features/bank-rates/model';

const loan: BankRate = {
  bank_code: 'bidv',
  kind: 'loan',
  promo_rate: 6,
  floating_rate: 10,
  promo_months: 12,
  published_on: '2026-11-03',
  fetched_at: '2026-11-12T01:00:00Z',
  source_url: 'https://example.test/loan',
  source_kind: 'bank',
};
const deposit: BankRate = {
  bank_code: 'bidv',
  kind: 'deposit',
  deposit_rate: 5,
  published_on: null,
  fetched_at: '2026-11-10T18:00:00Z',
  source_url: 'https://example.test/deposit',
  source_kind: 'news',
};
const manual: RateOverride = {
  deposit_rate: null,
  promo_rate: null,
  floating_rate: null,
  promo_months: null,
  note: 'Hỏi CB tín dụng',
  at: '2026-11-11T18:00:00Z',
};

function big4(rates: BankRate[], overrides = {}) {
  return rateSummary(bankRateRows(rates, overrides).filter((bank) => bank.big4));
}

describe('TD-02 gộp lãi ngân hàng', () => {
  it('gộp loan/deposit không phụ thuộc thứ tự; thiếu kind là loan; không lấy lẫn trường', () => {
    const rows = bankRateRows(
      [
        { ...deposit, promo_rate: 19 },
        { ...loan, deposit_rate: 11 },
        { bank_code: 'vietcombank', promo_rate: 8, floating_rate: 12, deposit_rate: 10 },
        { bank_code: 'mb', kind: 'deposit', deposit_rate: 9 },
      ],
      {},
    );
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ deposit_rate: 5, promo_rate: 6, floating_rate: 10, promo_months: 12 });
    expect(rateSummary(rows.filter((bank) => bank.big4))).toMatchObject({ deposit: 5, promo: 7, floating: 11 });
    expect(rows.find((bank) => bank.code === 'vietcombank')?.deposit_rate).toBeNull();
    expect(big4([loan, deposit])).toEqual(big4([deposit, loan]));
  });

  it('trung bình từng cột chỉ gồm Big 4 có số hợp lệ; không có số hiện dấu gạch', () => {
    expect(
      big4([
        loan,
        deposit,
        { bank_code: 'vietcombank', kind: 'deposit', deposit_rate: 7 },
        { bank_code: 'agribank', kind: 'deposit', deposit_rate: 0.9 },
        { bank_code: 'vietinbank', kind: 'deposit', deposit_rate: 12.1 },
        { bank_code: 'mb', kind: 'deposit', deposit_rate: 12 },
        { bank_code: 'agribank', promo_rate: 2, floating_rate: Number.NaN },
      ]),
    ).toMatchObject({ deposit: 6, promo: 6, floating: 10 });
    expect(big4([])).toEqual({ deposit: null, promo: null, floating: null, updatedOn: undefined });
    expect(big4([{ ...deposit, deposit_rate: Number.POSITIVE_INFINITY }]).deposit).toBeNull();
  });

  it.each([
    ['deposit_rate', 7, { deposit: '2026-11-12', promo: '2026-11-03', floating: '2026-11-03' }],
    ['promo_rate', 9, { deposit: '2026-11-11', promo: '2026-11-12', floating: '2026-11-03' }],
    ['floating_rate', 13, { deposit: '2026-11-11', promo: '2026-11-03', floating: '2026-11-12' }],
  ] as const)('tự sửa %s thắng riêng trường, số và ngày của trường khác giữ nguồn', (field, value, dates) => {
    const row = bankRateRows([loan, deposit], { bidv: { ...manual, [field]: value } })[0];
    expect(row).toMatchObject({ [field]: value, dates, detailDay: '2026-11-12' });
    expect(big4([loan, deposit], { bidv: { ...manual, [field]: value } }).updatedOn).toBe('2026-11-12');
  });

  it('bản tự sửa cũ thiếu deposit_rate và các ô trống không che số máy', () => {
    const legacy = { ...manual, promo_rate: 8 };
    delete legacy.deposit_rate;
    const overrides = readOverrides({ bank_rate_overrides: { bidv: legacy } });
    expect(overrides.bidv?.deposit_rate).toBeNull();
    expect(bankRateRows([loan, deposit], overrides)[0]).toMatchObject({
      deposit_rate: 5,
      promo_rate: 8,
      floating_rate: 10,
    });
    expect(bankRateRows([loan, deposit], { bidv: manual })[0]?.dates).toEqual({
      deposit: '2026-11-11',
      promo: '2026-11-03',
      floating: '2026-11-03',
    });
  });
});

describe('TD-02 ngày số đang hiện', () => {
  it('published_on thắng fetched_at; null dùng ngày fetched_at tại VN, kể cả giao năm', () => {
    expect(sourceDay(loan)).toBe('2026-11-03');
    expect(sourceDay(deposit)).toBe('2026-11-11');
    expect(vietnamDay('2026-12-31T17:00:00Z')).toBe('2027-01-01');
    expect(vietnamDay('2026-12-31T16:59:59Z')).toBe('2026-12-31');
    expect(vietnamDay('không phải ngày')).toBeNull();
    expect(sourceDay({ bank_code: 'bidv' })).toBeNull();
    expect(formatRateDay('2026-11-03')).toBe('03/11/2026');
    expect(formatRateDay('2026-11-03', false)).toBe('03/11');
  });

  it('thẻ chỉ xét Big 4, ngăn kéo xét cả 10; bỏ ngày của số không hiện hoặc đã bị thay', () => {
    const rates = [
      loan,
      deposit,
      { bank_code: 'mb', kind: 'deposit', deposit_rate: 7, published_on: '2026-11-12' },
      { bank_code: 'agribank', promo_rate: 1, published_on: '2026-11-30' },
      { bank_code: 'unknown', promo_rate: 9, published_on: '2026-12-31' },
    ];
    expect(big4(rates).updatedOn).toBe('2026-11-11');
    expect(rateSummary(bankRateRows(rates, {})).updatedOn).toBe('2026-11-12');
    expect(
      big4([{ ...loan, published_on: '2026-11-20' }], {
        bidv: { ...manual, promo_rate: 8, floating_rate: 12 },
      }).updatedOn,
    ).toBe('2026-11-12');
    expect(big4([{ ...deposit, deposit_rate: null }]).updatedOn).toBeUndefined();
    expect(big4([], { bidv: manual }).updatedOn).toBeUndefined();
  });

  it('dòng ngân hàng ưu tiên ngày/nguồn vay, thiếu thì dùng gửi; số tự sửa dùng ngày at', () => {
    expect(bankRateRows([deposit, loan], {})[0]).toMatchObject({ detailDay: '2026-11-03', url: loan.source_url });
    expect(bankRateRows([deposit], {})[0]).toMatchObject({ detailDay: '2026-11-11', url: deposit.source_url });
    expect(bankRateRows([{ ...loan, source_url: null }, deposit], {})[0]?.url).toBe(deposit.source_url);
    expect(bankRateRows([loan, deposit], { bidv: { ...manual, deposit_rate: 6 } })[0]?.detailDay).toBe('2026-11-12');
  });
});

describe('TD-02 tự sửa lãi gửi', () => {
  const draft = { deposit_rate: '6,5', promo_rate: '', promo_months: '', floating_rate: '', note: ' ghi chú ' };
  const now = Date.parse(manual.at);
  it('nhận dấu phẩy, hai biên 1–12; ô trống trả null', () => {
    expect(parseOverride(draft, now)).toMatchObject({
      deposit_rate: 6.5,
      promo_rate: null,
      note: 'ghi chú',
      at: new Date(manual.at).toISOString(),
    });
    for (const deposit_rate of ['1', '12'])
      expect(typeof parseOverride({ ...draft, deposit_rate }, now)).toBe('object');
    expect(parseOverride({ ...draft, deposit_rate: '  ' }, now)).toMatchObject({ deposit_rate: null });
  });
  it.each(['0.9', '12.1', '-1', 'NaN', 'Infinity', 'abc'])('chặn lãi gửi không hợp lệ %s', (deposit_rate) => {
    expect(parseOverride({ ...draft, deposit_rate }, now)).toBe('Lãi gửi phải từ 1 đến 12% hoặc để trống.');
  });
  it('cache giữ cả hai loại dòng và lãi gửi tự sửa, tách tài khoản', () => {
    localStorage.clear();
    writeRateCache('td02-a', { rates: [deposit, loan], overrides: { bidv: { ...manual, deposit_rate: 7 } } });
    expect(readRateCache('td02-a')).toMatchObject({ rates: [deposit, loan], overrides: { bidv: { deposit_rate: 7 } } });
    expect(readRateCache('td02-b')).toEqual({ rates: [], overrides: {} });
  });
});
