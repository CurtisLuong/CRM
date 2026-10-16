import { useRegisterSW } from 'virtual:pwa-register/react';

/** Báo "Có bản mới" khi service worker v2 tải xong bản mới; người dùng tự bấm tải lại (không ép reload giữa lúc nhập liệu). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 flex items-center gap-3 rounded-lg bg-gray-900 p-3 text-white"
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
