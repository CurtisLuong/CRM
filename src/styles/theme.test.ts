import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTheme, readThemePref, resolveTheme, setThemePref, THEME_STORAGE_KEY } from '@/app/theme';

// Test cho src/app/theme.ts (đặt ở đây vì src/app/* ngoài phạm vi T2.C1, chỉ theme.ts thuộc task).
function mockSystem(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((q: string) => ({
      matches: dark && q.includes('dark'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('quy lựa chọn ra sáng/tối', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('mặc định Tự động, theo hệ thống', () => {
    mockSystem(true);
    initTheme();
    expect(readThemePref()).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('lưu lựa chọn; giá trị lạ trong bộ nhớ coi như Tự động', () => {
    mockSystem(true);
    setThemePref('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    setThemePref('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'tim');
    expect(readThemePref()).toBe('system');
  });
});
