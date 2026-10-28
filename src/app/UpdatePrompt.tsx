import { useRegisterSW } from 'virtual:pwa-register/react';

/** Báo "Có bản mới" khi service worker v2 tải xong bản mới; người dùng tự bấm tải lại (không ép reload giữa lúc nhập liệu). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // App mở lâu (PWA, vỏ Android) không tải lại trang → tự hỏi bản mới mỗi 30 phút và mỗi lần quay lại app.
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {});
      };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] z-[55] flex items-center gap-3 rounded-lg border border-line bg-surface-100 p-3 text-ink shadow-overlay md:inset-x-auto md:right-4 md:bottom-4 md:w-80"
    >
      <span className="flex-1">Có bản mới</span>
      <button type="button" className="font-semibold" onClick={() => updateServiceWorker(true)}>
        Tải lại
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)}>
        Để sau
      </button>
    </div>
  );
}
