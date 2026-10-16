import { defineConfig, devices } from '@playwright/test';

// Viewport 360 / 390 / 1280 (architecture.md §8). Chạy trên bản build (vite preview).
const chrome = process.env.CHROME_PATH;
const base = { ...devices['Desktop Chrome'], launchOptions: chrome ? { executablePath: chrome } : {} };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL: 'http://localhost:4173', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [
    { name: 'phone-360', use: { ...base, viewport: { width: 360, height: 780 }, hasTouch: true } },
    { name: 'phone-390', use: { ...base, viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop-1280', use: { ...base, viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    // Synthetic local-only credentials: E2E exercises the offline IndexedDB path, never staging.
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'e2e-public-anon-key',
    },
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
