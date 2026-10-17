// Port toàn bộ ca của tests/loan-engine.test.js (v1) sang Vitest, chạy trên bản TS.
// Số liệu gốc: phiếu CĐT căn R30413 (The Rise 3).
import { describe, expect, it } from 'vitest';
import {
  calcMilestones,
  calcPrice,
  compute,
  DEFAULT_SCHEDULE,
  type ScheduleItem,
  validateSchedule,
  vatPercents,
} from '@/domain/loan';

const DATES = { contractDate: '2026-10-05', handoverDate: '2027-11-15' };

describe('Phiếu CĐT căn R30413', () => {
  const r = compute({
    unit: { area: 53.6, pricePerM2: 19911530, netPriceOverride: 1067258010 },
    dates: DATES,
    loan: { ltv: 70 },
  });
  const sched = r.schedule;
  if (!sched || !r.firstAmortRow || !r.payoff) throw new Error('thiếu lịch trả nợ');

  it('phiếu giá', () => {
    expect(r.price.net).toBe(1067258010); // Giá thuần
    expect(r.price.vat).toBe(53362901); // VAT
    expect(r.price.kpbt).toBe(21345160); // KPBT
    expect(r.price.gross).toBe(1120620911); // Giá gồm VAT
    expect(r.price.full).toBe(1141966071); // Giá FULL
    expect(r.price.pricePerM2).toBe(19911530); // Giá m2
  });

  it('7 đợt thanh toán', () => {
    expect(r.milestones.map((m) => m.amount)).toEqual([
      336186273, 112062091, 112062091, 112062091, 112062091, 304168533, 53362901,
    ]);
    expect(r.milestones.reduce((s, m) => s + m.vat, 0)).toBe(53362901); // Tổng VAT các đợt
    expect(r.milestones[6]?.vat).toBe(0); // VAT đợt 7
  });

  it('khoản vay + phân bổ', () => {
    expect(r.loan.amount).toBe(784434638);
    expect(r.loan.customerTotal).toBe(336186273 + 21345160); // đợt 1 + KPBT
    expect(r.milestones[5]?.bank).toBe(282823373); // Đợt 6 ngân hàng
    expect(sched.totalPrincipal).toBe(784434638); // Tổng gốc trả = khoản vay
    expect(sched.rows.at(-1)?.balance).toBe(0); // Dư nợ cuối
  });

  // v1 chỉ in ra các giá trị này; ở đây chốt bằng số v1 cho ra (đo 2026-10-16 trên legacy).
  it('tháng đầu, kỳ trả gốc đầu, tổng lãi, tất toán', () => {
    // Lãi tháng đầu: 112.062.091 × 6,5% × số ngày / 365
    expect(sched.rows[0]).toMatchObject({ date: '2027-01-04', interest: 618644, principal: 373540, payment: 992184 });
    expect(r.firstAmortRow).toMatchObject({ k: 1, payment: 992184 });
    expect(sched.phases).toHaveLength(2);
    expect(sched.totalInterest).toBe(848983896);
    expect(r.payoff).toEqual({
      month: 60,
      date: '2031-12-04',
      loanYear: 6,
      balance: 642429202,
      feePct: 0,
      fee: 0,
      totalToPay: 642429202,
      interestPaid: 203393868,
      interestSaved: 645590028,
      netSaving: 645590028,
      warning: null,
    });
  });
});

it('ân hạn 24 tháng từ lần giải ngân cuối', () => {
  const g = compute({
    unit: { area: 53.6, netPriceOverride: 1067258010 },
    dates: DATES,
    loan: { graceEnabled: true, graceMonths: 24, principalStart: 'last' },
  });
  expect(g.schedule?.totalPrincipal).toBe(784434638);
  expect(g.schedule?.principalStartMonth).toBe(48);
});

it('nhập theo đơn giá m2 (không override) lệch 2đ so với CĐT', () => {
  expect(calcPrice({ area: 53.6, pricePerM2: 19911530 }).net).toBe(1067258008);
});

