import { BANK_RATE_LIMITS, BANKS, type BankCode, DEPOSIT_RATE_LIMITS } from '@/config/banks';

export type BankRate = {
  bank_code: string;
  kind?: string | null;
  deposit_rate?: number | null;
  published_on?: string | null;
  promo_rate?: number | null;
  promo_months?: number | null;
  floating_rate?: number | null;
  fetched_at?: string | null;
  source_kind?: string | null;
  source_url?: string | null;
  source_title?: string | null;
  note?: string | null;
};
export type RateOverride = {
  deposit_rate?: number | null;
  promo_rate: number | null;
  promo_months: number | null;
  floating_rate: number | null;
  note: string;
  at: string;
};
export type Overrides = Partial<Record<BankCode, RateOverride | null>>;
export type RateCache = { rates: BankRate[]; overrides: Overrides };

export function readRates(raw: unknown): BankRate[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is BankRate => !!row && typeof row === 'object' && typeof row.bank_code === 'string');
}

export function validRate(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= BANK_RATE_LIMITS.min &&
    value <= BANK_RATE_LIMITS.max
    ? value
    : null;
}

export function validDepositRate(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= DEPOSIT_RATE_LIMITS.min &&
    value <= DEPOSIT_RATE_LIMITS.max
    ? value
    : null;
}

/** Ngày ở Việt Nam không phụ thuộc múi giờ của thiết bị. */
export function vietnamDay(value: string | null | undefined): string | null {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
}

export function sourceDay(rate: BankRate | undefined): string | null {
  return rate?.published_on || vietnamDay(rate?.fetched_at);
}

export function formatRateDay(day: string, full = true): string {
  const [year, month, date] = day.split('-');
  return full ? `${date}/${month}/${year}` : `${date}/${month}`;
}

export function rateFor(loan: BankRate | undefined, override: RateOverride | null | undefined, deposit?: BankRate) {
  const promo = validRate(override?.promo_rate);
  const floating = validRate(override?.floating_rate);
  const saving = validDepositRate(override?.deposit_rate);
  const promo_rate = promo ?? validRate(loan?.promo_rate);
  const floating_rate = floating ?? validRate(loan?.floating_rate);
  const deposit_rate = saving ?? validDepositRate(deposit?.deposit_rate);
  const manualDay = vietnamDay(override?.at);
  return {
    promo_rate,
    floating_rate,
    deposit_rate,
    promo_months: override?.promo_months ?? loan?.promo_months,
    note: override?.note || loan?.note,
    dates: {
      promo: promo_rate === null ? null : promo !== null ? manualDay : sourceDay(loan),
      floating: floating_rate === null ? null : floating !== null ? manualDay : sourceDay(loan),
      deposit: deposit_rate === null ? null : saving !== null ? manualDay : sourceDay(deposit),
    },
  };
}

export function bankRateRows(rates: BankRate[], overrides: Overrides) {
  return BANKS.map((bank) => {
    const loan = rates.find((row) => row.bank_code === bank.code && (!row.kind || row.kind === 'loan'));
    const deposit = rates.find((row) => row.bank_code === bank.code && row.kind === 'deposit');
    const override = overrides[bank.code];
    const effective = rateFor(loan, override, deposit);
    const hasLoan = effective.promo_rate !== null || effective.floating_rate !== null;
    const source = hasLoan ? loan : deposit;
    return {
      ...bank,
      ...effective,
      override,
      source,
      detailDay: override ? vietnamDay(override.at) : sourceDay(source),
      url: sourceUrl(loan?.source_url) ?? sourceUrl(deposit?.source_url),
    };
  });
}

export function rateSummary(rows: ReturnType<typeof bankRateRows>) {
  const mean = (field: 'promo_rate' | 'floating_rate' | 'deposit_rate') => {
    const values = rows.map((row) => row[field]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const dates = rows
    .flatMap((row) => Object.values(row.dates))
    .filter((day): day is string => !!day)
    .sort();
  return {
    promo: mean('promo_rate'),
    floating: mean('floating_rate'),
    deposit: mean('deposit_rate'),
    updatedOn: dates.at(-1),
  };
}

export function big4Average(rates: BankRate[], overrides: Overrides) {
  const summary = rateSummary(bankRateRows(rates, overrides).filter((bank) => bank.big4));
  return { promo: summary.promo, floating: summary.floating };
}

export function formatRate(value: number | null) {
  return value === null
    ? '—'
    : `${value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function sourceUrl(value: string | null | undefined) {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function readOverrides(raw: unknown): Overrides {
  if (!raw || typeof raw !== 'object') return {};
  const value = (raw as { bank_rate_overrides?: Overrides }).bank_rate_overrides;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    BANKS.map(({ code }) => {
      const row = value[code];
      return [
        code,
        row && typeof row === 'object'
          ? {
              deposit_rate: validDepositRate(row.deposit_rate),
              promo_rate: validRate(row.promo_rate),
              floating_rate: validRate(row.floating_rate),
              promo_months:
                typeof row.promo_months === 'number' && Number.isInteger(row.promo_months) && row.promo_months > 0
                  ? row.promo_months
                  : null,
              note: typeof row.note === 'string' ? row.note : '',
              at: typeof row.at === 'string' ? row.at : '',
            }
          : null,
      ];
    }),
  );
}

const cacheKey = (id: string) => `crm_bank_rates:${id}`;
export function readRateCache(id: string): RateCache {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(id)) || 'null');
    return {
      rates: readRates(raw?.rates),
      overrides: readOverrides({ bank_rate_overrides: raw?.overrides }),
    };
  } catch {
    return { rates: [], overrides: {} };
  }
}
export function writeRateCache(id: string, value: RateCache) {
  try {
    localStorage.setItem(cacheKey(id), JSON.stringify(value));
  } catch {}
}

export type OverrideDraft = {
  deposit_rate?: string;
  promo_rate: string;
  promo_months: string;
  floating_rate: string;
  note: string;
};
export function parseOverride(draft: OverrideDraft, now: number): RateOverride | string {
  const parse = (value: string) => (value.trim() ? Number(value.trim().replace(',', '.')) : null);
  const deposit_rate = parse(draft.deposit_rate ?? '');
  if (deposit_rate !== null && validDepositRate(deposit_rate) === null)
    return `Lãi gửi phải từ ${DEPOSIT_RATE_LIMITS.min} đến ${DEPOSIT_RATE_LIMITS.max}% hoặc để trống.`;
  const promo_rate = parse(draft.promo_rate);
  const floating_rate = parse(draft.floating_rate);
  if (
    (promo_rate !== null && validRate(promo_rate) === null) ||
    (floating_rate !== null && validRate(floating_rate) === null)
  )
    return `Lãi suất phải từ ${BANK_RATE_LIMITS.min} đến ${BANK_RATE_LIMITS.max}% hoặc để trống.`;
  const promo_months = parse(draft.promo_months);
  if (promo_months !== null && (!Number.isInteger(promo_months) || promo_months <= 0))
    return 'Số tháng ưu đãi phải là số nguyên dương hoặc để trống.';
  return {
    deposit_rate,
    promo_rate,
    floating_rate,
    promo_months,
    note: draft.note.trim(),
    at: new Date(now).toISOString(),
  };
}
