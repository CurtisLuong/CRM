// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Kiểm token theo DESIGN_SYSTEM.md §2.1: đủ cặp sáng/tối, 2 khối tối khớp nhau, tương phản WCAG AA.
// Đọc file thô bằng fs: vitest không nạp CSS (`?raw` trả chuỗi rỗng).
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Không thấy khối ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1] as string] = (m[2] as string).trim();
  return vars;
}

const light = block(':root');
const dark = block('[data-theme="dark"]');
const darkAuto = block(':root:not([data-theme])');

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const COLOR_TOKENS = [
  '--bg',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--text',
  '--text-2',
  '--text-3',
  '--border',
  '--border-strong',
  '--accent',
  '--accent-fg',
  '--accent-soft',
  '--danger',
  '--danger-bg',
  '--warning',
  '--warning-bg',
  '--success',
  '--success-bg',
  '--ai',
  '--ai-bg',
  '--hairline',
  '--accent-tonal',
  '--track',
  '--bar',
];

describe('tokens.css', () => {
  it('đủ mọi token màu ở cả sáng và tối', () => {
    for (const t of COLOR_TOKENS) {
      expect(light[t], `sáng ${t}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(dark[t], `tối ${t}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('khối tối theo hệ thống giống hệt khối [data-theme="dark"]', () => {
    expect(darkAuto).toEqual(dark);
  });

  it.each([
    ['sáng', light],
    ['tối', dark],
  ])('tương phản đạt AA (%s)', (_name, t) => {
    const c = (fg: string, bg: string) => contrast(t[fg] as string, t[bg] as string);
    for (const bg of ['--bg', '--surface', '--surface-2']) {
      for (const fg of ['--text', '--text-2', '--text-3'])
        expect(c(fg, bg), `${fg} trên ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(c('--border-strong', '--surface')).toBeGreaterThanOrEqual(3);
    expect(c('--accent-fg', '--accent')).toBeGreaterThanOrEqual(4.5);
    expect(c('--accent', '--surface')).toBeGreaterThanOrEqual(4.5);
    expect(c('--accent', '--accent-soft')).toBeGreaterThanOrEqual(4.5);
    // v4: icon nút trên thẻ gọn (nền tonal) và thanh SLA cần ≥ 3:1 (WCAG 1.4.11 thành phần đồ hoạ).
    expect(c('--accent', '--accent-tonal')).toBeGreaterThanOrEqual(3);
    expect(c('--bar', '--track')).toBeGreaterThanOrEqual(3);
    for (const s of ['--danger', '--warning', '--success', '--ai']) {
      expect(c(s, `${s}-bg`), `${s} trên nền riêng`).toBeGreaterThanOrEqual(4.5);
      expect(c(s, '--surface'), `${s} trên --surface`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
