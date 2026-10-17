/**
 * Engine vay — bộ não tính toán: phiếu giá, tiến độ thanh toán, khoản vay NOXH.
 * Port 1:1 từ legacy/js/loan/loan-engine.js (v1). KHÔNG đổi công thức, thứ tự làm tròn hay cách
 * ép kiểu (`Number(x)` = `+x` của v1): test parity so từng đồng với bản v1.
 * Thuần TypeScript, không phụ thuộc giao diện / lưu trữ. Mọi số tiền tính bằng đồng (VND), làm tròn tới đồng.
 */

const DAY = 86400000;

/** Giá trị số có thể đến từ ô nhập (chuỗi) — v1 ép bằng `+x`. */
export type Numeric = number | string;

// ---------- Kiểu dữ liệu ----------
export type DueRule =
  | { type: 'offsetDays'; value?: Numeric }
  | { type: 'handover' }
  | { type: 'afterHandoverMonths'; value?: Numeric }
  | { type: 'date'; value: string | number };

export type MilestoneRole = 'handover' | 'title';

export interface ScheduleItem {
  label: string;
  pct: Numeric;
  due?: DueRule;
  role?: MilestoneRole | null;
}

export interface ContractDates {
  contractDate: string | number;
  handoverDate: string | number;
}

export interface RateTier {
  months: Numeric;
  rate: Numeric;
}

export interface BankPreset {
  key: string;
  name: string;
  ltv: number;
  termYears: number;
  rateTiers: RateTier[];
  floatingRate: number;
  maxGraceMonths: number;
  prepayFees: number[];
}

export interface LoanParams {
  presetKey: string;
  ltv: Numeric;
  /** Số tiền vay nhập tay (null = tự tính). */
  loanOverride: Numeric | null;
  termYears: Numeric;
  rateTiers: RateTier[];
  floatingRate: Numeric;
  /** Mốc bắt đầu trả gốc / ân hạn: lần giải ngân đầu hay cuối. */
  principalStart: 'first' | 'last';
  graceEnabled: boolean;
  graceMonths: Numeric;
  /** 'actual365' (ngân hàng VN) | 'monthly' (lãi năm / 12). */
  dayCount: 'actual365' | 'monthly';
  /** Ngân hàng giải ngân từ đợt index này (mặc định 1 = đợt 2). */
  firstBankMilestone: Numeric | null;
  /** % phí tất toán theo năm vay thứ 1, 2, 3...; hết mảng = 0%. */
  prepayFees: Numeric[];
  /** Tất toán sau bao nhiêu tháng. */
  payoffMonth: Numeric;
}

export interface UnitInput {
  area?: Numeric | null;
  pricePerM2?: Numeric | null;
  netPriceOverride?: Numeric | null;
  vatRate?: Numeric | null;
  kpbtRate?: Numeric | null;
}

export interface Price {
  area: number;
  vatRate: number;
  kpbtRate: number;
  pricePerM2: number;
  net: number;
  vat: number;
  kpbt: number;
  gross: number;
  full: number;
}

/** Phần giá mà tiến độ thanh toán cần. */
export type PriceTotals = Pick<Price, 'net' | 'vat' | 'gross' | 'kpbt' | 'full'>;

export interface MilestoneRow {
  index: number;
  label: string;
  pct: number;
  role: MilestoneRole | null;
  date: string;
  amount: number;
  vat: number;
  kpbt: number;
}

export interface Milestones {
  rows: MilestoneRow[];
  warnings: string[];
  absorbIndex: number;
}

export interface AllocatedRow extends MilestoneRow {
  bank: number;
  customer: number;
}

export interface Disbursement {
  date: string | number;
  amount: number;
  label: string;
}

export interface Allocation {
  rows: AllocatedRow[];
  loanAmount: number;
  maxByLtv: number;
  eligibleSum: number;
  customerTotal: number;
  notes: string[];
  disbursements: Disbursement[];
}

export interface ScheduleRow {
  k: number;
  date: string;
  rate: number;
  disbursed: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}

export interface Phase {
  type: 'amortize' | 'interestOnly';
  rate: number;
  fromMonth: number;
  toMonth: number;
  fromDate: string;
  toDate: string;
  firstPayment: number;
  lastPayment: number;
  minPayment: number;
  maxPayment: number;
}

export interface YearSummary {
  year: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
  avgPayment: number;
  months: number;
}

