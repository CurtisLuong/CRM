// Nạp code v1 thật từ legacy/ (để so parity) + đọc golden/fixture. Chỉ dùng trong test (môi trường node).
// tsconfig app không có kiểu Node → khai báo tối thiểu tại chỗ.
type NodeModule = { createRequire(url: string): (id: string) => unknown };
type NodeFs = { readFileSync(path: URL, enc: 'utf8'): string };
const { createRequire }: NodeModule = await import(/* @vite-ignore */ 'node:module' as string);
const { readFileSync }: NodeFs = await import(/* @vite-ignore */ 'node:fs' as string);

const ROOT = new URL('../../../', import.meta.url);
const require = createRequire(import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, ROOT), 'utf8');

// biome-ignore lint/suspicious/noExplicitAny: API v1 không có kiểu
type Any = any;

/** CRMSearch v1 (search.js gắn vào globalThis → property-search.js dùng được). */
export const V1Search: Any = require('../../../legacy/js/search.js');
export const V1Property: Any = require('../../../legacy/js/property-search.js');
export const V1Loan: Any = require('../../../legacy/js/loan/loan-engine.js');

/** lunar.js v1 không phải module: chạy với `window` giả trong cùng realm. */
export const V1Lunar: Any = (() => {
  const win: Record<string, unknown> = {};
  new Function('window', read('legacy/js/lunar.js'))(win);
  return win.LunarUtil;
})();

/** Lấy nguyên văn 1 hàm tự đứng (không phụ thuộc gì) trong legacy/js/app.js. */
export function v1AppFunction(name: string): Any {
  const src = read('legacy/js/app.js');
  const m = src.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n}\\n`));
  if (!m) throw new Error(`không thấy hàm ${name} trong legacy/js/app.js`);
  return new Function(`${m[0]}; return ${name};`)();
}

export const golden = (name: string): Any => JSON.parse(read(`tests/golden/${name}.json`)).result;
export const fixture = (): Any => JSON.parse(read('tests/fixtures/legacy-customers.json'));

/** JSON ổn định như tests/legacy-harness/run.js: khoá sắp xếp, bỏ undefined, NaN/Infinity thành chuỗi. */
export function canon(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'function') return undefined;
  if (Array.isArray(v)) return v.map((x) => canon(x) ?? null);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object).sort()) {
    const c = canon((v as Record<string, unknown>)[k]);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

/** Lỗi ném ra cũng là một kết quả (như tryRun của harness). */
export function tryRun<T>(fn: () => T): T | { $error: string } {
  try {
    return fn();
  } catch (e) {
    return { $error: (e as Error).message };
  }
}

/** Sinh số giả ngẫu nhiên có seed (mulberry32) → ca ngẫu nhiên tái lập được. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chuỗi ngẫu nhiên từ bảng ký tự (tiếng Việt có dấu, NFD, số, dấu câu, khoảng trắng, ký tự HTML). */
export function randomText(r: () => number, maxLen = 24): string {
  const ALPHA = [
    ...'aăâbcdđeêghiklmnoôơpqrstuưvxyAĂÂĐÊÔƠƯ',
    ...'áàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ',
    ...'0123456789',
    ' ',
    ' ',
    '  ',
    '\t',
    ...'.,+-/()"\'&<>',
    'Hương'.normalize('NFD'),
    'pn',
    'phòng ngủ',
    'wc',
    'n+',
    '+84',
    '0084',
  ];
  const n = Math.floor(r() * maxLen);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHA[Math.floor(r() * ALPHA.length)];
  return s;
}
