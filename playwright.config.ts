import { defineConfig, devices } from '@playwright/test';

// Viewport 360 / 390 / 1280 (architecture.md §8). Chạy trên bản build (vite preview).
const chrome = process.env.CHROME_PATH;
// Cổng riêng cho mỗi worker Factory chạy song song (scripts/factory-run.mjs đặt E2E_PORT); mặc định 4173.
const port = Number(process.env.E2E_PORT || 4173);
const base = { ...devices['Desktop Chrome'], launchOptions: chrome ? { executablePath: chrome } : {} };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Nhiều worker Factory chạy song song → giới hạn luồng mỗi tiến trình (E2E_WORKERS) để máy không quá tải.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL: `http://localhost:${port}`, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [
    { name: 'phone-360', use: { ...base, viewport: { width: 360, height: 780 }, hasTouch: true } },
    { name: 'phone-390', use: { ...base, viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop-1280', use: { ...base, viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    // Synthetic local-only credentials: E2E exercises the offline IndexedDB path, never staging.
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'e2e-public-anon-key',
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
