import { useSyncExternalStore } from 'react';

/**
 * Chọn giao diện Sáng / Tối / Tự động (DESIGN_SYSTEM.md §2).
 * - Lựa chọn lưu ở localStorage (theo thiết bị, không đồng bộ lên Supabase).
 * - Luôn đặt <html data-theme="light|dark"> theo giá trị đã quy ra; "Tự động" theo prefers-color-scheme và đổi theo hệ thống.
 * - initTheme() chạy trong main.tsx trước khi React vẽ → không chớp sai màu.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Tự động' },
];

export const THEME_STORAGE_KEY = 'sk-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPref(v: unknown): v is ThemePref {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isPref(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/** Đặt data-theme + màu thanh trạng thái (meta theme-color) theo token --bg của theme. */
function apply(pref: ThemePref) {
  const root = document.documentElement;
  const theme = resolveTheme(pref, systemPrefersDark());
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && bg) meta.content = bg;
}

let current: ThemePref = 'system';
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function getThemePref(): ThemePref {
  return current;
}

export function setThemePref(pref: ThemePref) {
  current = pref;
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Không lưu được (chế độ riêng tư) → vẫn áp cho phiên này.
  }
  apply(pref);
  notify();
}

let started = false;

/** Gọi 1 lần trước khi render. Theo dõi hệ thống đổi sáng/tối và tab khác đổi lựa chọn. */
export function initTheme() {
  current = readThemePref();
  apply(current);
  if (started) return;
  started = true;
  if (typeof matchMedia === 'function') {
    matchMedia(DARK_QUERY).addEventListener('change', () => {
      if (current === 'system') apply(current);
    });
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
    current = readThemePref();
    apply(current);
    notify();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Hook cho màn Cài đặt: [lựa chọn hiện tại, hàm đổi]. */
export function useThemePref(): [ThemePref, (pref: ThemePref) => void] {
  return [useSyncExternalStore(subscribe, getThemePref, getThemePref), setThemePref];
}
