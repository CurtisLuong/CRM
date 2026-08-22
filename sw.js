// sw.js — cache "app shell" để mở app được kể cả khi mất mạng.
// Dữ liệu khách hàng KHÔNG cache ở đây — nó nằm trong IndexedDB (xem js/db.js).

const CACHE_NAME = 'crm-khach-hang-v5';
const NET_TIMEOUT = 5000; // ms: mạng chậm quá thì rơi về cache, tránh treo "Đang tải lại..."
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/config.js',
  '/js/lunar.js',
  '/js/db.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/logo.svg',
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

  // Network-first CÓ TIMEOUT: ưu tiên bản mới nhất trên mạng; nhưng nếu mạng chậm
  // quá NET_TIMEOUT hoặc lỗi → rơi về cache NGAY (tránh treo khi mạng chập chờn, đặc
  // biệt lúc reload trên điện thoại). Vẫn cập nhật bản mới nhất cho cache khi tải được.
  event.respondWith(networkFirst(request));
});

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request, NET_TIMEOUT);
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Điều hướng trang mà không có cache khớp → trả app-shell (index.html) để app mở được.
    if (request.mode === 'navigate') {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }
    throw e; // request khác không có cache → để browser báo lỗi mạng như thường
  }
}