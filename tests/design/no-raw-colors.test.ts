// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/DESIGN.md luật 2: chỉ dùng token. Cấm mã hex, rgb()/hsl()/oklch(), màu bảng Tailwind (bg-blue-500…).
// Nguồn token (tokens.css) và bản in giấy (*print.css) được miễn.
const ROOT = fileURLToPath(new URL('../../src', import.meta.url));
const SKIP = [/styles\/tokens\.(css|test\.ts)$/, /print\.css$/];
const PALETTE =
  '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}';
const RULES = [
  { re: /#[0-9a-fA-F]{3,8}\b(?![\w-]*\))/g, why: 'mã hex' },
  { re: /\brgba?\(|\bhsla?\(|\boklch\(/g, why: 'hàm màu' },
  {
    re: new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|outline|from|to|via|shadow|decoration)-${PALETTE}\\b`, 'g'),
    why: 'màu bảng Tailwind',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(p) && !/\.test\.tsx?$/.test(p) && !SKIP.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

describe('không mã màu thô ngoài token', () => {
  it('src/** chỉ dùng token', () => {
    const bad: string[] = [];
    for (const f of walk(ROOT)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/url\(#/.test(line)) return;
          for (const r of RULES)
            for (const m of line.matchAll(r.re)) bad.push(`${relative(ROOT, f)}:${i + 1} ${r.why}: ${m[0]}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