export interface Simulation {
  rows: ScheduleRow[];
  months: number;
  startDate: string;
  lastDisbDate: string;
  principalStartMonth: number;
  totalInterest: number;
  totalPrincipal: number;
  totalPaid: number;
  lastDisbMonth: number;
  phases: Phase[];
  years: YearSummary[];
}

export interface Payoff {
  month: number;
  date: string;
  loanYear: number;
  balance: number;
  feePct: number;
  fee: number;
  totalToPay: number;
  interestPaid: number;
  interestSaved: number;
  netSaving: number;
  warning: string | null;
}

export interface ComputeInput {
  unit?: UnitInput | null;
  schedule?: ScheduleItem[] | null;
  dates: ContractDates;
  loan?: Partial<LoanParams> | null;
}

export interface ComputeResult {
  price: Price;
  milestones: AllocatedRow[];
  warnings: string[];
  loan: {
    amount: number;
    maxByLtv: number;
    customerTotal: number;
    disbursements: Disbursement[];
    params: LoanParams;
  };
  schedule: Simulation | null;
  firstAmortRow: ScheduleRow | null;
  maxPayment: number;
  payoff: Payoff | null;
}

/** Truy cập phần tử bắt buộc phải có (v1 sẽ ném TypeError ở cùng chỗ nếu thiếu). */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new TypeError(`loan-engine: thiếu phần tử ${i}`);
  return v;
}

// ---------- Ngày tháng (dùng UTC để tránh lệch múi giờ) ----------
function parseDate(s: string | number): number {
  if (typeof s === 'number') return s;
  const p = String(s).split('-').map(Number);
  return Date.UTC(p[0] as number, (p[1] as number) - 1, p[2]);
}
function toISO(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
function addDays(t: number, n: number): number {
  return t + n * DAY;
}
function addMonths(t: number, n: number): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(day, last));
}
function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY);
}
const round = Math.round;

// ---------- Mặc định ----------
// Tiến độ thanh toán mẫu CĐT Happy Home Tràng Cát.
// role: 'handover' = đợt bàn giao, nhận phần còn lại + KPBT (gánh luôn VAT của đợt nhận sổ)
//       'title'    = đợt nhận sổ, tính trên giá thuần (không VAT)
export const DEFAULT_SCHEDULE: ScheduleItem[] = [
  { label: 'Ký Hợp đồng mua bán (T)', pct: 30, due: { type: 'offsetDays', value: 0 } },
  { label: 'T+60', pct: 10, due: { type: 'offsetDays', value: 60 } },
  { label: 'T+120', pct: 10, due: { type: 'offsetDays', value: 120 } },
  { label: 'T+180', pct: 10, due: { type: 'offsetDays', value: 180 } },
  { label: 'T+240', pct: 10, due: { type: 'offsetDays', value: 240 } },
  { label: 'Thông báo bàn giao + KPBT', pct: 25, due: { type: 'handover' }, role: 'handover' },
  { label: 'Nhận sổ (bìa)', pct: 5, due: { type: 'afterHandoverMonths', value: 12 }, role: 'title' },
];

// Preset gói vay. Lãi suất NQ33 / người trẻ do NHNN công bố lại 6 tháng/lần → chỉ là giả định.
// Chỉ giữ 3 gói khác biệt thật + "Khác" (custom). Danh sách & tên hiển thị QUYẾT ĐỊNH Ở ĐÂY;
// bảng bank_presets trên Supabase chỉ cập nhật số liệu (lãi suất, phí...) cho đúng key.
export const BANK_PRESETS: BankPreset[] = [
  {
    key: 'young35',
    name: 'Dưới 35 tuổi',
    ltv: 70,
    termYears: 25,
    rateTiers: [
      { months: 60, rate: 6.5 },
      { months: 120, rate: 7.5 },
    ],
    floatingRate: 10,
    maxGraceMonths: 24,
    prepayFees: [3, 3, 2, 1, 1],
  },
  {
    key: 'nq33',
    name: 'NQ33',
    ltv: 70,
    termYears: 25,
    rateTiers: [{ months: 60, rate: 6.5 }],
    floatingRate: 10,
    maxGraceMonths: 24,
    prepayFees: [3, 3, 2, 1, 1],
  },
  {
    key: 'vbsp',
    name: 'NHCSXH',
    ltv: 80,
    termYears: 25,
    rateTiers: [{ months: 300, rate: 5.4 }],
    floatingRate: 5.4,
    maxGraceMonths: 12,
    prepayFees: [0],
  },
  {
    key: 'custom',
    name: 'Khác',
    ltv: 70,
    termYears: 25,
    rateTiers: [{ months: 60, rate: 6.5 }],
    floatingRate: 10,
    maxGraceMonths: 60,
    prepayFees: [3, 3, 2, 1, 1],
  },
];

