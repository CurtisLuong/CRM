/**
 * Nút/vuốt Back của vỏ Android (ARCHITECTURE.md §7): MainActivity gọi `window.CRMBack()`;
 * true = web đã lùi 1 bước, false = hết đường lùi → vỏ đưa app xuống nền. Trình duyệt thường không gọi.
 * Thứ tự: lớp nổi trên cùng (sheet/dialog/menu/palette) → lùi lịch sử trong app → về Hôm nay → hết.
 */

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
};

export function handleBack(deps: BackDeps, doc: Document = document): boolean {
  if (hasOpenLayer(doc)) {
    closeTopLayer(doc);
    return true;
  }
  if (deps.canGoBack()) {
    deps.goBack();
    return true;
  }
  if (deps.pathname() !== '/') {
    deps.goHome();
    return true;
  }
  return false;
}

/** Gắn window.CRMBack; trả hàm gỡ. */
export function installCRMBack(deps: BackDeps): () => void {
  const fn = () => handleBack(deps);
  window.CRMBack = fn;
  return () => {
    if (window.CRMBack === fn) delete window.CRMBack;
  };
}
