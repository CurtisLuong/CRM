// sw.js — cache "app shell" để mở app được kể cả khi mất mạng.
// Dữ liệu khách hàng KHÔNG cache ở đây — nó nằm trong IndexedDB (xem js/db.js).

const CACHE_NAME = 'crm-khach-hang-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/config.js',
  '/js/lunar.js',
  '/js/db.js',
  '/js/app.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Không cache API calls tới Supabase — luôn phải qua mạng (hoặc lỗi ra để db.js xử lý offline queue)
  if (request.url.includes('supabase.co')) return;

  // Network-first: luôn ưu tiên bản mới nhất trên mạng; chỉ rơi về cache khi mất mạng.
  // (Tránh việc app bị "kẹt" dùng code cũ sau khi anh deploy bản mới lên Cloudflare.)
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});