export const DEFAULT_LOAN: LoanParams = {
  presetKey: 'nq33',
  ltv: 70,
  loanOverride: null,
  termYears: 25,
  rateTiers: [{ months: 60, rate: 6.5 }],
  floatingRate: 10,
  principalStart: 'first',
  graceEnabled: false,
  graceMonths: 12,
  dayCount: 'actual365',
  firstBankMilestone: 1,
  prepayFees: [3, 3, 2, 1, 1],
  payoffMonth: 60,
};

// ---------- 1. Phiếu giá ----------
export function calcPrice(p: UnitInput): Price {
  const area = Number(p.area) || 0;
  const vatRate = p.vatRate == null ? 5 : Number(p.vatRate);
  const kpbtRate = p.kpbtRate == null ? 2 : Number(p.kpbtRate);
  const net = p.netPriceOverride ? round(Number(p.netPriceOverride)) : round(area * (Number(p.pricePerM2) || 0));
  const vat = round((net * vatRate) / 100);
  const kpbt = round((net * kpbtRate) / 100);
  const gross = net + vat;
  return {
    area,
    vatRate,
    kpbtRate,
    pricePerM2: area ? round(net / area) : 0,
    net,
    vat,
    kpbt,
    gross,
    full: gross + kpbt,
  };
}

// ---------- 2. Tiến độ thanh toán CĐT ----------
function dueDate(m: ScheduleItem, dates: ContractDates): number {
  const T = parseDate(dates.contractDate);
  const H = parseDate(dates.handoverDate);
  const d = (m.due || {}) as Partial<{ type: string; value: Numeric }>;
  if (d.type === 'handover') return H;
  if (d.type === 'afterHandoverMonths') {
    // Hỗ trợ số tháng lẻ (VD 1,5 tháng = 1 tháng + 15 ngày; phần lẻ quy đổi 30 ngày/tháng)
    const v = Number(d.value) || 0;
    const whole = Math.floor(v);
    return addDays(addMonths(H, whole), Math.round((v - whole) * 30));
  }
  if (d.type === 'date') return parseDate(d.value as string | number);
  return addDays(T, Number(d.value) || 0);
}

// Quy tắc chia tiền từng đợt (áp cho MỌI tiến độ, không riêng 7 đợt):
//  - Đợt thường: X% giá trị căn hộ (giá thuần) + X% tổng VAT.
//  - Đợt nhận sổ (role 'title', là đợt cuối): chỉ X% giá thuần, KHÔNG VAT.
//  - VAT phải thu đủ TRƯỚC đợt nhận sổ: phần VAT của đợt nhận sổ (+ phần lẻ làm tròn) dồn vào
//    đợt KẾ CUỐI (đợt ngay trước đợt nhận sổ — thường chính là đợt bàn giao).
//  - Kinh phí bảo trì (KPBT) thu ở đợt bàn giao (role 'handover').
//  VD 10 đợt: Đ1 30% (+30% VAT) · Đ2–8 mỗi đợt 5% (+5% VAT) · Đ9 bàn giao 30% (+35% VAT) + KPBT
//  · Đ10 nhận sổ 5% (không VAT).
export function calcMilestones(
  price: PriceTotals,
  schedule: ScheduleItem[] | null | undefined,
  dates: ContractDates,
): Milestones {
  const items = schedule?.length ? schedule : DEFAULT_SCHEDULE;
  const warnings: string[] = [];
  const pctSum = items.reduce((s, m) => s + (Number(m.pct) || 0), 0);
  if (Math.abs(pctSum - 100) > 0.001) warnings.push(`Tổng tỷ lệ các đợt = ${pctSum}% (khác 100%)`);

  const rows: MilestoneRow[] = items.map((m, i) => ({
    index: i,
    label: m.label,
    pct: Number(m.pct) || 0,
    role: m.role || null,
    date: toISO(dueDate(m, dates)),
    amount: 0,
    vat: 0,
    kpbt: 0,
  }));
  // Đợt "gánh" phần VAT còn lại: đợt ngay trước đợt nhận sổ đầu tiên; không có đợt nhận sổ
  // → đợt bàn giao; không có cả hai → đợt cuối.
  const firstTitle = rows.findIndex((r) => r.role === 'title');
  const hIdx = rows.findIndex((r) => r.role === 'handover');
  const absorb = firstTitle > 0 ? firstTitle - 1 : hIdx >= 0 ? hIdx : rows.length - 1;
  if (firstTitle === 0) warnings.push('Đợt nhận sổ không thể là đợt đầu tiên');
  for (const r of rows.slice(firstTitle + 1)) {
    if (firstTitle >= 0 && r.role !== 'title')
      warnings.push(`Có đợt sau đợt nhận sổ ("${r.label}") — VAT vẫn dồn vào đợt trước nhận sổ`);
  }

  rows.forEach((r, i) => {
    if (i === absorb) return;
    if (r.role === 'title') {
      r.amount = round((price.net * r.pct) / 100);
      r.vat = 0;
    } else {
      r.amount = round((price.gross * r.pct) / 100);
      r.vat = round((price.vat * r.pct) / 100);
    }
  });
  // KPBT: đợt bàn giao; không có đợt bàn giao → đợt gánh VAT (để tổng vẫn = giá FULL)
  const kIdx = hIdx >= 0 ? hIdx : absorb;
  if (hIdx < 0) warnings.push(`Không có đợt bàn giao — KPBT tính vào đợt ${absorb + 1}`);
  const K = at(rows, kIdx);
  K.kpbt = price.kpbt;
  if (kIdx !== absorb) K.amount += price.kpbt;
  // Đợt gánh = phần còn lại để tổng các đợt đúng bằng giá FULL (gồm VAT dư + làm tròn)
  const A = at(rows, absorb);
  A.amount = price.full - rows.reduce((s, r, i) => (i === absorb ? s : s + r.amount), 0);
  A.vat = price.vat - rows.reduce((s, r, i) => (i === absorb ? s : s + r.vat), 0);
  return { rows, warnings, absorbIndex: absorb };
}

