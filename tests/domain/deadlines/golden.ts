/// <reference types="node" />
// Hỗ trợ test so golden T0.4 (tests/golden/*.json, sinh từ code v1 thật bởi tests/legacy-harness).
// Múi giờ cố định như harness: logic hạn/khung giờ dùng giờ địa phương.
process.env.TZ = 'Asia/Ho_Chi_Minh';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARE_STAGE_LEGACY } from '@/config/stages';
import type { Customer } from '@/domain/customer';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export type Fixture = {
  now: string;
  users: { me: string; colleague: string };
  customers: (Record<string, unknown> & { _case?: string })[];
};
export const fixture = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'fixtures', 'legacy-customers.json'), 'utf8'),
) as Fixture;

export function golden<T = unknown>(name: string): T {
  return (JSON.parse(fs.readFileSync(path.join(ROOT, 'golden', `${name}.json`), 'utf8')) as { result: T }).result;
}

/** Khách như v1 nạp (refreshList): bỏ `_case`, đổi bậc cũ sang bậc mới trong bộ nhớ. */
export function loadCustomers(): Customer[] {
  return fixture.customers.map((raw) => {
    const { _case, ...c } = structuredClone(raw);
    const stage = c.care_stage as string | undefined;
    if (stage && CARE_STAGE_LEGACY[stage]) c.care_stage = CARE_STAGE_LEGACY[stage];
    return c as unknown as Customer;
  });
}
export const caseLabels = (): Record<string, string | undefined> =>
  Object.fromEntries(fixture.customers.map((c) => [c.id as string, c._case]));

/** Cùng chuẩn hoá JSON với tests/legacy-harness/run.js: Date → ISO, NaN → "NaN", bỏ undefined/hàm. */
export function canon(v: unknown): unknown {
  if (v === undefined || typeof v === 'function') return undefined;
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
  if (Array.isArray(v)) return v.map((x) => canon(x) ?? null);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object).sort()) {
    const c = canon((v as Record<string, unknown>)[k]);
    if (c !== undefined) out[k] = c;
  }
  return out;
}
