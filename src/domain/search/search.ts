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

/**
 * Luật dấu (PF-05): ký tự KHÔNG dấu khớp mọi biến thể có dấu của cùng chữ gốc (a ↔ á/ă/â…, d ↔ đ,
 * u ↔ ư…); ký tự CÓ dấu chỉ khớp đúng ký tự đó. Mọi so sánh chạy trên NFC đã lower-case.
 */
const plainChar = (c: string): string => (/\s/.test(c) ? ' ' : normalize(c));

interface Folded {
  text: string;
  /** `accented[i]` = ký tự gốc ở vị trí i có dấu (kể cả đ) → phải khớp đúng. */
  accented: boolean[];
}

/** Lower-case + NFC, gộp khoảng trắng; giữ nguyên dấu (khác `normalize`) và cờ dấu từng ký tự. */
function foldChars(v: unknown): Folded {
  const s = String(v == null ? '' : v)
    .toLowerCase()
    .normalize('NFC');
  let text = '';
  const accented: boolean[] = [];
  for (const c of s) {
    if (/\s/.test(c)) {
      if (!text || text.endsWith(' ')) continue;
      text += ' ';
      accented.push(false);
      continue;
    }
    const n = normalize(c);
    if (!n) continue;
    // Giữ chữ gốc đã lower-case (có dấu) — deaccent() mới là bản bỏ dấu.
    text += c;
    accented.push(n !== c);
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    accented.pop();
  }
  return { text, accented };
}

/** Chuỗi không dấu (giữ khoảng trắng) — cùng luật với `normalize` nhưng không trim/gộp. */
const deaccent = (text: string): string => {
  let out = '';
  for (const c of text) out += /\s/.test(c) ? ' ' : normalize(c);
  return out;
};

/** Thay thế theo regex trên bản bỏ dấu nhưng giữ dấu ở kết quả (độ dài luôn 1:1). */
function replaceFolded(folded: Folded, re: RegExp, repl: (m: RegExpExecArray) => string): Folded {
  const text = folded.text;
  const plain = deaccent(text);
  let out = '';
  const accented: boolean[] = [];
  let last = 0;
  for (const m of plain.matchAll(re)) {
    const start = m.index as number;
    const end = start + m[0].length;
    out += text.slice(last, start);
    for (let k = last; k < start; k++) accented.push(folded.accented[k] as boolean);
    const rep = repl(m);
    out += rep;
    for (let k = 0; k < rep.length; k++) accented.push(false);
    last = end;
  }
  out += text.slice(last);
  for (let k = last; k < text.length; k++) accented.push(folded.accented[k] as boolean);
  return { text: out, accented };
}

/**
 * Như `aliases` nhưng giữ dấu để biết ký tự nào phải khớp đúng.
 * Bất biến: `deaccent(text)` luôn bằng `aliases(raw)`.
 */
function aliasMarked(raw: unknown): Folded {
  const folded = foldChars(raw);
  const chars = [...folded.text];
  // Dấu thập phân 53,6 → 53.6 (số không dấu)
  for (let i = 1; i < chars.length - 1; i++) {
    const c = chars[i] as string;
    if ((c === '.' || c === ',') && /\d/.test(chars[i - 1] as string) && /\d/.test(chars[i + 1] as string))
      chars[i] = '.';
  }
  // Bí danh căn giống `aliases`: 2 phòng ngủ / 2PN / 2BR → 2N; 2N+, 2WC → 2N-2WC
  const rooms = replaceFolded(
    { text: chars.join(''), accented: folded.accented },
    /(\d+)\s*(?:phong ngu|pn|br)\b/g,
    (m) => `${m[1]}n`,
  );
  return replaceFolded(rooms, /(\d+n\+?)\s*[,/-]\s*(\d+wc)\b/g, (m) => `${m[1]}-${m[2]}`);
}

/** Từ khoá có dấu → phần tử khác null là chữ có dấu phải khớp đúng (cùng độ dài với `term.text`). */
const termStrict = new WeakMap<SearchQuery, (string | null)[]>();
/** Bản giữ dấu + bản bỏ dấu (cùng độ dài) của từng field, tính một lần cho mỗi field. */
const fieldFold = new WeakMap<SearchField, { text: string; plain: string }>();

const fieldText = (f: SearchField) => {
  let folded = fieldFold.get(f);
  if (!folded) {
    const text = foldChars(f.value).text;
    folded = { text, plain: deaccent(text) };
    fieldFold.set(f, folded);
  }
  return folded;
};

