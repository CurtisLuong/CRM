import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import {
  BANK_PRESETS,
  type ComputeInput,
  type ComputeResult,
  calcPrice,
  DEFAULT_LOAN,
  DEFAULT_SCHEDULE,
  type LoanParams,
  type ScheduleItem,
} from '@/domain/loan';

export type LoanUnit = {
  projectName: string;
  building: string;
  code: string;
  aptType: string;
  area: number;
  pricePerM2: number;
  netOverride: number | null;
  /** Phí mỗi căn (đ) — theo Giỏ hàng căn > toà > dự án, sửa tay được (LF-01). */
  fee?: number | null;
  [key: string]: unknown;
};
export type LoanState = {
  unit: LoanUnit;
  dates: { contractDate: string; handoverDate: string; titleAfterMonths: number; [key: string]: unknown };
  loan: LoanParams;
  [key: string]: unknown;
};
export type LoanPrefill = Partial<LoanUnit> & { customerId?: string };
/** Luật vay (Curtis 06/11): để trống = tự động 70%; nhập tay không được vượt 80% (giá thuần + VAT). */
export const LTV_AUTO = Number(DEFAULT_LOAN.ltv);
export const LTV_MAX = 80;
export const ltvOf = (amount: number, gross: number) => (gross > 0 ? Math.round((amount / gross) * 10000) / 100 : 0);
export const money = (n: number) => Math.round(n).toLocaleString('vi-VN');
export function loanPath(prefill: LoanPrefill = {}) {
  const params = new URLSearchParams();
  for (const key of [
    'customerId',
    'projectName',
    'building',
    'code',
    'aptType',
    'area',
    'pricePerM2',
    'netOverride',
  ] as const) {
    const value = prefill[key];
    if (value != null && value !== '') params.set(key, String(value));
  }
  return `/tinh-vay${params.size ? `?${params}` : ''}`;
}
export function applyCatalog(state: LoanState, catalog: RepositoryAccount['catalog']): LoanState {
  const p = catalog.projectByName(state.unit.projectName);
  if (!p) return state;
  const b = catalog.buildingByCode(p.id, state.unit.building);
  const u = b ? catalog.unitByCode(b.id, state.unit.code) : null;
  const fee = u ? catalog.unitFee(u) : b ? catalog.buildingFee(b) : catalog.projectFee(p);
  return {
    ...state,
    unit: {
      ...state.unit,
      fee,
      pricePerM2:
        Number(u?.price_per_m2_override) ||
        Number(b?.approved_price_per_m2) ||
        Number(p.typical_price_per_m2) ||
        state.unit.pricePerM2,
      ...(u
        ? {
            area: Number(u.area_m2) || state.unit.area,
            aptType: u.apt_type || state.unit.aptType,
            netOverride: u.net_price_override ? Number(u.net_price_override) : null,
          }
        : {}),
    },
    dates: {
      ...state.dates,
      handoverDate: b?.handover_date || p.handover_date || state.dates.handoverDate,
      titleAfterMonths: p.title_after_months == null ? state.dates.titleAfterMonths : Number(p.title_after_months),
    },
  };
}
export function customerUnit(c: Customer): Partial<LoanUnit> {
  return {
    ...(Array.isArray(c.projects) && c.projects[0] ? { projectName: String(c.projects[0]) } : {}),
    ...(c.building_code ? { building: String(c.building_code) } : {}),
    ...(c.apt_code ? { code: String(c.apt_code) } : {}),
    ...(c.apt_type ? { aptType: String(c.apt_type) } : {}),
    ...(Number(c.apt_area) > 0 ? { area: Number(c.apt_area) } : {}),
  };
}
export function readPrefill(params: URLSearchParams): LoanPrefill {
  const prefill: LoanPrefill = {};
  for (const key of ['customerId', 'projectName', 'building', 'code', 'aptType'] as const) {
    const v = params.get(key);
    if (v) prefill[key] = v;
  }
  for (const key of ['area', 'pricePerM2', 'netOverride'] as const) {
    const n = Number(params.get(key));
    if (params.has(key) && Number.isFinite(n) && n > 0) prefill[key] = n;
  }
  return prefill;
}
export function initialState(prefill: Partial<LoanUnit> = {}, now = new Date()): LoanState {
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const supplied = Object.fromEntries(
    ['projectName', 'building', 'code', 'aptType', 'area', 'pricePerM2', 'netOverride']
      .filter((k) => prefill[k] != null && prefill[k] !== '')
      .map((k) => [k, prefill[k]]),
  );
  return {
    unit: {
      projectName: '',
      building: '',
      code: '',
      aptType: '',
      area: 53.6,
      pricePerM2: 19911530,
      netOverride: null,
      fee: null,
      ...supplied,
    },
    dates: { contractDate: today, handoverDate: '', titleAfterMonths: 1.5 },
    loan: structuredClone(DEFAULT_LOAN),
  };
}
export function buildInput(state: LoanState, project?: Record<string, unknown> | null): ComputeInput {
  const schedule = structuredClone(
    Array.isArray(project?.payment_schedule) ? (project.payment_schedule as ScheduleItem[]) : DEFAULT_SCHEDULE,
  ).map((m) =>
    m.role === 'title' && m.due?.type === 'afterHandoverMonths'
      ? { ...m, due: { ...m.due, value: state.dates.titleAfterMonths } }
      : m,
  );
  const unit = {
    area: state.unit.area,
    pricePerM2: state.unit.pricePerM2,
    netPriceOverride: state.unit.netOverride,
    fee: state.unit.fee,
    vatRate: project?.vat_rate == null ? 5 : Number(project.vat_rate),
    kpbtRate: project?.kpbt_rate == null ? 2 : Number(project.kpbt_rate),
  };
  return { unit, dates: state.dates, schedule, loan: cappedLoan(state.loan, calcPrice(unit).gross) };
}
/**
 * Khoản vay hiệu lực: số tiền nhập tay (nếu có) kẹp ở 80% và kéo tỷ lệ theo (phiếu in đúng %);
 * không nhập tay thì tỷ lệ kẹp ở 80%. Trong giới hạn thì giữ nguyên object (khớp v1).
 */