/** Kiểm tra 1 tiến độ (dùng ở màn cấu hình): trả về danh sách lỗi/cảnh báo, rỗng = hợp lệ. */
export function validateSchedule(schedule: ScheduleItem[] | null | undefined): string[] {
  const out: string[] = [];
  if (!schedule?.length) return ['Chưa có đợt nào'];
  const sum = schedule.reduce((s, m) => s + (Number(m.pct) || 0), 0);
  if (Math.abs(sum - 100) > 0.001) out.push(`Tổng tỷ lệ = ${Math.round(sum * 100) / 100}% (phải đúng 100%)`);
  const nH = schedule.filter((m) => m.role === 'handover').length;
  const nT = schedule.filter((m) => m.role === 'title').length;
  if (nH !== 1) out.push(nH ? 'Chỉ được 1 đợt bàn giao' : 'Cần 1 đợt "Bàn giao" (thu KPBT)');
  if (nT > 1) out.push('Chỉ được 1 đợt nhận sổ');
  if (nT === 1 && at(schedule, schedule.length - 1).role !== 'title') out.push('Đợt nhận sổ phải là đợt cuối');
  if (nT === 1 && schedule.length < 2) out.push('Cần ít nhất 1 đợt trước đợt nhận sổ');
  schedule.forEach((m, i) => {
    if (!(Number(m.pct) > 0)) out.push(`Đợt ${i + 1}: tỷ lệ phải > 0`);
  });
  return out;
}

/** % VAT của từng đợt theo quy tắc trên (để hiển thị khi cấu hình tiến độ). */
export function vatPercents(schedule: ScheduleItem[] | null | undefined): number[] {
  const ms = calcMilestones({ net: 1e12, vat: 1e12, gross: 2e12, kpbt: 0, full: 2e12 }, schedule, {
    contractDate: '2026-01-01',
    handoverDate: '2027-01-01',
  });
  return ms.rows.map((r) => Math.round((r.vat / 1e12) * 10000) / 100);
}