/** Tìm `term` trong field theo luật dấu; `exact` là bản giữ dấu cùng độ dài với bản bỏ dấu `q`. */
function accentHit(f: SearchField, q: string, exact: string): boolean {
  const { text, plain } = fieldText(f);
  const n = q.length;
  const strict: boolean[] = [];
  for (let j = 0; j < n; j++) strict.push(plainChar(exact[j] as string) !== exact[j]);
  for (let i = 0; i + n <= text.length; i++) {
    let ok = true;
    for (let j = 0; j < n && ok; j++)
      // Có dấu → đúng ký tự đó; không dấu → so bản bỏ dấu (đã tính sẵn), nhanh cho vài nghìn hồ sơ.
      ok = strict[j] ? text[i + j] === exact[j] : plain[i + j] === (q[j] as string);
    if (ok) return true;
  }
  return false;
}

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
  const marked = aliasMarked(raw);
  // Giữ dấu từng ký tự của từ khoá; lệch bất thường → coi như không dấu (giữ hành vi cũ).
  const positions = new Map<SearchTerm, number>();
  if (deaccent(marked.text) === text) {
    let at = 0;
    for (const term of terms) {
      const i = text.indexOf(term.text, at);
      if (i < 0) continue;
      at = i + term.text.length;
      positions.set(term, i);
    }
  }
  const query: SearchQuery = {
    raw: String(raw || '').trim(),
    text,
    scope,
    numeric,
    digits,
    phoneOnly,
    terms,
    active: !!terms.length,
  };
  termStrict.set(
    query,
    terms.map((term) => {
      const i = positions.get(term);
      if (i == null) return null;
      const slice = marked.text.slice(i, i + term.text.length);
      const flags = marked.accented.slice(i, i + term.text.length);
      return flags.some(Boolean) ? slice : null;
    }),
  );
  return query;
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
  const strictTerms = termStrict.get(ctx);
  for (let ti = 0; ti < ctx.terms.length; ti++) {
    const term = ctx.terms[ti] as SearchTerm;
    const strict = strictTerms?.[ti] ?? null;
    let best = 0;
    for (const f of fields) {
      if (f.label === 'SĐT' && /^\d+$/.test(term.text) && !phoneMatch(doc.phone, term.text)) continue;
      if (!f.norm.includes(term.text)) continue;
      if (strict && !accentHit(f, term.text, strict)) continue;
      best = Math.max(best, f.weight + (f.norm === term.text ? 30 : f.norm.startsWith(term.text) ? 10 : 0));
    }
    if (best) {
      score += best;
      highlights.push(term.text);
      continue;
    }
    const canFuzzy =
      !term.phrase && !strict && /^(?:[a-z]{4,12})$/.test(term.text) && (ctx.scope === 'all' || ctx.scope === 'name');
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
// gộp khoảng trắng đúng như normalize() để vẫn hiển thị chữ gốc. `fold` giữ dấu, cùng độ dài `norm`.
function mapped(text: unknown) {
  const original = String(text || '').normalize('NFC');
  let norm = '';
  let fold = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const c = original[i] as string;
    const n = normalize(c);
    const f = c.toLowerCase();
    if (/\s/.test(c)) {
      if (norm && !norm.endsWith(' ')) {
        norm += ' ';
        fold += ' ';
        starts.push(i);
        ends.push(i + 1);
      } else if (norm.endsWith(' ')) ends[ends.length - 1] = i + 1;
    } else
      for (const ch of n) {
        norm += ch;
        fold += f;
        starts.push(i);
        ends.push(i + 1);
      }
  }
  // Dấu thập phân đổi ở cả hai bản (cùng vị trí) để giữ ánh xạ ký tự.
  return {
    original,
    norm: norm.replace(/(\d)[.,](?=\d)/g, '$1.'),
    fold: fold.replace(/(\d)[.,](?=\d)/g, '$1.'),
    starts,
    ends,
  };
}

/** Từ khoá highlight giữ dấu (khác `normalize`), chỉ đổi dấu thập phân. */
function markedQuery(raw: unknown): Folded {
  const folded = foldChars(raw);
  const chars = [...folded.text];
  for (let i = 1; i < chars.length - 1; i++) {
    const c = chars[i] as string;
    if ((c === '.' || c === ',') && /\d/.test(chars[i - 1] as string) && /\d/.test(chars[i + 1] as string))
      chars[i] = '.';
  }
  return { text: chars.join(''), accented: folded.accented };
}

/** HTML đã escape, phần khớp bọc `<mark>`; `maxLen` > 0 → cắt đoạn quanh chỗ khớp đầu tiên, thêm "…". */
export function highlight(text: unknown, terms: unknown, maxLen = 0): string {
  const { original, norm, fold, starts, ends } = mapped(text);
  const ranges: [number, number][] = [];
  for (const raw of Array.isArray(terms) ? terms : [terms]) {
    const q = markedQuery(raw);
    if (!q.text) continue;
    if (!q.accented.some(Boolean)) {
      for (let i = norm.indexOf(q.text); i >= 0; i = norm.indexOf(q.text, i + q.text.length))
        ranges.push([starts[i] as number, ends[i + q.text.length - 1] as number]);
      continue;
    }
    // Từ khoá có dấu: tìm theo luật dấu để không bôi lệch chữ gốc.
    for (let i = 0; i + q.text.length <= fold.length; i++) {
      let ok = true;
      for (let j = 0; j < q.text.length && ok; j++)
        ok = q.accented[j] ? fold[i + j] === q.text[j] : norm[i + j] === q.text[j];
      if (ok) ranges.push([starts[i] as number, ends[i + q.text.length - 1] as number]);
    }
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
