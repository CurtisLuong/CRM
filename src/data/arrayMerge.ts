/**
 * Gộp cột mảng JSONB khi đẩy op `update` (D-021, T5.9).
 * Trước đây op ghi đè nguyên mảng (LWW theo cột) → máy offline xoá mất phần tử máy khác vừa thêm.
 * Giờ gộp 3 chiều theo danh tính phần tử (`id`, không có thì `at`):
 *   base   = mảng local NGAY TRƯỚC khi sửa (lưu trong op.arrayBase, chỉ ở máy, không gửi server)
 *   local  = mảng trong payload op
 *   server = mảng hiện tại trên server
 * Luật:
 *  - phần tử chỉ server có (không trong base) → máy khác thêm → GIỮ;
 *  - phần tử base có mà local bỏ → máy này cố ý bỏ (hoàn tác, mở lại việc, lùi bậc) → BỎ, không làm sống lại;
 *  - phần tử cả 3 cùng có → gộp theo thuộc tính: thuộc tính local đổi so với base lấy bản local
 *    (kể cả xoá thuộc tính), còn lại lấy bản server (giữ sửa của máy khác + thuộc tính lạ — D-012 §3.1.3);
 *  - phần tử base + local có mà server đã bỏ → local không đổi thì bỏ theo server, local có sửa thì giữ local;
 *  - op không có base (op do v1 ghi, op cũ trước T5.9) → không biết local bỏ gì → hợp nhất (union), không bỏ phần tử nào.
 */

/** Cột mảng phần tử object có danh tính. Cột mảng chuỗi (`source`, `projects`, `followers`) vẫn ghi đè như cũ. */
export const ARRAY_COLUMNS = [
  'call_attempts',
  'next_tasks',
  'notes_manual',
  'care_stage_history',
  'interactions',
  'interests',
  'household',
] as const;
export type ArrayColumn = (typeof ARRAY_COLUMNS)[number];
export type ArrayBase = Partial<Record<ArrayColumn, unknown[]>>;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function identity(el: unknown): string {
  if (isObj(el)) {
    if (el.id != null && el.id !== '') return `id:${String(el.id)}`;
    if (el.at != null && el.at !== '') return `at:${String(el.at)}`;
  }
  return `json:${JSON.stringify(el)}`;
}

/** Khoá duy nhất trong 1 mảng: danh tính + thứ tự xuất hiện (phòng 2 phần tử trùng `at`). */
function keyed(list: unknown[]): Map<string, unknown> {
  const seen = new Map<string, number>();
  const out = new Map<string, unknown>();
  for (const el of list) {
    const id = identity(el);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    out.set(`${id}#${n}`, el);
  }
  return out;
}

/** Gộp 1 phần tử có ở cả local và server. */
function mergeElement(base: unknown, local: unknown, server: unknown, hasBase: boolean): unknown {
  if (!isObj(local) || !isObj(server)) return local;
  if (!hasBase || !isObj(base)) return { ...server, ...local };
  const out: Obj = {};
  const keys = new Set([...Object.keys(server), ...Object.keys(local), ...Object.keys(base)]);
  for (const k of keys) {
    const inLocal = Object.hasOwn(local, k);
    const changed = inLocal !== Object.hasOwn(base, k) || (inLocal && !same(local[k], base[k]));
    const src = changed ? local : server;
    if (Object.hasOwn(src, k)) out[k] = src[k];
  }
  return out;
}

/** Gộp 1 cột mảng. `base` undefined = không biết bản gốc (op v1 / op cũ) → hợp nhất, không bỏ phần tử nào. */
export function mergeArray(base: unknown[] | undefined, local: unknown[], server: unknown): unknown[] {
  const hasBase = Array.isArray(base);
  const b = keyed(hasBase ? base : []);
  const l = keyed(local);
  const s = keyed(asArray(server));
  const result: { key: string; value: unknown }[] = [];
  for (const [key, value] of l) {
    if (s.has(key)) result.push({ key, value: mergeElement(b.get(key), value, s.get(key), b.has(key)) });
    else if (b.has(key)) {
      // Server đã bỏ phần tử này (máy khác xoá): chỉ giữ nếu máy này có sửa nó.
      if (!same(value, b.get(key))) result.push({ key, value });
    } else result.push({ key, value });
  }
  // Phần tử chỉ server có (máy khác thêm). Mảng đang xếp theo `at` (ghi chú mới lên đầu, việc/cuộc gọi/lịch sử
  // nối cuối) → chèn đúng chỗ theo `at`; không thì chèn ngay sau phần tử đứng trước nó trên server.
  const order = sortOrder(result.map((r) => r.value));
  let anchor = -1;
  for (const [key, value] of s) {
    const at = result.findIndex((r) => r.key === key);
    if (at >= 0) {
      anchor = at;
      continue;
    }
    if (l.has(key) || b.has(key)) continue; // local đã cố ý bỏ
    const stamp = atOf(value);
    let index = anchor + 1;
    if (order && stamp != null) {
      index = result.findIndex((r) => {
        const other = atOf(r.value);
        return other != null && (order === 'asc' ? other > stamp : other < stamp);
      });
      if (index < 0) index = result.length;
    }
    result.splice(index, 0, { key, value });
    anchor = index;
  }
  return result.map((r) => r.value);
}

const atOf = (el: unknown) => (isObj(el) && typeof el.at === 'string' && el.at ? el.at : null);

/** Thứ tự của mảng theo `at`: 'asc' / 'desc' nếu mọi phần tử có `at` và đơn điệu; null nếu không rõ. */
function sortOrder(list: unknown[]): 'asc' | 'desc' | null {
  const stamps = list.map(atOf);
  if (stamps.some((x) => x == null)) return null;
  let asc = true;
  let desc = true;
  for (let i = 1; i < stamps.length; i++) {
    if ((stamps[i] as string) < (stamps[i - 1] as string)) asc = false;
    if ((stamps[i] as string) > (stamps[i - 1] as string)) desc = false;
  }
  if (stamps.length < 2) return null;
  return asc && !desc ? 'asc' : desc && !asc ? 'desc' : null;
}

/** Cột mảng trong payload cần gộp. */
export function arrayColumnsOf(payload: Record<string, unknown> | undefined): ArrayColumn[] {
  if (!payload) return [];
  return ARRAY_COLUMNS.filter((c) => Object.hasOwn(payload, c) && Array.isArray(payload[c]));
}

/** Payload sau khi gộp các cột mảng với hàng server. Cột khác giữ nguyên (patch theo trường như cũ). */
export function mergePayload(
  payload: Record<string, unknown>,
  base: ArrayBase | undefined,
  serverRow: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...payload };
  for (const col of arrayColumnsOf(payload)) {
    const colBase = base && Object.hasOwn(base, col) ? base[col] : undefined;
    out[col] = mergeArray(colBase, payload[col] as unknown[], serverRow[col]);
  }
  return out;
}

/** Bản gốc mảng (giá trị local trước khi sửa) cho các cột mảng có trong payload. */
export function captureArrayBase(
  existing: Record<string, unknown> | undefined,
  payload: Record<string, unknown> | undefined,
): ArrayBase | undefined {
  const cols = arrayColumnsOf(payload);
  if (!existing || !cols.length) return undefined;
  const base: ArrayBase = {};
  for (const col of cols) base[col] = asArray(existing[col]);
  return base;
}
