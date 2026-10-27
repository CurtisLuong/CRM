// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cn, THEME_RADII, THEME_SHADOWS, THEME_TEXT_SIZES } from './utils';

const css = readFileSync(fileURLToPath(new URL('../../app/index.css', import.meta.url)), 'utf8');
const names = (prefix: string) =>
  [...css.matchAll(new RegExp(`^\\s*--${prefix}-([a-z0-9-]+):`, 'gm'))]
    .map((m) => m[1] ?? '')
    .filter((n) => !n.includes('--'));

describe('cn (gộp class theo Design System)', () => {
  it('giữ cỡ chữ riêng khi có thêm màu chữ', () => {
    expect(cn('text-small', 'text-text-2')).toBe('text-small text-text-2');
    expect(cn('text-body-strong text-accent')).toBe('text-body-strong text-accent');
  });

  it('class sau thắng trong cùng nhóm', () => {
    expect(cn('text-small', 'text-title')).toBe('text-title');
    expect(cn('rounded-control', 'rounded-card')).toBe('rounded-card');
    expect(cn('shadow-e1', 'shadow-e3')).toBe('shadow-e3');
    expect(cn('bg-surface', 'bg-surface-2')).toBe('bg-surface-2');
    expect(cn('px-2', false, null, undefined, 'px-4')).toBe('px-4');
  });

  it('danh sách token khớp @theme trong index.css', () => {
    expect([...THEME_TEXT_SIZES].sort()).toEqual(names('text').sort());
    expect([...THEME_RADII].sort()).toEqual(names('radius').sort());
    expect([...THEME_SHADOWS].sort()).toEqual(names('shadow').sort());
  });
});
