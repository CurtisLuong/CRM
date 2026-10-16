/// <reference types="node" />
// Nạp code v1 thật (legacy/js/*.js) qua tests/legacy-harness/load-v1.js để so giá trị cấu hình v2 với v1.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadV1, ROOT } = require('../legacy-harness/load-v1.js') as {
  loadV1: (opts?: { now?: string | number }) => { run: (code: string) => unknown };
  ROOT: string;
};

const ctx = loadV1();

/** Giá trị của 1 biểu thức trong context v1, đã chép sang realm hiện tại (JSON) để so deep equal. */
export function v1<T = unknown>(expr: string): T {
  return JSON.parse(ctx.run(`JSON.stringify(${expr})`) as string) as T;
}

/** Chạy 1 biểu thức trong context v1, trả nguyên giá trị (chuỗi, số…). */
export function v1raw(expr: string): unknown {
  return ctx.run(expr);
}

/** Literal `const NAME = …;` khai báo BÊN TRONG IIFE của file v1 (không lộ ra ngoài) → giá trị. */
export function v1Literal<T = unknown>(file: string, name: string): T {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = new RegExp(`const ${name} = ([^;]+);`).exec(src);
  if (!m?.[1]) throw new Error(`Không thấy const ${name} trong ${file}`);
  return v1<T>(`(${m[1]})`);
}
