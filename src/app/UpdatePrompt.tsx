import { useRegisterSW } from 'virtual:pwa-register/react';
import { useState } from 'react';
import { Button } from '@/ui';

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
  const [reloading, setReloading] = useState(false);
  if (!needRefresh) return null;
  // 11/11: bấm "Tải lại" có lúc không có gì xảy ra (SW đã kích hoạt ở tab khác / trình duyệt không bắn 'controlling')
  // → luôn có lối thoát: sau 3 giây vẫn ở trang này thì tự tải lại.
  const reload = () => {
    setReloading(true);
    void updateServiceWorker(true).catch(() => {});
    window.setTimeout(() => window.location.reload(), 3000);
  };
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] z-[55] flex items-center gap-2 rounded-lg border border-line bg-surface-100 py-2 pr-2 pl-4 text-ink shadow-overlay md:inset-x-auto md:right-4 md:bottom-4 md:w-80"
    >
      <span className="flex-1">Có bản mới</span>
      <Button variant="primary" className="min-h-11 px-3" loading={reloading} disabled={reloading} onClick={reload}>
        Tải lại
      </Button>
      <Button variant="ghost" className="min-h-11 px-3" disabled={reloading} onClick={() => setNeedRefresh(false)}>
        Để sau
      </Button>
    </div>
  );
}