export function cappedLoan(loan: LoanParams, gross: number): LoanParams {
  const cap = Math.round((gross * LTV_MAX) / 100);
  const override = loan.loanOverride == null || loan.loanOverride === '' ? null : Number(loan.loanOverride);
  if (override) {
    const amount = Math.min(override, cap);
    return { ...loan, loanOverride: amount, ltv: ltvOf(amount, gross) };
  }
  return Number(loan.ltv) > LTV_MAX ? { ...loan, ltv: LTV_MAX } : loan;
}
export function validateState(state: LoanState): string | null {
  if (!Number.isFinite(state.unit.area) || state.unit.area <= 0) return 'Diện tích phải lớn hơn 0.';
  if (!Number.isFinite(state.unit.pricePerM2) || state.unit.pricePerM2 < 0) return 'Đơn giá không hợp lệ.';
  if (state.unit.netOverride != null && (!Number.isFinite(state.unit.netOverride) || state.unit.netOverride <= 0))
    return 'Giá thuần nhập tay phải lớn hơn 0.';
  if (
    !state.dates.contractDate ||
    !state.dates.handoverDate ||
    !Number.isFinite(Date.parse(state.dates.contractDate)) ||
    !Number.isFinite(Date.parse(state.dates.handoverDate))
  )
    return 'Nhập ngày ký hợp đồng và bàn giao.';
  if (state.dates.handoverDate < state.dates.contractDate) return 'Ngày bàn giao không được trước ngày hợp đồng.';
  if (!Number.isFinite(state.dates.titleAfterMonths) || state.dates.titleAfterMonths < 0)
    return 'Số tháng nhận sổ không hợp lệ.';
  if (!Number.isFinite(Number(state.loan.ltv)) || Number(state.loan.ltv) < 0 || Number(state.loan.ltv) > 100)
    return 'Tỷ lệ vay phải từ 0 đến 100%.';
  if (
    state.loan.loanOverride != null &&
    (!Number.isFinite(Number(state.loan.loanOverride)) || Number(state.loan.loanOverride) < 0)
  )
    return 'Số tiền vay nhập tay không hợp lệ.';
  if (
    !Number.isInteger(Number(state.loan.termYears)) ||
    Number(state.loan.termYears) < 1 ||
    Number(state.loan.termYears) > 50
  )
    return 'Kỳ hạn vay phải từ 1 đến 50 năm.';
  if (
    !Number.isFinite(Number(state.loan.graceMonths)) ||
    Number(state.loan.graceMonths) < 0 ||
    Number(state.loan.graceMonths) >= Number(state.loan.termYears) * 12
  )
    return 'Ân hạn phải ngắn hơn kỳ hạn vay.';
  if (
    state.loan.rateTiers.some(
      (t) =>
        !Number.isFinite(Number(t.rate)) ||
        Number(t.rate) < 0 ||
        Number(t.rate) > 100 ||
        !Number.isInteger(Number(t.months)) ||
        Number(t.months) < 1,
    )
  )
    return 'Mỗi bậc lãi cần số tháng nguyên dương và lãi suất 0–100%.';
  if (
    !Number.isFinite(Number(state.loan.floatingRate)) ||
    Number(state.loan.floatingRate) < 0 ||
    Number(state.loan.floatingRate) > 100
  )
    return 'Lãi suất thả nổi phải từ 0 đến 100%.';
  if (
    !Number.isInteger(Number(state.loan.payoffMonth)) ||
    Number(state.loan.payoffMonth) < 1 ||
    Number(state.loan.payoffMonth) > Number(state.loan.termYears) * 12
  )
    return 'Tháng tất toán phải nằm trong kỳ hạn vay.';
  if (state.loan.prepayFees.some((n) => !Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) > 100))
    return 'Phí tất toán phải từ 0 đến 100%.';
  return null;
}
/** Opening an older quote keeps extension keys; malformed payloads never enter the React form. */
export function restoreLoanState(raw: unknown): LoanState {
  if (!raw || typeof raw !== 'object') throw new Error('Phương án thiếu thông số.');
  const value = raw as Record<string, unknown>;
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value.unit) || !object(value.dates) || !object(value.loan)) throw new Error('Phương án thiếu thông số.');
  const defaults = initialState();
  const state = {
    ...value,
    unit: { ...defaults.unit, ...value.unit },
    dates: { ...defaults.dates, ...value.dates },
    loan: { ...defaults.loan, ...value.loan },
  } as LoanState;
  if (
    ['projectName', 'building', 'code', 'aptType'].some((k) => typeof state.unit[k] !== 'string') ||
    typeof state.dates.contractDate !== 'string' ||
    typeof state.dates.handoverDate !== 'string' ||
    !Array.isArray(state.loan.rateTiers) ||
    state.loan.rateTiers.some((t) => !t || typeof t !== 'object') ||
    !Array.isArray(state.loan.prepayFees)
  )
    throw new Error('Thông số phương án không hợp lệ.');
  const issue = validateState(state);
  if (issue) throw new Error(issue);
  return structuredClone(state);
}
export function quoteSummary(result: ComputeResult) {
  const s = result.schedule;
  const steady = s?.rows[Math.min(Math.max(s.lastDisbMonth, s.principalStartMonth), s.rows.length - 1)];
  return {
    full: result.price.full,
    loan: result.loan.amount,
    customerTotal: result.loan.customerTotal,
    steadyPayment: steady?.payment ?? 0,
    maxPayment: result.maxPayment,
    totalInterest: s?.totalInterest ?? 0,
    presetKey: result.loan.params.presetKey,
  };
}
export function presetParams(key: string) {
  const preset = BANK_PRESETS.find((p) => p.key === key) ?? BANK_PRESETS[0];
  return { ...structuredClone(DEFAULT_LOAN), ...structuredClone(preset), presetKey: key };
}
