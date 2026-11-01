// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Kiểm token theo docs/DESIGN.md §1: đủ cặp sáng/tối, 2 khối tối khớp nhau, tương phản WCAG AA, tên cũ trỏ về tên mới.
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
  '--surface-0',
  '--surface-100',
  '--surface-200',
  '--line',
  '--ink',
  '--ink-muted',
  '--ion',
  '--on-ion',
  '--ion-tint',
  ...['ok', 'soon', 'alert'].flatMap((l) => [
    `--signal-${l}`,
    `--signal-${l}-text`,
    `--signal-${l}-tint`,
    `--on-signal-${l}`,
  ]),
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-prev',
  '--scrim',
];

describe('tokens.css', () => {
  it('đủ mọi token màu ở cả sáng và tối', () => {
    for (const t of COLOR_TOKENS) {
      expect(light[t], `sáng ${t}`).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      expect(dark[t], `tối ${t}`).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    }
  });

  it('khối tối theo hệ thống giống hệt khối [data-theme="dark"]', () => {
    expect(darkAuto).toEqual(dark);
  });

  it('tên cũ (D-023) chỉ trỏ vào token mới, không có mã màu riêng', () => {
    const legacy = css.slice(css.indexOf('TÊN CŨ'));
    for (const m of legacy.matchAll(/(--[\w-]+):\s*([^;]+);/g))
      expect(m[2], `${m[1]} phải là var(--…)`).toMatch(/^var\(--[\w-]+\)$|^0 0 #0000$/);
  });

  it.each([
    ['sáng', light],
    ['tối', dark],
  ])('tương phản đạt AA (%s)', (_name, t) => {
    const c = (fg: string, bg: string) => contrast(t[fg] as string, t[bg] as string);
    for (const bg of ['--surface-0', '--surface-100', '--surface-200']) {
      for (const fg of ['--ink', '--ink-muted', '--ion'])
        expect(c(fg, bg), `${fg} trên ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const l of ['ok', 'soon', 'alert'])
        expect(c(`--signal-${l}-text`, bg), `chữ ${l} trên ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(c('--on-ion', '--ion')).toBeGreaterThanOrEqual(4.5);
    expect(c('--ion', '--ion-tint')).toBeGreaterThanOrEqual(4.5);
    for (const l of ['ok', 'soon', 'alert']) {
      expect(c(`--signal-${l}-text`, `--signal-${l}-tint`), `chữ ${l} trên nền ${l}`).toBeGreaterThanOrEqual(4.5);
      expect(c(`--on-signal-${l}`, `--signal-${l}`), `chữ trên khối ${l}`).toBeGreaterThanOrEqual(4.5);
    }
    // Viền ô nhập (--input = ink-muted) và thanh biểu đồ cần ≥ 3:1 (WCAG 1.4.11 thành phần đồ hoạ).
    expect(c('--chart-1', '--surface-100')).toBeGreaterThanOrEqual(3);
  });
});
