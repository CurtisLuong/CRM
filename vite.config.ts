import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// v2 build (D-011). PWA: precache app shell; SW xoá cache v1 `crm-khach-hang-v*` qua public/sw-cleanup.js.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      filename: 'sw.js', // cùng tên SW v1 → trình duyệt thay SW cũ khi cutover
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Sổ Khách',
        short_name: 'Sổ Khách',
        start_url: '/',
        display: 'standalone',
        background_color: '#F6F8FA',
        theme_color: '#FFFFFF',
        icons: [
          { src: '/icons/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        importScripts: ['sw-cleanup.js'],
        navigateFallback: '/index.html',
        // File vỏ Android tự kiểm tra bản APK mới — luôn lấy từ mạng, không precache.
        globIgnores: ['**/android-app-version.json'],
      },
    }),
  ],
});
