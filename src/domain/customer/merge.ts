import { normalizePhoneVN } from './phone';
import type { Customer } from './types';

function nameKey(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] ?? 0;
      row[j] = Math.min((row[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

export function similarCustomerNames(a: unknown, b: unknown): boolean {
  const left = nameKey(a);
  const right = nameKey(b);
  if (left.length < 4 || right.length < 4) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const distance = editDistance(left, right);
  return Math.max(left.length, right.length) - distance <= 2 && distance / Math.max(left.length, right.length) <= 0.22;
}

/** S17 candidates require both a normalized phone match and a near name match. */
export function findDuplicateCandidates<T extends Pick<Customer, 'id' | 'phone' | 'full_name'>>(
  rows: readonly T[],
  phone: unknown,
  fullName: unknown,
  excludedId?: string,
): T[] {
  const key = normalizePhoneVN(phone);
  if (!key || !nameKey(fullName)) return [];
  return rows.filter(
    (row) =>
      row.id !== excludedId && normalizePhoneVN(row.phone) === key && similarCustomerNames(row.full_name, fullName),
  );
}

export function detectDuplicatePairs<T extends Pick<Customer, 'id' | 'phone' | 'full_name'>>(
  rows: readonly T[],
): Array<[T, T]> {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizePhoneVN(row.phone);
    if (!key) continue;
    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  const pairs: Array<[T, T]> = [];
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const left = bucket[i];
        const right = bucket[j];
        if (!left || !right) continue;
        if (similarCustomerNames(left.full_name, right.full_name)) pairs.push([left, right]);
      }
    }
  }
  return pairs;
}

type Data = Record<string, unknown>;
const ARRAY_FIELDS = [
  'projects',
  'followers',
  'call_attempts',
  'calls',
  'interactions',
  'care_stage_history',
  'notes_manual',
  'next_tasks',
  'memory_facts',
  'interests',
  'household',
  'promises',
];

function joinUnknownArrays(primary: unknown, duplicate: unknown): unknown[] | undefined {
  if (!Array.isArray(primary) && !Array.isArray(duplicate)) return undefined;
  return [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(duplicate) ? duplicate : [])];
}

/** Merge loser into keeper without discarding unknown aggregate properties or provenance. */
export function buildCustomerMerge(keeper: Customer, duplicate: Customer, now = new Date().toISOString()) {
  if (keeper.id === duplicate.id) throw new Error('Không thể gộp cùng một hồ sơ.');
  const target = { ...(keeper as Data) };
  const source = Array.isArray(keeper.source) ? keeper.source : keeper.source ? [keeper.source] : [];
  const otherSource = Array.isArray(duplicate.source) ? duplicate.source : duplicate.source ? [duplicate.source] : [];
  target.source = [...new Set([...source, ...otherSource])];

  for (const key of ARRAY_FIELDS) {
    const joined = joinUnknownArrays((keeper as Data)[key], (duplicate as Data)[key]);
    if (joined) target[key] = joined;
  }

  // Fill genuinely empty scalar values from the duplicate while retaining keeper values.
  for (const [key, value] of Object.entries(duplicate as Data)) {
    if (key === 'id' || key === 'owner_id' || key === 'source' || ARRAY_FIELDS.includes(key)) continue;
    const current = target[key];
    const empty = current == null || current === '' || (Array.isArray(current) && current.length === 0);
    if (empty && value != null && value !== '') target[key] = value;
  }

  const keeperAdvanced = keeper.advanced && typeof keeper.advanced === 'object' ? keeper.advanced : {};
  const duplicateAdvanced = duplicate.advanced && typeof duplicate.advanced === 'object' ? duplicate.advanced : {};
  target.advanced = { ...duplicateAdvanced, ...keeperAdvanced };
  // Keep value provenance from both records when available, preferring keeper on conflicts.
  const keeperMeta = (keeper as Data).field_meta;
  const duplicateMeta = (duplicate as Data).field_meta;
  if ((keeperMeta && typeof keeperMeta === 'object') || (duplicateMeta && typeof duplicateMeta === 'object')) {
    target.field_meta = { ...(duplicateMeta as Data), ...(keeperMeta as Data) };
  }
  target.updated_at = now;

  const archived = { ...(duplicate as Data), archived_at: now, updated_at: now };
  return {
    keeper: target as unknown as Customer,
    duplicate: archived as unknown as Customer,
    keeperPatch: Object.fromEntries(
      Object.entries(target).filter(([key, value]) => JSON.stringify((keeper as Data)[key]) !== JSON.stringify(value)),
    ),
    duplicatePatch: { archived_at: now, updated_at: now },
  };
}
