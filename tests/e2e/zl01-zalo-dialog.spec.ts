import { expect, test } from '@playwright/test';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`ZL-01 Zalo ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await page.clock.install({ time: new Date('2026-11-09T03:00:00Z') });
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.port === '54321') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        } else if (['localhost', '127.0.0.1'].includes(url.hostname) && url.port !== '54322') {
          await route.continue();
        } else await route.abort();
      });
      await page.addInitScript(() => {
        const userId = 'zl01-e2e-user';
        const user = {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'zl01@example.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: '2026-11-01T00:00:00.000Z',
        };
        localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
        localStorage.setItem(
          'sb-127-auth-token',
          JSON.stringify({
            access_token: 'synthetic-zl01-token',
            refresh_token: 'synthetic-zl01-refresh',
            expires_at: 4102444800,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          }),
        );
        // Chặn toàn bộ mở ứng dụng ngoài, chỉ quan sát nội dung đã sao chép.
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              sessionStorage.setItem('zl01-copied', text);
            },
          },
        });
        window.open = () => {
          sessionStorage.setItem('zl01-opened', 'true');
          return null;
        };
      });
      await page.goto('/');
      await page.evaluate(async () => {
        const request = indexedDB.open('crm_khach_hang__zl01-e2e-user', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('queue'))
            db.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        };
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['customers', 'meta'], 'readwrite');
          tx.objectStore('customers').put({
            id: 'zl01-customer',
            owner_id: 'zl01-e2e-user',
            full_name: 'Khách Kiểm Thử Zalo',
            phone: '0901234567',
            care_stage: 'Đang chăm sóc',
            qualified_at: '2026-11-01T03:00:00Z',
            registered_at: '2026-11-01T03:00:00Z',
            created_at: '2026-11-01T03:00:00Z',
            updated_at: '2026-11-01T03:00:00Z',
            call_attempts: [],
            next_tasks: [],
          });
          tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      });
      await page.goto('/thao-tac-nhanh');
      await page.clock.pauseAt(new Date('2026-11-09T03:00:30Z'));
      await page.getByRole('button', { name: 'Zalo', exact: true }).click();
    });

    test('đúng thứ tự sáu thành phần, gọn, đếm 3–2–1 và không cuộn ngang', async ({ page }) => {
      const dialog = page.getByRole('dialog', { name: /Nhắn Zalo/ });
      const main = dialog.getByRole('button', { name: /^Sao chép & mở Zalo/ });
      await expect(main).toHaveText('Sao chép & mở Zalo · 3');
      const fields = [
        dialog.getByRole('combobox', { name: 'Mẫu tin' }),
        dialog.getByRole('textbox', { name: 'Mục đích tin (tuỳ chọn)' }),
        dialog.getByRole('button', { name: 'Soạn bằng AI', exact: true }),
        dialog.getByRole('textbox', { name: 'Nội dung tin nhắn' }),
        dialog.getByRole('button', { name: 'Gửi tài liệu', exact: true }),
        main,
      ];
      const boxes = await Promise.all(fields.map((field) => field.boundingBox()));
      for (let i = 0; i < boxes.length; i++) {
        expect(boxes[i]).not.toBeNull();
        if (i) expect(boxes[i]?.y).toBeGreaterThan(boxes[i - 1]?.y ?? 0);
      }
      await expect(dialog.locator('option').first()).toContainText('· Gợi ý');
      for (const removed of [
        'Dán nội dung vào Zalo rồi tự bấm gửi.',
        'SOẠN ZALO BẰNG AI',
        'AI chỉ điền bản nháp',
        'Chi tiết đã dùng:',
      ])
        await expect(dialog).not.toContainText(removed, { ignoreCase: true });
      expect(await dialog.locator('label[for="zalo-message-text"]').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.clock.runFor(1000);
      await expect(main).toHaveText('Sao chép & mở Zalo · 2');
      await page.clock.runFor(1000);
      await expect(main).toHaveText('Sao chép & mở Zalo · 1');
      const message = await fields[3].inputValue();
      await page.clock.runFor(1000);
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('zl01-opened'))).toBe('true');
      expect(await page.evaluate(() => sessionStorage.getItem('zl01-copied'))).toBe(message);
      await page.evaluate(() => window.dispatchEvent(new Event('crm:resume')));
      await expect(dialog.getByText('Đã gửi tin trong Zalo?')).toBeVisible();
    });

    test('giảm chuyển động vẫn đếm; focus huỷ và không đếm lại', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const dialog = page.getByRole('dialog', { name: /Nhắn Zalo/ });
      const main = dialog.getByRole('button', { name: /^Sao chép & mở Zalo/ });
      await page.clock.runFor(1000);
      await expect(main).toHaveText('Sao chép & mở Zalo · 2');
      await dialog.getByRole('textbox', { name: 'Mục đích tin (tuỳ chọn)' }).focus();
      await expect(main).toHaveText('Sao chép & mở Zalo');
      await page.clock.runFor(5000);
      expect(await page.evaluate(() => sessionStorage.getItem('zl01-opened'))).toBeNull();
      await expect(main).toHaveText('Sao chép & mở Zalo');
    });
  });
}
