import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`R5-02 quick actions kit · ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('ghi chú dùng sheet và textarea kit, vừa khung nhìn', async ({ page }) => {
      await page.route('http://127.0.0.1:54321/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      );
      await page.addInitScript(() => {
        const userId = 'r5-02-e2e-user';
        const user = {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'e2e@example.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: '2026-10-01T00:00:00.000Z',
        };
        localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
        localStorage.setItem(
          'sb-127-auth-token',
          JSON.stringify({
            access_token: 'synthetic-e2e-token',
            refresh_token: 'synthetic-e2e-refresh',
            expires_at: 4102444800,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          }),
        );
      });
      await page.goto('/');
      await page.evaluate(async () => {
        const userId = 'r5-02-e2e-user';
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('customers'))
              database.createObjectStore('customers', { keyPath: 'id' });
            if (!database.objectStoreNames.contains('queue'))
              database.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
            if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['customers', 'meta'], 'readwrite');
          tx.objectStore('customers').put({
            id: 'r5-02-customer',
            owner_id: userId,
            full_name: 'Khách R5-02',
            phone: '0901234567',
            qualified_at: '2026-10-01T03:00:00.000Z',
            care_stage: 'Đang chăm sóc',
            registered_at: '2026-10-01T03:00:00.000Z',
            created_at: '2026-10-01T03:00:00.000Z',
            updated_at: '2026-10-01T03:00:00.000Z',
            call_attempts: [],
            next_tasks: [],
          });
          tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      });
      await page.goto('/thao-tac-nhanh');
      await expect(page.getByRole('heading', { name: 'Khách R5-02' })).toBeVisible();
      await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Ghi chú nhanh · Khách R5-02' });
      await expect(sheet).toBeVisible();
      const note = sheet.getByRole('textbox', { name: 'Nội dung ghi chú' });
      await expect(note).toHaveClass(/bg-surface-100/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerWidth),
      );
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(scheme);

      const sourceFiles = ['QuickActions.tsx', 'interactions.tsx', 'route.tsx', 'voice.tsx'];
      const sources = await Promise.all(
        sourceFiles.map((file) => readFile(`src/features/quick-actions/${file}`, 'utf8')),
      );
      for (const source of sources) expect(source).not.toMatch(/from ['"]@\/ui['"]/);
    });
  });
}
