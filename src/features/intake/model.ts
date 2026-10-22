import { ADVANCED_FIELDS } from '@/config/advanced';
import { SOURCE_DEFAULT, SOURCES } from '@/config/sources';
import { CARE_STAGE_BRANCH, CARE_STAGE_DEFAULT, INTEREST_DEFAULT_NEW, QUALIFIED_STAGE } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { sourceListOf } from '@/domain/customer';
import { canonicalAptType } from '@/domain/customer/aptType';
import { normalizePhoneVN } from '@/domain/customer/phone';
import { calcCungFromDOB, calcMenhFromSolarDOB } from '@/domain/lunar/lunar';
import type { IntakeValues, ParsedIntake } from './schema';

export function lastUsedSource(rows: readonly Customer[]): string {
  const latest = [...rows].sort((a, b) =>
    String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')),
  );
  const code = latest.flatMap((customer) => sourceListOf(customer.source))[0];
  return code && SOURCES[code] ? code : SOURCE_DEFAULT;
}

/**
 * Nhãn ô Tiến độ: Nuôi dài hạn là nhánh của Đang chăm sóc (Curtis 2026-10-22) — thêm dấu nhánh và
 * lời giải thích CARE_STAGE_BRANCH. Giá trị lưu (care_stage) vẫn là tên bậc, không đổi.
 */
export function stageOptionLabel(stage: string): string {
  const branch = CARE_STAGE_BRANCH[stage];
  return branch ? `↳ ${stage} · ${branch.hint}` : stage;
}

export function defaultIntakeValues(source = SOURCE_DEFAULT): IntakeValues {
  return {
    full_name: '',
    phone: '',
    gender: '',
    dob: '',
    marital_status: '',
    occupation: '',
    income: '',
    residence: '',
    registered_at: '',
    source_channel: source,
    campaign: '',
    apt_type: '',
    projects: [],
    apt_code: '',
    building_code: '',
    apt_area: '',
    apt_direction: '',
    apt_floor: '',
    apt_price: '',
    finance: '',
    purpose: '',
    interest_level: INTEREST_DEFAULT_NEW,
    care_stage: CARE_STAGE_DEFAULT,
    care_stage_note: '',
    contact_status: '',
    qualify_now: false,
    notes: '',
    advanced: {},
  };
}

export function normalizedPhone(value: string): string {
  return normalizePhoneVN(value);
}

// Dời sang src/domain/customer/aptType.ts (Worker Meta Lead Ads dùng chung) — giữ tên export cho màn nhập.
export { canonicalAptType };

export function findPhoneMatches(rows: readonly Customer[], phone: string, editingId?: string): Customer[] {
  const key = normalizedPhone(phone);
  if (!key) return [];
  return rows.filter((row) => row.id !== editingId && normalizedPhone(row.phone) === key);
}

/** Builds only fields owned by the form and leaves aggregate history/unknown JSONB untouched. */
export function toCustomerPayload(value: ParsedIntake, existing?: Customer, dob = value.dob): Record<string, unknown> {
  const phone = normalizedPhone(value.phone);
  const payload: Record<string, unknown> = {
    phone,
    full_name: value.full_name,
    gender: value.gender || null,
    dob: dob || null,
    menh: dob ? calcMenhFromSolarDOB(dob) || null : null,
    cung: dob ? calcCungFromDOB(dob) || null : null,
    marital_status: value.marital_status || null,
    occupation: value.occupation || null,
    income: value.income || null,
    residence: value.residence || null,
    registered_at: value.registered_at ? new Date(value.registered_at).toISOString() : null,
    apt_type: canonicalAptType(value.apt_type) || null,
    projects: value.projects,
    apt_code: value.apt_code || null,
    building_code: value.building_code || null,
    apt_area: value.apt_area,
    apt_direction: value.apt_direction || null,
    apt_floor: value.apt_floor,
    apt_price: value.apt_price,
    finance: value.finance,
    purpose: value.purpose || null,
    campaign: value.campaign || null,
    interest_level: value.qualify_now ? Math.max(60, Number(value.interest_level)) : Number(value.interest_level),
    advanced: mergeAdvanced(existing?.advanced ?? {}, value.advanced),
  };
  if (!existing) {
    payload.care_stage = value.qualify_now ? QUALIFIED_STAGE : CARE_STAGE_DEFAULT;
    if (value.qualify_now) {
      const now = new Date().toISOString();
      payload.qualified_at = now;
      payload.call_attempts = [{ at: now, result: 'talked', note: 'Xác nhận quan tâm lúc nhập khách' }];
    }
  } else if (existing.qualified_at) {
    payload.care_stage = value.care_stage || CARE_STAGE_DEFAULT;
    payload.contact_status = value.contact_status || null;
  }
  const channel = value.source_channel || SOURCE_DEFAULT;
  const existingSources = sourceListOf(existing?.source);
  if (!existing || existingSources[0] !== channel)
    payload.source = [channel, ...existingSources.filter((x) => x !== channel)];
  if (!existing) payload.intake_method = 'manual';
  if (value.notes.trim() || (existing && (existing.notes || null) !== null)) payload.notes = value.notes.trim() || null;
  if (existing && !existing.qualified_at) delete payload.interest_level;
  return payload;
}

export function mergeOcrValues(current: IntakeValues, extracted: Record<string, unknown>): IntakeValues {
  const allowed = [
    'full_name',
    'phone',
    'gender',
    'dob',
    'marital_status',
    'occupation',
    'income',
    'residence',
    'apt_type',
    'apt_area',
    'apt_code',
    'building_code',
    'apt_price',
    'interest_level',
  ] as const;
  const next = { ...current };
  for (const field of allowed) {
    const candidate = extracted[field];
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      (next as Record<string, unknown>)[field] = candidate;
    }
  }
  if (Array.isArray(extracted.projects))
    next.projects = extracted.projects.filter((x): x is string => typeof x === 'string');
  return next;
}

export function addOcrNote(notes: readonly Record<string, unknown>[], text: unknown, at = new Date().toISOString()) {
  const value = typeof text === 'string' ? text.trim() : '';
  return value ? [{ at, text: value }, ...notes] : [...notes];
}

function mergeAdvanced(existing: Record<string, unknown>, draft: Record<string, unknown>) {
  const known = new Set(ADVANCED_FIELDS.map((field) => field.key));
  const result = Object.fromEntries(Object.entries(existing).filter(([key]) => !known.has(key)));
  for (const [key, value] of Object.entries(draft)) {
    if (!known.has(key)) result[key] = value;
  }
  for (const field of ADVANCED_FIELDS) {
    const value = draft[field.key];
    if (value !== undefined && value !== null && value !== '') result[field.key] = value;
  }
  return result;
}
