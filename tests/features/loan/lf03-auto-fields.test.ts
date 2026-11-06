import { describe, expect, it } from 'vitest';
import { compute } from '@/domain/loan';
import { buildInput, cappedLoan, initialState, LTV_AUTO, LTV_MAX, ltvOf } from '@/features/loan/model';

// LF-03 (Curtis 06/11): giá thuần tự tính, nhập tay ghi đè; số tiền vay tự động 70%, nhập tay tối đa 80%
// (trên giá thuần + VAT), % và số tiền kéo theo nhau.
// 53,6 m² × 19.911.530 = 1.067.258.008 thuần; VAT 5% = 53.362.900 → 1.120.620.908.
const GROSS = 1_120_620_908;
const state = (loan = {}) => {
  const s = initialState({ area: 53.6, pricePerM2: 19_911_530 }, new Date('2026-10-05T09:00:00'));
  s.dates = { ...s.dates, contractDate: '2026-10-05', handoverDate: '2027-11-15' };
  s.loan = { ...s.loan, ...loan };
  return s;
};

describe('LF-03 — giá thuần và số tiền vay tự điền', () => {
  it('mặc định 70%, trần 80%', () => {
    expect(LTV_AUTO).toBe(70);
    expect(LTV_MAX).toBe(80);
    const r = compute(buildInput(state()));
    expect(r.price.net).toBe(1_067_258_008);
    expect(r.price.gross).toBe(GROSS);
    expect(r.loan.amount).toBe(784_434_636);
  });

  it('giá thuần nhập tay ghi đè, trống thì về diện tích × đơn giá', () => {
    const s = state();
    s.unit.netOverride = 1_000_000_000;
    expect(compute(buildInput(s)).price.net).toBe(1_000_000_000);
    s.unit.netOverride = null;
    expect(compute(buildInput(s)).price.net).toBe(1_067_258_008);
  });

  it('số tiền vay nhập tay kéo tỷ lệ theo; vượt 80% thì kẹp ở 80%', () => {
    expect(ltvOf(560_310_454, GROSS)).toBe(50);
    const half = cappedLoan(state({ loanOverride: 560_310_454 }).loan, GROSS);
    expect(half).toMatchObject({ loanOverride: 560_310_454, ltv: 50 });
    const over = cappedLoan(state({ loanOverride: 2_000_000_000 }).loan, GROSS);
    expect(over).toMatchObject({ loanOverride: 896_496_726, ltv: 80 });
    expect(buildInput(state({ loanOverride: 2_000_000_000 })).loan).toMatchObject({
      loanOverride: 896_496_726,
      ltv: 80,
    });
  });

  it('tỷ lệ trên 80% bị kẹp; trong giới hạn giữ nguyên object', () => {
    expect(cappedLoan(state({ ltv: 95 }).loan, GROSS).ltv).toBe(80);
    const ok = state({ ltv: 75 }).loan;
    expect(cappedLoan(ok, GROSS)).toBe(ok);
  });
});
