import { expect, type Locator, test } from '@playwright/test';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`quick actions ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('deep link is account-gated and fits the viewport', async ({ page }) => {
      await page.goto('/thao-tac-nhanh');
      await expect(page.locator('main h1')).toHaveText('Thao tác nhanh');
      await expect(page.getByText(/Đăng nhập để mở dữ liệu của bạn|Chưa cấu hình kết nối staging/)).toBeVisible();

      const metrics = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        mainWidth: document.querySelector('main')?.getBoundingClientRect().width ?? 0,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.width);
      expect(metrics.mainWidth).toBeGreaterThan(0);
      expect(await page.getByRole('button', { name: 'Đăng xuất' }).count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Gọi' }).count()).toBe(0);
    });

    test('Gọi → kết quả → lưu dùng ba lần tương tác và ghi local', async ({ page }, testInfo) => {
      const interact = (locator: Locator) =>
        testInfo.project.name.startsWith('phone-') ? locator.tap() : locator.click();
      await page.route('http://127.0.0.1:54321/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      );
      await page.route('https://worker.test/ai', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        expect(body.task).toBe('parse_note');
        expect(body.customer).not.toHaveProperty('phone');
        expect(JSON.stringify(body)).not.toContain('0901234567');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { cap_nhat: { finance: 500000000 }, viec: [], hen_goi: null }, model: 'qwen' }),
        });
      });
      await page.addInitScript(() => {
        const userId = 't31-e2e-user';
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
        (window as Window & { Capacitor?: unknown }).Capacitor = {
          isNativePlatform: () => true,
          Plugins: {
            CallLog: {
              dial: async () => {
                (window as Window & { __dialCalls?: number }).__dialCalls =
                  ((window as Window & { __dialCalls?: number }).__dialCalls ?? 0) + 1;
                return {};
              },
            },
          },
        };
      });
      await page.goto('/');
      await page.evaluate(async () => {
        const userId = 't31-e2e-user';
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('queue'))
              db.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['customers', 'meta'], 'readwrite');
          tx.objectStore('customers').put({
            id: 't31-e2e-customer',
            owner_id: userId,
            full_name: 'Khách E2E T3.1',
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
      await expect(page.getByRole('heading', { name: 'Khách E2E T3.1' })).toBeVisible();
      await page.evaluate(() => {
        (window as Window & { __taps?: number }).__taps = 0;
        document.addEventListener('click', () => {
          const w = window as Window & { __taps?: number };
          w.__taps = (w.__taps ?? 0) + 1;
        });
      });
      await interact(page.getByRole('button', { name: 'Gọi' }));
      await page.waitForFunction(() => (window as Window & { __dialCalls?: number }).__dialCalls === 1);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.waitForTimeout(3_500);
      await page.evaluate(() => window.dispatchEvent(new Event('crm:resume')));
      await expect(page.getByRole('heading', { name: /Kết quả cuộc gọi/ })).toBeVisible();
      await interact(page.getByRole('radio', { name: 'Nói chuyện được' }));
      await expect(page.getByRole('textbox', { name: 'Ghi chú cuộc gọi' })).toBeFocused();
      await page.getByRole('textbox', { name: 'Ghi chú cuộc gọi' }).fill('Hẹn gửi bảng giá');
      let expectedTaps = 3;
      const aiButton = page.getByRole('button', { name: 'Lưu + AI · xem đề xuất' });
      if (await aiButton.count()) {
        await aiButton.click();
        const aiReview = page.getByTestId('ai-note-review');
        await expect(aiReview).toBeVisible();
        const financeChoice = aiReview.getByRole('checkbox').first();
        await expect(financeChoice).not.toBeChecked();
        const beforeApproval = await page.evaluate(async () => {
          const req = indexedDB.open('crm_khach_hang__t31-e2e-user', 2);
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
            const get = db.transaction('customers').objectStore('customers').get('t31-e2e-customer');
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => reject(get.error);
          });
          db.close();
          return row;
        });
        expect(beforeApproval.finance).toBeUndefined();
        await interact(financeChoice);
        await interact(aiReview.getByRole('button', { name: 'Duyệt và lưu các mục đã chọn' }));
        await expect(aiReview.getByRole('status')).toHaveText('Đã lưu các mục bạn duyệt trên thiết bị.');
        await page.evaluate(() => {
          (window as Window & { __taps?: number }).__taps = 0;
        });
        expectedTaps = 1;
      }
      await interact(page.getByRole('button', { name: 'Lưu', exact: true }));
      await expect(page.getByRole('heading', { name: /Kết quả cuộc gọi/ })).toHaveCount(0);
      expect(await page.evaluate(() => (window as Window & { __taps?: number }).__taps)).toBe(expectedTaps);
      const saved = await page.evaluate(async () => {
        const req = indexedDB.open('crm_khach_hang__t31-e2e-user', 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const get = db.transaction('customers').objectStore('customers').get('t31-e2e-customer');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        });
        db.close();
        return row;
      });
      expect(saved.call_attempts).toMatchObject([{ result: 'talked', note: 'Hẹn gửi bảng giá' }]);
      if (expectedTaps === 1) {
        expect(saved.finance).toBe(500000000);
        expect(saved.field_meta).toMatchObject({ finance: { by: 'ai', confirmed: true } });
      }
    });
  });
}
