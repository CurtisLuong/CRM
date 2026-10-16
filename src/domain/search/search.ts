/**
 * Tìm kiếm cục bộ dùng chung cho khách và giỏ hàng — port 1:1 từ legacy/js/search.js (CRMSearch).
 * Chuẩn hoá bỏ dấu, nhiều từ = AND, "cụm trong ngoặc kép", gần đúng 1 lỗi cho TÊN (không gần đúng SĐT),
 * highlight giữ nguyên chữ gốc. Không mạng, không giao diện.
 */

export type SearchScope = 'all' | 'name' | 'phone' | 'unit' | 'year' | 'property' | 'notes';

export interface SearchTerm {
  text: string;
  phrase: boolean;
}

export interface SearchQuery {
  raw: string;
  text: string;
  scope: SearchScope;
  numeric: boolean;
  digits: string;
  phoneOnly: boolean;
  terms: SearchTerm[];
  active: boolean;
}

export interface SearchField {
  label: string;
  value: string;
  norm: string;
  weight: number;
}

export interface SearchDoc {
  fields: SearchField[];
  name: string;
  nameWords: string[];
  phone: string;
}

export interface SearchMatch {
  match: boolean;
  score: number;
  fuzzy: boolean;
  highlights: string[];
}

export const normalize = (v: unknown): string =>
  String(v == null ? '' : v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

export const aliases = (v: unknown): string =>
  normalize(v)
    .replace(/(\d)[.,](?=\d)/g, '$1.')
    .replace(/(\d+)\s*(?:phong ngu|pn|br)\b/g, '$1n')
    .replace(/(\d+n\+?)\s*[,/-]\s*(\d+wc)\b/g, '$1-$2');

/** Gom biến thể (2N+, căn góc, số WC bất kỳ) theo số phòng ngủ. */
export function apartmentGroup(value: unknown): string {
  const text = aliases(value);
  if (!text) return '';
  if (text === 'studio') return 'Studio';
  const rooms = text.match(/^(\d+)n(?=$|[^a-z])/);
  return rooms ? `${Number(rooms[1])}N` : 'other';
}

/** SĐT cho tìm kiếm: chỉ chữ số; 0084…/+84…/84…(11+ số) → 0…. */
export function phone(v: unknown): string {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('0084')) d = `0${d.slice(4)}`;
  else if (d.startsWith('84') && (d.length >= 11 || /^\s*\+84/.test(String(v)))) d = `0${d.slice(2)}`;
  return d;
}

export const phoneMatch = (p: string, q: string): boolean =>
  !!p && !!q && (p.startsWith(q) || (q.length >= 3 && p.includes(q)));

export function compile(raw: unknown, scope: SearchScope = 'all'): SearchQuery {
  const text = aliases(raw);
  const numeric = /^[\d\s+().,/-]+$/.test(text);
  const digits = phone(raw);
  const phoneOnly =
    scope === 'phone' ||
    (scope === 'all' &&
      numeric &&
      (/^0\d{9}$/.test(digits) || (/^\+?84/.test(text) && digits.startsWith('0')) || digits.length < 3));
  const terms = [...text.matchAll(/"([^"]+)"|([^\s"]+)/g)].map((m) => ({
    text: (m[1] || m[2]) as string,
    phrase: !!m[1],
  }));
  return { raw: String(raw || '').trim(), text, scope, numeric, digits, phoneOnly, terms, active: !!terms.length };
}

const groups: Record<string, string[]> = {
  name: ['Tên'],
  phone: ['SĐT'],
  unit: ['Mã căn', 'Mã toà'],
  year: ['Ngày sinh'],
  property: ['Dự án', 'Loại căn', 'Mã căn', 'Mã toà', 'Diện tích', 'Giá căn', 'Hướng', 'Tầng'],
  notes: ['Ghi chú', 'Lịch sử chăm sóc', 'Cuộc gọi', 'Thông tin đăng ký', 'Việc tiếp theo', 'Lý do loại'],
};
const PROPERTY = groups.property as string[];
const NOTES = groups.notes as string[];

function weight(label: string): number {
  return label === 'Tên'
    ? 100
    : label === 'SĐT'
      ? 120
      : PROPERTY.includes(label)
        ? 45
        : NOTES.includes(label)
          ? 10
          : 20;
}

/** Chuẩn bị tài liệu tìm kiếm từ danh sách [nhãn, giá trị]. */
export function prepare(fields: ReadonlyArray<readonly [string, unknown]>): SearchDoc {
  const list = fields.map(([label, value]) => ({
    label,
    value: String(value).normalize('NFC'),
    norm: aliases(value),
    weight: weight(label),
  }));
  const name = list.find((f) => f.label === 'Tên')?.norm || '';
  return {
    fields: list,
    name,
    nameWords: name.split(/[^a-z]+/).filter(Boolean),
    phone: phone(list.find((f) => f.label === 'SĐT')?.value),
  };
}

