import { BANK_RATE_LIMITS, BANKS, type BankCode } from '@/config/banks';
import { fmtClock, startOfDayMs } from '@/domain/deadlines';

export type BankRate = {
  bank_code: string;
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

export function rateFor(rate: BankRate | undefined, override: RateOverride | null | undefined) {
  return {
    promo_rate: validRate(override?.promo_rate) ?? validRate(rate?.promo_rate),
    floating_rate: validRate(override?.floating_rate) ?? validRate(rate?.floating_rate),
    promo_months: override?.promo_months ?? rate?.promo_months,
    note: override?.note || rate?.note,
  };
}

export function big4Average(rates: BankRate[], overrides: Overrides) {
  const rows = BANKS.filter((bank) => bank.big4).map((bank) =>
    rateFor(
      rates.find((rate) => rate.bank_code === bank.code),
      overrides[bank.code],
    ),
  );
  const mean = (field: 'promo_rate' | 'floating_rate') => {
    const values = rows.map((row) => row[field]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  return { promo: mean('promo_rate'), floating: mean('floating_rate') };
}

export function formatRate(value: number | null) {
  return value === null
    ? '—'
    : `${value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function fetchedLabel(value: string | null | undefined, now: number, stale = false) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const day = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (startOfDayMs(ms) === startOfDayMs(now)) return stale ? '' : `≈ cập nhật ${fmtClock(ms)}`;
  return stale ? `Chưa lấy được hôm nay · số ${day}` : `≈ cập nhật ${day}`;
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

export type OverrideDraft = { promo_rate: string; promo_months: string; floating_rate: string; note: string };
export function parseOverride(draft: OverrideDraft, now: number): RateOverride | string {
  const parse = (value: string) => (value.trim() ? Number(value.trim().replace(',', '.')) : null);
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
  return { promo_rate, floating_rate, promo_months, note: draft.note.trim(), at: new Date(now).toISOString() };
}