// ---------- 3. Phân bổ khách trả / ngân hàng giải ngân ----------
export function allocateLoan(
  price: Pick<Price, 'gross'>,
  ms: Pick<Milestones, 'rows'>,
  loan: Pick<LoanParams, 'firstBankMilestone' | 'ltv' | 'loanOverride'>,
): Allocation {
  const first = loan.firstBankMilestone == null ? 1 : Number(loan.firstBankMilestone);
  let eligibleSum = 0;
  for (const r of ms.rows) if (r.index >= first) eligibleSum += r.amount - r.kpbt;
  const maxByLtv = round((price.gross * (Number(loan.ltv) || 0)) / 100);
  let amount = loan.loanOverride ? round(Number(loan.loanOverride)) : maxByLtv;
  const notes: string[] = [];
  if (amount > eligibleSum) {
    notes.push(
      `Khoản vay vượt phần ngân hàng được giải ngân (từ đợt ${first + 1}), đã giới hạn còn ${eligibleSum.toLocaleString('vi-VN')}đ`,
    );
    amount = eligibleSum;
  }
  // Khách trả phần vốn tự có trước, ngân hàng giải ngân phần sau
  let ownInEligible = eligibleSum - amount;
  const rows: AllocatedRow[] = ms.rows.map((r) => {
    const o: AllocatedRow = { ...r, bank: 0, customer: r.amount };
    if (r.index >= first) {
      const base = r.amount - r.kpbt;
      const own = Math.min(base, ownInEligible);
      ownInEligible -= own;
      o.bank = base - own;
      o.customer = r.amount - o.bank;
    }
    return o;
  });
  const customerTotal = rows.reduce((s, r) => s + r.customer, 0);
  return {
    rows,
    loanAmount: amount,
    maxByLtv,
    eligibleSum,
    customerTotal,
    notes,
    disbursements: rows.filter((r) => r.bank > 0).map((r) => ({ date: r.date, amount: r.bank, label: r.label })),
  };
}

// ---------- 4. Mô phỏng trả nợ từng tháng ----------
function rateForMonth(k: number, tiers: RateTier[], floating: Numeric): number {
  let acc = 0;
  for (const tier of tiers) {
    acc += Number(tier.months) || 0;
    if (k <= acc) return Number(tier.rate);
  }
  return Number(floating);
}

function segInterest(balance: number, rate: number, days: number, periodDays: number, dayCount: string): number {
  if (days <= 0 || balance <= 0) return 0;
  if (dayCount === 'monthly') return (((balance * rate) / 100 / 12) * days) / periodDays;
  return (((balance * rate) / 100) * days) / 365;
}

export function simulate(
  disbursements: Disbursement[],
  loan: Pick<
    LoanParams,
    'termYears' | 'principalStart' | 'graceEnabled' | 'graceMonths' | 'rateTiers' | 'floatingRate' | 'dayCount'
  >,
): Simulation | null {
  if (!disbursements.length) return null;
  const N = Math.max(1, round((Number(loan.termYears) || 25) * 12));
  const disb = disbursements
    .map((d) => ({ t: parseDate(d.date), amount: d.amount, label: d.label }))
    .sort((a, b) => a.t - b.t);
  const start = at(disb, 0).t;
  const lastDisb = at(disb, disb.length - 1).t;
  const anchor = loan.principalStart === 'last' ? lastDisb : start;
  let anchorMonths = 0;
  while (addMonths(start, anchorMonths + 1) <= anchor) anchorMonths++;
  const p0 = anchorMonths + 1 + (loan.graceEnabled ? Number(loan.graceMonths) || 0 : 0);

  const rows: ScheduleRow[] = [];
  let balance = 0;
  let di = 0;
  let totalInterest = 0;
  let totalPrincipal = 0;
  for (let k = 1; k <= N; k++) {
    const ps = addMonths(start, k - 1);
    const pe = addMonths(start, k);
    const rate = rateForMonth(k, loan.rateTiers || [], loan.floatingRate);
    const periodDays = daysBetween(ps, pe);
    let interest = 0;
    let disbursed = 0;
    let cursor = ps;
    // giải ngân trong kỳ → dư nợ tăng từ ngày giải ngân
    while (di < disb.length && at(disb, di).t < pe) {
      const d = at(disb, di);
      const dt = Math.max(d.t, ps);
      interest += segInterest(balance, rate, daysBetween(cursor, dt), periodDays, loan.dayCount);
      cursor = dt;
      balance += d.amount;
      disbursed += d.amount;
      di++;
    }
    interest += segInterest(balance, rate, daysBetween(cursor, pe), periodDays, loan.dayCount);
    interest = round(interest);
    let principal = 0;
    if (k >= p0) principal = k === N ? balance : round(balance / (N - k + 1));
    if (k === N && di < disb.length) principal = balance; // an toàn
    balance -= principal;
    totalInterest += interest;
    totalPrincipal += principal;
    rows.push({
      k,
      date: toISO(pe),
      rate,
      disbursed,
      interest,
      principal,
      payment: interest + principal,
      balance,
    });
  }
  const disbRows = rows.filter((r) => r.disbursed > 0);
  return {
    rows,
    months: N,
    startDate: toISO(start),
    lastDisbDate: toISO(lastDisb),
    principalStartMonth: p0,
    totalInterest,
    totalPrincipal,
    totalPaid: totalInterest + totalPrincipal,
    lastDisbMonth: at(disbRows, disbRows.length - 1).k,
    phases: buildPhases(rows),
    years: buildYears(rows),
  };
}

