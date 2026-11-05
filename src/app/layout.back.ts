/**
 * Nút/vuốt Back của vỏ Android (ARCHITECTURE.md §7): MainActivity gọi `window.CRMBack()`;
 * true = web đã lùi 1 bước, false = hết đường lùi → vỏ đưa app xuống nền. Trình duyệt thường không gọi.
 * Thứ tự: lớp nổi trên cùng (sheet/dialog/menu/palette) → màn con lùi lịch sử → tab chính về Hôm nay →
 * Hôm nay: "Bấm back lần nữa để thoát" → lần back thứ hai trong 2 giây mới thoát.
 */

import { NAV_TABS } from './layout.nav';

declare global {
  interface Window {
    CRMBack?: () => boolean;
  }
}

// Lớp nổi của Radix đang mở. Đóng bằng Escape để Radix tự chọn lớp TRÊN CÙNG và giữ các chặn riêng
// (vd. Sheet đang có bản nháp → hỏi "Bỏ nội dung đang nhập?" thay vì đóng).
const OPEN_LAYER =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

export function hasOpenLayer(doc: Document = document): boolean {
  return doc.querySelector(OPEN_LAYER) !== null;
}

export function closeTopLayer(doc: Document = document): void {
  const target = doc.activeElement instanceof HTMLElement ? doc.activeElement : doc.body;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
  );
}

export type BackDeps = {
  /** Đường dẫn hiện tại. */
  pathname: () => string;
  /** Có trang trước trong app (không phải trang ngoài/tab mới). */
  canGoBack: () => boolean;
  goBack: () => void;
  goHome: () => void;
  /** Báo "Bấm back lần nữa để thoát". Không truyền → hết đường lùi là thoát ngay. */
  warnExit?: () => void;
};

const HOME_PATHS = new Set(['/', '/today']);
const TAB_ROOTS = new Set<string>(NAV_TABS.map((t) => t.path));
export const EXIT_WINDOW_MS = 2000;

export function handleBack(deps: BackDeps, doc: Document = document): boolean {
  if (hasOpenLayer(doc)) {
    closeTopLayer(doc);
    return true;
  }
  const path = deps.pathname();
  if (HOME_PATHS.has(path)) return false;
  // Tab chính là gốc: về thẳng Hôm nay, không lùi qua lịch sử các tab (Curtis 05/11 — lịch sử dài
  // từng làm back lặp giữa danh sách và drawer khách).
  if (!TAB_ROOTS.has(path) && deps.canGoBack()) {
    deps.goBack();
    return true;
  }
  deps.goHome();
  return true;
}

/** Gắn window.CRMBack; trả hàm gỡ. */
export function installCRMBack(deps: BackDeps, now: () => number = Date.now): () => void {
  let warnedAt = Number.NEGATIVE_INFINITY;
  const fn = () => {
    if (handleBack(deps)) {
      warnedAt = Number.NEGATIVE_INFINITY;
      return true;
    }
    if (!deps.warnExit || now() - warnedAt <= EXIT_WINDOW_MS) return false;
    warnedAt = now();
    deps.warnExit();
    return true;
  };
  window.CRMBack = fn;
  return () => {
    if (window.CRMBack === fn) delete window.CRMBack;
  };
}
