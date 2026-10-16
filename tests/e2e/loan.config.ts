import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'loan.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4189' },
  webServer: {
    cwd: process.cwd(),
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4189 --strictPort',
    url: 'http://127.0.0.1:4189',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
