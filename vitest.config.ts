import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwa-register.ts', import.meta.url)),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Test tính vay (500 ca) có lúc > 5s khi máy bận (chập chờn ở cổng worker) — nới giới hạn, không đổi logic.
    testTimeout: 20_000,
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Chỉ test v2 (.ts/.tsx). Test v1 (tests/*.test.js|cjs) chạy bằng node riêng.
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'legacy/**'],
  },
});
