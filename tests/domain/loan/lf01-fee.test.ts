// LF-01 (Curtis 06/11): phí mỗi căn. Giá thuần = giá duyệt × diện tích;
// Giá dự kiến = giá thuần + phí + giá thuần × VAT + giá thuần × KPBT. Phí đóng đợt 1, khách tự trả.
import { describe, expect, it } from 'vitest';
import { allocateLoan, calcMilestones, calcPrice, compute, DEFAULT_SCHEDULE } from '@/domain/loan';

const dates = { contractDate: '2026-11-06', handoverDate: '2027-12-01', titleAfterMonths: 1.5 };

describe('phí trong phiếu giá', () => {
  it('Giá dự kiến = thuần + phí + VAT + KPBT; phí không chịu VAT/KPBT', () => {
    // 68,6 m² × 30 triệu = 2.058.000.000; VAT 5% = 102.900.000; KPBT 2% = 41.160.000; phí 50.000.000.
    const p = calcPrice({ area: 68.6, pricePerM2: 30_000_000, vatRate: 5, kpbtRate: 2, fee: 50_000_000 });
    expect(p.net).toBe(2_058_000_000);
    expect(p.vat).toBe(102_900_000);
    expect(p.kpbt).toBe(41_160_000);
    expect(p.gross).toBe(2_160_900_000);
    expect(p.fee).toBe(50_000_000);
    expect(p.full).toBe(2_058_000_000 + 50_000_000 + 102_900_000 + 41_160_000);
  });

  it('phí 0 / trống: kết quả y như trước (không thêm trường fee)', () => {
    for (const fee of [0, null, undefined, '']) {
      const p = calcPrice({ area: 68.6, pricePerM2: 30_000_000, fee });
      expect('fee' in p).toBe(false);
      expect(p.full).toBe(p.gross + p.kpbt);
    }
  });
});

describe('phí trong tiến độ + khoản vay', () => {
  const price = calcPrice({ area: 68.6, pricePerM2: 30_000_000, fee: 50_000_000 });

  it('phí cộng trọn vào đợt 1; tổng các đợt = Giá dự kiến', () => {
    const base = calcMilestones(calcPrice({ area: 68.6, pricePerM2: 30_000_000 }), DEFAULT_SCHEDULE, dates);
    const ms = calcMilestones(price, DEFAULT_SCHEDULE, dates);
    expect(ms.rows[0]?.fee).toBe(50_000_000);
    expect(ms.rows[0]?.amount).toBe((base.rows[0]?.amount ?? 0) + 50_000_000);
    expect(ms.rows.slice(1).every((r) => r.fee === undefined)).toBe(true);
    expect(ms.rows.reduce((s, r) => s + r.amount, 0)).toBe(price.full);
  });

  it('ngân hàng không cho vay phần phí kể cả khi giải ngân từ đợt 1; khoản vay 70% vẫn tính trên giá gồm VAT', () => {
    const ms = calcMilestones(price, DEFAULT_SCHEDULE, dates);
    const all = allocateLoan(price, ms, { firstBankMilestone: 0, ltv: 100, loanOverride: null });
    expect(all.rows[0]?.customer).toBeGreaterThanOrEqual(50_000_000);
    expect(all.eligibleSum).toBe(price.full - price.kpbt - 50_000_000);
    const normal = allocateLoan(price, ms, { firstBankMilestone: 1, ltv: 70, loanOverride: null });
    expect(normal.maxByLtv).toBe(Math.round(price.gross * 0.7));
  });

  it('compute: phí đi từ unit vào phiếu giá + đợt 1', () => {
    const r = compute({
      unit: { area: 68.6, pricePerM2: 30_000_000, fee: 50_000_000 },
      dates,
      loan: { ltv: 70 },
    } as Parameters<typeof compute>[0]);
    expect(r.price.full).toBe(price.full);
    expect(r.milestones[0]?.fee).toBe(50_000_000);
  });
});
