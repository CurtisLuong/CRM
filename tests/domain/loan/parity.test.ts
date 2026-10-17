// Parity: bản TS (src/domain/loan) phải cho ra ĐÚNG TỪNG ĐỒNG như bản v1 (legacy/js/loan/loan-engine.js)
// trên cùng bộ đầu vào — gồm ca cố định (biên, cảnh báo, chuỗi số từ ô nhập) và ca sinh ngẫu nhiên có seed.
import { describe, expect, it } from 'vitest';
import type { ComputeInput, LoanParams, ScheduleItem, UnitInput } from '@/domain/loan';
import * as TS from '@/domain/loan';

type Engine = typeof TS;
// Nạp bản v1 (CommonJS) bằng require của Node. tsconfig app không có kiểu Node → khai báo tối thiểu tại chỗ.
type NodeModule = { createRequire(url: string): (id: string) => unknown };
const { createRequire }: NodeModule = await import(/* @vite-ignore */ 'node:module' as string);
const V1 = createRequire(import.meta.url)('../../../legacy/js/loan/loan-engine.js') as Engine;

/** Chạy cùng hàm trên 2 engine; lỗi ném ra cũng phải giống (cùng có / cùng không). */
function both<T>(fn: (e: Engine) => T): { v1: T | { threw: true }; ts: T | { threw: true } } {
  const run = (e: Engine) => {
    try {
      return fn(e);
    } catch {
      return { threw: true as const };
    }
  };
  return { v1: run(V1), ts: run(TS) };
}
function expectSame<T>(fn: (e: Engine) => T) {
  const { v1, ts } = both(fn);
  expect(ts).toStrictEqual(v1);
}