/** Khoảng cách Damerau hạn chế <= 1, gồm 1 lần đổi chỗ 2 ký tự liền nhau. */
export function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const bad: number[] = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) bad.push(i);
    const [x, y] = bad as [number, number];
    return bad.length === 1 || (bad.length === 2 && y === x + 1 && a[x] === b[y] && a[y] === b[x]);
  }
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else {
      j++;
      if (++edits > 1) return false;
    }
  }
  return true;
}

export function match(doc: SearchDoc, ctx: SearchQuery): SearchMatch {
  if (!ctx.active) return { match: true, score: 0, fuzzy: false, highlights: [] };
  if (ctx.phoneOnly) {
    const ok = phoneMatch(doc.phone, ctx.digits);
    return {
      match: ok,
      score: ok ? (doc.phone === ctx.digits ? 2000 : doc.phone.startsWith(ctx.digits) ? 800 : 600) : 0,
      fuzzy: false,
      highlights: [ctx.digits],
    };
  }
  const fields =
    ctx.scope === 'all' ? doc.fields : doc.fields.filter((f) => (groups[ctx.scope] || []).includes(f.label));
  let score = 0;
  let fuzzy = false;
  const highlights: string[] = [];
  for (const term of ctx.terms) {
    let best = 0;
    for (const f of fields) {
      if (f.label === 'SĐT' && /^\d+$/.test(term.text) && !phoneMatch(doc.phone, term.text)) continue;
      if (f.norm.includes(term.text))
        best = Math.max(best, f.weight + (f.norm === term.text ? 30 : f.norm.startsWith(term.text) ? 10 : 0));
    }
    if (best) {
      score += best;
      highlights.push(term.text);
      continue;
    }
    const canFuzzy =
      !term.phrase && /^(?:[a-z]{4,12})$/.test(term.text) && (ctx.scope === 'all' || ctx.scope === 'name');
    const corrected = canFuzzy && doc.nameWords.find((word) => oneEdit(term.text, word));
    if (!corrected) return { match: false, score: 0, fuzzy: false, highlights: [] };
    fuzzy = true;
    score += 5;
    highlights.push(corrected);
  }
  if (doc.name === ctx.text) score += 1000;
  else if (ctx.terms.length && ctx.terms.every((t) => doc.name.includes(t.text))) score += 200;
  if (ctx.numeric && doc.phone === ctx.digits) score += 2000;
  return { match: true, score, fuzzy, highlights };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => ESC[c] as string);
}

// NFC giữ mỗi chữ tiếng Việt thành 1 ký tự. Ánh xạ vị trí trong chuỗi chuẩn hoá về ký tự gốc;
// gộp khoảng trắng đúng như normalize() để vẫn hiển thị chữ gốc.
function mapped(text: unknown) {
  const original = String(text || '').normalize('NFC');
  let norm = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const c = original[i] as string;
    const n = normalize(c);
    if (/\s/.test(c)) {
      if (norm && !norm.endsWith(' ')) {
        norm += ' ';
        starts.push(i);
        ends.push(i + 1);
      } else if (norm.endsWith(' ')) ends[ends.length - 1] = i + 1;
    } else
      for (const ch of n) {
        norm += ch;
        starts.push(i);
        ends.push(i + 1);
      }
  }
  return { original, norm, starts, ends };
}

/** HTML đã escape, phần khớp bọc `<mark>`; `maxLen` > 0 → cắt đoạn quanh chỗ khớp đầu tiên, thêm "…". */
export function highlight(text: unknown, terms: unknown, maxLen = 0): string {
  const { original, norm: mappedNorm, starts, ends } = mapped(text);
  const norm = mappedNorm.replace(/(\d)[.,](?=\d)/g, '$1.');
  const ranges: [number, number][] = [];
  for (const raw of Array.isArray(terms) ? terms : [terms]) {
    const q = normalize(raw).replace(/(\d)[.,](?=\d)/g, '$1.');
    if (!q) continue;
    for (let i = norm.indexOf(q); i >= 0; i = norm.indexOf(q, i + q.length))
      ranges.push([starts[i] as number, ends[i + q.length - 1] as number]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  let start = 0;
  let end = original.length;
  const first = merged[0];
  if (maxLen && first && end > maxLen) {
    start = Math.max(0, first[0] - Math.floor(maxLen / 3));
    end = Math.min(end, start + maxLen);
    start = Math.max(0, end - maxLen);
  }
  let out = start ? '…' : '';
  let pos = start;
  for (const [a, b] of merged) {
    if (b <= start || a >= end) continue;
    const lo = Math.max(a, start);
    const hi = Math.min(b, end);
    out += `${escapeHtml(original.slice(pos, lo))}<mark>${escapeHtml(original.slice(lo, hi))}</mark>`;
    pos = hi;
  }
  return out + escapeHtml(original.slice(pos, end)) + (end < original.length ? '…' : '');
}

/** Lọc khoảng số: không đặt min/max → luôn đúng; có đặt mà giá trị trống/không phải số → sai. */
export function range(value: unknown, min?: number | null, max?: number | null): boolean {
  if (min == null && max == null) return true;
  if (value == null || value === '' || !Number.isFinite(Number(value))) return false;
  return (min == null || Number(value) >= min) && (max == null || Number(value) <= max);
}
