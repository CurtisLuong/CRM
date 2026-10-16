/**
 * Đọc bản ghi khách: parse (không biến đổi) + getter chuẩn hoá. Port 1-1 hành vi v1 (legacy/js/app.js,
 * legacy/js/lunar.js). Getter KHÔNG sửa bản ghi — dữ liệu lưu giữ nguyên (D-012).
 */
import { SOURCE_LEGACY } from '@/config/sources';
import { CARE_STAGE_LEGACY, CARE_STAGES } from '@/config/stages';
import { CustomerSchema } from './schema';
import type { Customer, DatedCallAttempt, Dob, LeadStatus, Task } from './types';

/** Parse 1 hàng (DB / IndexedDB / hàng đợi). Ném lỗi nếu thiếu trường bắt buộc. Không đổi dữ liệu. */
export function parseCustomer(raw: unknown): Customer {
  return CustomerSchema.parse(raw);
}

/** Như parseCustomer nhưng không ném: trả { success, data | error }. */
export function safeParseCustomer(raw: unknown) {
  return CustomerSchema.safeParse(raw);
}

/** Bản ghi → object thuần để lưu (IndexedDB / Supabase). serialize(parse(x)) deepEqual x. */
export function serializeCustomer(c: Customer): Record<string, unknown> {
  return { ...c };
}

/** Bậc cũ đã gộp → bậc mới ('Hỗ trợ hồ sơ', 'Booking' → 'Booking & Làm hồ sơ'). */
export function normStage(s: string | null | undefined): string | null | undefined {
  return (s && CARE_STAGE_LEGACY[s]) || s;
}

/** source (chuỗi cũ | mảng | null) → mảng mã kênh, đổi mã cũ, không trùng. */
export function sourceListOf(source: unknown): string[] {
  const raw: unknown[] = Array.isArray(source) ? source : typeof source === 'string' && source ? [source] : [];
  const out: string[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'string') continue;
    const code = SOURCE_LEGACY[s] || s;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** Lớp 2 "Chăm sóc" = đã có qualified_at (D-001). */
export function isQualified(c: Customer | null | undefined): boolean {
  return !!c?.qualified_at;
}

/** Khách lớp 2 đang trong phễu chính (không Nuôi dài hạn / Đã mua / Loại). */
export function inFunnel(c: Customer | null | undefined): boolean {
  return !!c && (CARE_STAGES as readonly string[]).includes(normStage(c.care_stage) ?? '');
}

/** Nhật ký gọi hợp lệ (có `at`), cũ → mới. Bỏ phần tử null / thiếu at. */
export function callAttemptsOf(c: Customer | null | undefined): DatedCallAttempt[] {
  const list = Array.isArray(c?.call_attempts) ? c.call_attempts : [];
  return list.filter((a): a is DatedCallAttempt => !!a?.at).sort((a, b) => a.at.localeCompare(b.at));
}

/** Khách mới: 'dropped' đã loại · 'calling' đã gọi ≥1 lần · 'new' chưa gọi. */
export function leadStatus(c: Customer): LeadStatus {
  if (c.disqualified_at) return 'dropped';
  return callAttemptsOf(c).length ? 'calling' : 'new';
}

/** Việc chưa xong (bỏ phần tử null). Giữ thứ tự lưu. */
export function openTasksOf(c: Customer): Task[] {
  return (Array.isArray(c.next_tasks) ? c.next_tasks : []).filter((t): t is Task => !!t && !t.done_at);
}

/** Ngày sinh 'YYYY-MM-DD' hoặc '--MM-DD' → {day, month, year|null}; sai định dạng → null. */
export function parseDob(dob: unknown): Dob | null {
  if (!dob || typeof dob !== 'string') return null;
  let year: number | null = null;
  let month: number;
  let day: number;
  if (dob.slice(0, 2) === '--') {
    const p = dob.slice(2).split('-');
    month = Number(p[0]);
    day = Number(p[1]);
  } else {
    const p = dob.split('-');
    if (p.length !== 3) return null;
    year = Number(p[0]) || null;
    month = Number(p[1]);
    day = Number(p[2]);
  }
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  return { day, month, year };
}