it('nhận sổ sau bàn giao 1,5 tháng: 15/11/2027 + 1 tháng + 15 ngày = 30/12/2027', () => {
  const h = calcMilestones(
    calcPrice({ area: 50, pricePerM2: 20000000 }),
    DEFAULT_SCHEDULE.map((x) =>
      x.role === 'title' ? { ...x, due: { type: 'afterHandoverMonths' as const, value: 1.5 } } : x,
    ),
    DATES,
  );
  expect(h.rows[6]?.date).toBe('2027-12-30');
});

describe('tiến độ 10 đợt (VD của chủ dự án)', () => {
  // Đ1 30% · Đ2–8 mỗi đợt 5% · Đ9 bàn giao 30% · Đ10 nhận sổ 5%
  const S10: ScheduleItem[] = [{ label: 'Ký HĐ', pct: 30, due: { type: 'offsetDays', value: 0 } }];
  for (let i = 2; i <= 8; i++)
    S10.push({ label: `Đợt ${i}`, pct: 5, due: { type: 'offsetDays', value: (i - 1) * 60 } });
  S10.push({ label: 'Bàn giao', pct: 30, due: { type: 'handover' }, role: 'handover' });
  S10.push({ label: 'Nhận sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 1.5 }, role: 'title' });
  const p10 = calcPrice({ area: 50, pricePerM2: 20000000 }); // thuần 1 tỷ, VAT 50tr, KPBT 20tr
  const m10 = calcMilestones(p10, S10, DATES);

  it('chia tiền từng đợt', () => {
    expect(m10.warnings).toHaveLength(0);
    expect(m10.rows[0]?.amount).toBe(315000000); // Đ1 = 30% × giá gồm VAT
    expect(m10.rows[0]?.vat).toBe(15000000); // Đ1 VAT = 30% VAT
    expect(m10.rows[4]?.vat).toBe(2500000); // Đ5 VAT = 5% VAT
    expect(m10.rows[8]?.vat).toBe(17500000); // Đ9 VAT = 35% VAT
    expect(m10.rows[8]?.kpbt).toBe(20000000); // Đ9 KPBT
    expect(m10.rows[8]?.amount).toBe(300000000 + 17500000 + 20000000); // 30% thuần + 35% VAT + KPBT
    expect(m10.rows[9]?.amount).toBe(50000000); // Đ10 = 5% thuần, không VAT
    expect(m10.rows[9]?.vat).toBe(0);
    expect(m10.rows.reduce((s, r) => s + r.amount, 0)).toBe(p10.full); // tổng = giá FULL
  });

  it('% VAT từng đợt + hợp lệ', () => {
    expect(vatPercents(S10).join(',')).toBe('30,5,5,5,5,5,5,5,35,0');
    expect(validateSchedule(S10)).toHaveLength(0);
  });
});

describe('bàn giao KHÔNG phải đợt kế cuối', () => {
  // VAT dư vào đợt kế cuối, KPBT vẫn ở đợt bàn giao
  const p10 = calcPrice({ area: 50, pricePerM2: 20000000 });
  const S4: [ScheduleItem, ScheduleItem, ScheduleItem, ScheduleItem] = [
    { label: 'A', pct: 50, due: { type: 'offsetDays', value: 0 } },
    { label: 'BG', pct: 30, due: { type: 'handover' }, role: 'handover' },
    { label: 'C', pct: 15, due: { type: 'afterHandoverMonths', value: 3 } },
    { label: 'Sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 6 }, role: 'title' },
  ];
  const m4 = calcMilestones(p10, S4, DATES);

  it('VAT + KPBT + tổng', () => {
    expect(vatPercents(S4).join(',')).toBe('50,30,20,0');
    expect(m4.rows[1]?.kpbt).toBe(20000000);
    expect(m4.rows.reduce((s, r) => s + r.amount, 0)).toBe(p10.full);
  });

  it('kiểm tra: thiếu bàn giao + sổ không cuối', () => {
    expect(validateSchedule([S4[3], S4[0]])).toHaveLength(3);
  });
});