function buildPhases(rows: ScheduleRow[]): Phase[] {
  const phases: Phase[] = [];
  let cur: Phase | null = null;
  let curKey = '';
  for (const r of rows) {
    const type = r.principal > 0 ? 'amortize' : 'interestOnly';
    const key = `${type}|${r.rate}`;
    if (!cur || curKey !== key) {
      cur = {
        type,
        rate: r.rate,
        fromMonth: r.k,
        toMonth: r.k,
        fromDate: r.date,
        toDate: r.date,
        firstPayment: r.payment,
        lastPayment: r.payment,
        minPayment: r.payment,
        maxPayment: r.payment,
      };
      curKey = key;
      phases.push(cur);
    }
    cur.toMonth = r.k;
    cur.toDate = r.date;
    cur.lastPayment = r.payment;
    cur.minPayment = Math.min(cur.minPayment, r.payment);
    cur.maxPayment = Math.max(cur.maxPayment, r.payment);
  }
  return phases;
}

function buildYears(rows: ScheduleRow[]): YearSummary[] {
  const years: YearSummary[] = [];
  for (const r of rows) {
    const y = Math.ceil(r.k / 12);
    let o = years[y - 1];
    if (!o) {
      o = { year: y, interest: 0, principal: 0, payment: 0, balance: 0, avgPayment: 0, months: 0 };
      years[y - 1] = o;
    }
    o.interest += r.interest;
    o.principal += r.principal;
    o.payment += r.payment;
    o.balance = r.balance;
    o.months++;
  }
  for (const y of years) y.avgPayment = round(y.payment / y.months);
  return years;
}

// ---------- 5. Tất toán sớm ----------
function feePctForMonth(k: number, fees: Numeric[]): number {
  const yearIdx = Math.floor(k / 12); // đã vay đủ 12 tháng → sang năm thứ 2
  return yearIdx < fees.length ? Number(fees[yearIdx]) : 0;
}

export function payoff(sim: Simulation | null, month: Numeric, fees: Numeric[] | null | undefined): Payoff | null {
  if (!sim) return null;
  let k = Math.max(1, Math.min(round(Number(month)), sim.months - 1));
  let warn: string | null = null;
  if (k < sim.lastDisbMonth) {
    warn = `Ngân hàng chưa giải ngân hết ở tháng ${k}; đã tính tại tháng ${sim.lastDisbMonth}`;
    k = sim.lastDisbMonth;
  }
  const r = at(sim.rows, k - 1);
  const feePct = feePctForMonth(k, fees || []);
  const fee = round((r.balance * feePct) / 100);
  const interestPaid = sim.rows.slice(0, k).reduce((s, x) => s + x.interest, 0);
  const interestRemaining = sim.totalInterest - interestPaid;
  return {
    month: k,
    date: r.date,
    loanYear: Math.floor(k / 12) + 1,
    balance: r.balance,
    feePct,
    fee,
    totalToPay: r.balance + fee,
    interestPaid,
    interestSaved: interestRemaining,
    netSaving: interestRemaining - fee,
    warning: warn,
  };
}

// ---------- Tổng hợp ----------
export function compute(input: ComputeInput): ComputeResult {
  const loan: LoanParams = { ...DEFAULT_LOAN, ...(input.loan || {}) };
  const price = calcPrice(input.unit || {});
  const ms = calcMilestones(price, input.schedule, input.dates);
  const alloc = allocateLoan(price, ms, loan);
  const sim = simulate(alloc.disbursements, loan);
  const po = sim ? payoff(sim, loan.payoffMonth, loan.prepayFees) : null;
  const firstAmort = sim ? sim.rows[sim.principalStartMonth - 1] : null;
  return {
    price,
    milestones: alloc.rows,
    warnings: ms.warnings.concat(alloc.notes),
    loan: {
      amount: alloc.loanAmount,
      maxByLtv: alloc.maxByLtv,
      customerTotal: alloc.customerTotal,
      disbursements: alloc.disbursements,
      params: loan,
    },
    schedule: sim,
    firstAmortRow: firstAmort || null,
    maxPayment: sim ? Math.max(...sim.rows.map((r) => r.payment)) : 0,
    payoff: po,
  };
}

export const util = { parseDate, toISO, addMonths, addDays };
