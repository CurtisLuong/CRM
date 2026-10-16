// Nạp vào service worker v2 (vite.config.ts → workbox.importScripts).
// Xoá cache của service worker v1 ("crm-khach-hang-v*") khi SW v2 kích hoạt. Không đụng IndexedDB (dữ liệu khách).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('crm-khach-hang-v')).map((k) => caches.delete(k)))),
  );
});
