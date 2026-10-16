import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { PaletteItem } from '@/ui/CommandPalette';
import type { SyncState } from '@/ui/chrome';

/**
 * "Cổng cắm" của khung app — nơi khác nối vào mà KHÔNG sửa layout.tsx:
 * - Trạng thái đồng bộ: `setShellSync(state)` (T2.A4 gọi từ useSyncStatus). Mặc định null = chưa nối → ẩn chỉ báo.
 * - Nguồn tìm khách cho Bảng lệnh: `setCustomerSearch(fn)` (feature nối domain/search, T2.B3). Mặc định không có.
 * - Panel phải desktop: <ContextPanel>…</ContextPanel> trong feature (chỉ hiện khi ≥1024px).
 */

function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      for (const s of subs) s();
    },
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}

const syncStore = store<SyncState | null>(null);
export const setShellSync = syncStore.set;
export function useShellSync() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
}

export type CustomerSearch = (query: string) => PaletteItem[] | Promise<PaletteItem[]>;
const searchStore = store<CustomerSearch | undefined>(undefined);
export const setCustomerSearch = searchStore.set;
export function useCustomerSearch() {
  return useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get);
}

// Panel phải: layout đăng ký phần tử đích; ContextPanel portal vào đó và báo layout hiện cột.
const asideEl = store<HTMLElement | null>(null);
const asideUsers = store(0);
export const setAsideElement = asideEl.set;
export function useAsideVisible() {
  return useSyncExternalStore(asideUsers.subscribe, asideUsers.get, asideUsers.get) > 0;
}

const DESKTOP = '(min-width: 1024px)';
function subscribeDesktop(cb: () => void) {
  const mq = matchMedia(DESKTOP);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const isDesktop = () => typeof matchMedia === 'function' && matchMedia(DESKTOP).matches;

/** Nội dung panel ngữ cảnh phải (desktop ≥1024px). Mobile: không vẽ — feature tự mở màn/sheet riêng. */
export function ContextPanel({ children }: { children: ReactNode }) {
  const el = useSyncExternalStore(asideEl.subscribe, asideEl.get, asideEl.get);
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false);
  useEffect(() => {
    if (!desktop) return;
    asideUsers.set(asideUsers.get() + 1);
    return () => asideUsers.set(asideUsers.get() - 1);
  }, [desktop]);
  return desktop && el ? createPortal(children, el) : null;
}