// Bộ sinh số giả ngẫu nhiên có seed (mulberry32) → ca ngẫu nhiên tái lập được.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DATES = { contractDate: '2026-10-05', handoverDate: '2027-11-15' };
const S10: ScheduleItem[] = [{ label: 'Ký HĐ', pct: 30, due: { type: 'offsetDays', value: 0 } }];
for (let i = 2; i <= 8; i++) S10.push({ label: `Đợt ${i}`, pct: 5, due: { type: 'offsetDays', value: (i - 1) * 60 } });
S10.push({ label: 'Bàn giao', pct: 30, due: { type: 'handover' }, role: 'handover' });
S10.push({ label: 'Nhận sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 1.5 }, role: 'title' });
const S4: ScheduleItem[] = [
  { label: 'A', pct: 50, due: { type: 'offsetDays', value: 0 } },
  { label: 'BG', pct: 30, due: { type: 'handover' }, role: 'handover' },
  { label: 'C', pct: 15, due: { type: 'afterHandoverMonths', value: 3 } },
  { label: 'Sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 6 }, role: 'title' },
];
const SCHEDULES: Record<string, ScheduleItem[] | null> = {
  default: null,
  empty: [],
  s10: S10,
  s4: S4,
  noHandover: [
    { label: 'A', pct: 40, due: { type: 'offsetDays', value: 0 } },
    { label: 'B', pct: 55, due: { type: 'date', value: '2027-03-31' } },
    { label: 'Sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 2 }, role: 'title' },
  ],
  noTitleNoHandover: [
    { label: 'A', pct: 50, due: { type: 'offsetDays', value: 0 } },
    { label: 'B', pct: 50, due: { type: 'offsetDays', value: 400 } },
  ],
  titleFirst: [
    { label: 'Sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 1 }, role: 'title' },
    { label: 'BG', pct: 95, due: { type: 'handover' }, role: 'handover' },
  ],
  afterTitle: [
    { label: 'A', pct: 30, due: { type: 'offsetDays', value: 0 } },
    { label: 'BG', pct: 60, due: { type: 'handover' }, role: 'handover' },
    { label: 'Sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 12 }, role: 'title' },
    { label: 'Sau sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 13 } },
  ],
  sumNot100: [
    { label: 'A', pct: '33.3', due: { type: 'offsetDays', value: '0' } },
    { label: 'B', pct: 33.3, due: { type: 'offsetDays', value: 90 } },
    { label: 'BG', pct: 30, due: { type: 'handover' }, role: 'handover' },
  ],
  oneHandover: [{ label: 'BG', pct: 100, due: { type: 'handover' }, role: 'handover' }],
  zeroPct: [
    { label: 'A', pct: 0, due: { type: 'offsetDays', value: 0 } },
    { label: 'B', pct: 'abc', due: { type: 'offsetDays', value: 30 } },
    { label: 'BG', pct: 95, due: { type: 'handover' }, role: 'handover' },
    { label: 'Sổ', pct: 5, role: 'title' },
  ],
  twoHandoverTwoTitle: [
    { label: 'A', pct: 40, due: { type: 'offsetDays', value: 0 } },
    { label: 'BG1', pct: 25, due: { type: 'handover' }, role: 'handover' },
    { label: 'BG2', pct: 25, due: { type: 'handover' }, role: 'handover' },
    { label: 'S1', pct: 5, due: { type: 'afterHandoverMonths', value: 0.5 }, role: 'title' },
    { label: 'S2', pct: 5, due: { type: 'afterHandoverMonths', value: 2.75 }, role: 'title' },
  ],
};

const UNITS: Record<string, UnitInput | null> = {
  r30413: { area: 53.6, pricePerM2: 19911530, netPriceOverride: 1067258010 },
  perM2: { area: 53.6, pricePerM2: 19911530 },
  round: { area: 50, pricePerM2: 20000000 },
  strings: { area: '61.25', pricePerM2: '18750000', vatRate: '5', kpbtRate: '2' },
  overrideString: { area: '45', netPriceOverride: '899999999.6' },
  overrideZeroString: { area: 45, pricePerM2: 20000000, netPriceOverride: '0' },
  vat0kpbt0: { area: 70.3, pricePerM2: 21333333, vatRate: 0, kpbtRate: 0 },
  vat10: { area: 70.3, pricePerM2: 21333333, vatRate: 10, kpbtRate: null },
  empty: {},
  nullUnit: null,
};

const LOANS: Record<string, Partial<LoanParams> | null> = {
  default: null,
  ...Object.fromEntries(
    TS.BANK_PRESETS.map((p) => [
      `preset_${p.key}`,
      {
        presetKey: p.key,
        ltv: p.ltv,
        termYears: p.termYears,
        rateTiers: p.rateTiers,
        floatingRate: p.floatingRate,
        prepayFees: p.prepayFees,
      },
    ]),
  ),
  graceFirst: { graceEnabled: true, graceMonths: 12 },
  graceLast24: { graceEnabled: true, graceMonths: 24, principalStart: 'last' },
  lastNoGrace: { principalStart: 'last' },
  monthly: { dayCount: 'monthly' },
  monthlyGraceYoung: {
    dayCount: 'monthly',
    graceEnabled: true,
    graceMonths: '18',
    presetKey: 'young35',
    rateTiers: [
      { months: 60, rate: 6.5 },
      { months: 120, rate: 7.5 },
    ],
  },
  overrideSmall: { loanOverride: 300000000 },
  overrideHuge: { loanOverride: 5000000000 },
  overrideString: { loanOverride: '650000000.4' },
  bankFrom0: { firstBankMilestone: 0, ltv: 80 },
  bankFrom3: { firstBankMilestone: 3 },
  bankFromNull: { firstBankMilestone: null },
  ltv0: { ltv: 0 },
  ltvString: { ltv: '65', termYears: '20' },
  term10: { termYears: 10, payoffMonth: 200 },
  term0: { termYears: 0 },
  termHalfYear: { termYears: 0.5, payoffMonth: 1 },
  payoffEarly: { payoffMonth: 3 },
  payoffFrac: { payoffMonth: '36.6', prepayFees: ['3', '2.5'] },
  payoffNull: { payoffMonth: null as unknown as number },
  noFees: { prepayFees: [] },
  noTiers: { rateTiers: [], floatingRate: '9.25' },
  tierStrings: {
    rateTiers: [
      { months: '24', rate: '5.9' },
      { months: 'x', rate: 7 },
      { months: 36, rate: 8.1 },
    ],
  },
};

const DATE_SETS: Record<string, ComputeInput['dates']> = {
  base: DATES,
  monthEnd: { contractDate: '2026-01-31', handoverDate: '2026-08-31' },
  leap: { contractDate: '2027-12-29', handoverDate: '2028-02-29' },
  handoverBeforeContract: { contractDate: '2027-06-01', handoverDate: '2027-01-15' },
  timestamps: { contractDate: Date.UTC(2026, 9, 5), handoverDate: Date.UTC(2027, 10, 15) },
};

describe('parity TS ↔ v1: hằng số', () => {
  it('DEFAULT_SCHEDULE, BANK_PRESETS, DEFAULT_LOAN giống hệt', () => {
    expect(TS.DEFAULT_SCHEDULE).toStrictEqual(V1.DEFAULT_SCHEDULE);
    expect(TS.BANK_PRESETS).toStrictEqual(V1.BANK_PRESETS);
    expect(TS.DEFAULT_LOAN).toStrictEqual(V1.DEFAULT_LOAN);
  });
});

describe('parity TS ↔ v1: ca cố định', () => {
  it('util ngày tháng', () => {
    for (const s of ['2026-01-31', '2028-02-29', '2026-12-31', '2026-1-5', 1767225600000]) {
      expectSame((e) => e.util.parseDate(s));
      for (const n of [-13, -1, 0, 1, 2, 13, 25]) {
        expectSame((e) => e.util.toISO(e.util.addMonths(e.util.parseDate(s), n)));
        expectSame((e) => e.util.toISO(e.util.addDays(e.util.parseDate(s), n)));
      }
    }
  });

  it('calcPrice', () => {
    for (const u of Object.values(UNITS)) expectSame((e) => e.calcPrice(u || {}));
  });

  it('calcMilestones / validateSchedule / vatPercents', () => {
    for (const s of Object.values(SCHEDULES)) {
      expectSame((e) => e.validateSchedule(s));
      expectSame((e) => e.vatPercents(s));
      for (const u of Object.values(UNITS))
        for (const d of Object.values(DATE_SETS)) expectSame((e) => e.calcMilestones(e.calcPrice(u || {}), s, d));
    }
  });

  it('compute: mọi tổ hợp gói vay × tiến độ', () => {
    for (const loan of Object.values(LOANS))
      for (const schedule of Object.values(SCHEDULES))
        expectSame((e) => e.compute({ unit: UNITS.r30413, schedule, dates: DATES, loan }));
  });

  it('compute: mọi tổ hợp căn × ngày × vài gói vay', () => {
    for (const unit of Object.values(UNITS))
      for (const dates of Object.values(DATE_SETS))
        for (const key of ['default', 'graceLast24', 'monthly', 'overrideHuge', 'bankFrom0'])
          expectSame((e) => e.compute({ unit, dates, loan: LOANS[key] ?? null }));
  });

  it('simulate + payoff gọi riêng (giải ngân không theo thứ tự, trùng ngày)', () => {
    const disb = [
      { date: '2027-11-15', amount: 400000000, label: 'BG' },
      { date: '2026-12-04', amount: 100000000, label: 'A' },
      { date: '2026-12-04', amount: 50000000, label: 'A2' },
      { date: '2027-02-28', amount: 123456789, label: 'B' },
    ];
    for (const loan of Object.values(LOANS)) {
      const params = { ...TS.DEFAULT_LOAN, ...(loan || {}) };
      expectSame((e) => e.simulate(disb, params));
      for (const m of [-5, 0, 1, 5, 12, 24, 59, 60, 61, 299, 300, 1000])
        expectSame((e) => e.payoff(e.simulate(disb, params), m, params.prepayFees));
    }
    expectSame((e) => e.simulate([], TS.DEFAULT_LOAN));
    expectSame((e) => e.payoff(null, 60, [3]));
  });
});

describe('parity TS ↔ v1: ca ngẫu nhiên (seed cố định)', () => {
  it('500 ca compute ngẫu nhiên', () => {
    const r = rng(20261016);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
    const isoDate = (y0: number) => {
      const y = y0 + Math.floor(r() * 3);
      const m = 1 + Math.floor(r() * 12);
      const d = 1 + Math.floor(r() * 31); // cố ý có ngày 29–31 không tồn tại trong tháng
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };
    for (let i = 0; i < 500; i++) {
      const nMid = Math.floor(r() * 9);
      const first = 10 + Math.floor(r() * 30);
      const title = r() < 0.7 ? 5 : 0;
      const handover = 10 + Math.floor(r() * 30);
      const mid = nMid ? Math.round(((100 - first - title - handover) / nMid) * 1000) / 1000 : 0;
      const schedule: ScheduleItem[] = [{ label: 'Đ1', pct: first, due: { type: 'offsetDays', value: 0 } }];
      for (let j = 0; j < nMid; j++)
        schedule.push({
          label: `Đ${j + 2}`,
          pct: mid,
          due: { type: 'offsetDays', value: (j + 1) * pick([30, 45, 60, 90]) },
        });
      schedule.push({
        label: 'BG',
        pct: nMid ? handover : 100 - first - title,
        due: { type: 'handover' },
        role: 'handover',
      });
      if (title)
        schedule.push({
          label: 'Sổ',
          pct: title,
          due: { type: 'afterHandoverMonths', value: pick([0.5, 1, 1.5, 6, 12, 18]) },
          role: 'title',
        });

      const area = Math.round((25 + r() * 90) * 100) / 100;
      const unit: UnitInput = {
        area,
        pricePerM2: Math.round(12000000 + r() * 20000000),
        netPriceOverride: r() < 0.3 ? Math.round(area * (12000000 + r() * 20000000)) : null,
        vatRate: pick([null, 0, 5, 8, 10]),
        kpbtRate: pick([null, 0, 2]),
      };
      const preset = pick(TS.BANK_PRESETS);
      const loan: Partial<LoanParams> = {
        presetKey: preset.key,
        ltv: pick([50, 60, 65, 70, 80, 85, 100]),
        termYears: pick([5, 10, 15, 20, 25, 30]),
        rateTiers: preset.rateTiers,
        floatingRate: preset.floatingRate,
        prepayFees: preset.prepayFees,
        principalStart: pick(['first', 'last'] as const),
        graceEnabled: r() < 0.5,
        graceMonths: pick([0, 6, 12, 24, 36]),
        dayCount: pick(['actual365', 'monthly'] as const),
        firstBankMilestone: pick([0, 1, 1, 1, 2]),
        loanOverride: r() < 0.2 ? Math.round(r() * 2e9) : null,
        payoffMonth: Math.floor(1 + r() * 400),
      };
      const contract = isoDate(2025);
      const dates = { contractDate: contract, handoverDate: isoDate(2027) };
      const input: ComputeInput = { unit, schedule, dates, loan };
      const { v1, ts } = both((e) => e.compute(input));
      expect(ts, `ca #${i}: ${JSON.stringify(input)}`).toStrictEqual(v1);
    }
  });
});
