import { expect, type Page, test } from '@playwright/test';

const USER_ID = 'r1-today-user';
const NOW = new Date(2026, 9, 28, 9, 20);
const localTime = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

async function openToday(page: Page, colorScheme: 'light' | 'dark') {
  await page.clock.install({ time: NOW });
  await page.emulateMedia({ colorScheme });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r1-today@example.test',
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
  }, USER_ID);
  await page.goto('/');
  await page.evaluate(
    async ({ userId, rows }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
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
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: '2026-10-01T00:00:00.000Z' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      userId: USER_ID,
      rows: [
        {
          id: 'r1-overdue-task',
          owner_id: USER_ID,
          full_name: 'Khách có việc quá hạn',
          phone: '0900000001',
          care_stage: 'Đang chăm sóc',
          qualified_at: localTime(1, 9),
          care_stage_updated_at: localTime(1, 9),
          registered_at: localTime(1, 9),
          created_at: localTime(1, 9),
          call_attempts: [{ at: localTime(1, 9), result: 'talked' }],
          next_tasks: [
            {
              at: 'r1-overdue-task-at',
              text: 'Việc quá hạn cần gọi',
              kind: 'call',
              due: localTime(28, 8),
              side: 'me',
            },
          ],
        },
        {
          id: 'r1-due-task',
          owner_id: USER_ID,
          full_name: 'Khách có việc đến giờ',
          phone: '0900000002',
          care_stage: 'Đang chăm sóc',
          qualified_at: localTime(1, 9),
          care_stage_updated_at: localTime(1, 9),
          registered_at: localTime(1, 9),
          created_at: localTime(1, 9),
          call_attempts: [{ at: localTime(1, 9), result: 'talked' }],
          next_tasks: [
            {
              at: 'r1-due-task-at',
              text: 'Việc đến giờ hôm nay',
              kind: 'call',
              due: localTime(28, 10),
              side: 'me',
            },
          ],
        },
        {
          id: 'r1-new-lead',
          owner_id: USER_ID,
          full_name: 'Khách mới chưa gọi',
          phone: '0900000003',
          care_stage: 'Đăng kí mới',
          registered_at: localTime(28, 9),
          created_at: localTime(28, 9),
          care_stage_updated_at: localTime(28, 9),
          call_attempts: [],
          next_tasks: [],
        },
      ],
    },
  );
  await page.goto('/today');
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`R1 Hôm nay · ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('hiển thị đúng ba mức gấp, một hành động mỗi dòng và không tràn ngang', async ({ page }, info) => {
      test.skip(info.project.name === 'phone-390', 'Nghiệm thu trực quan ở 360px và 1280px.');
      await openToday(page, colorScheme);

      const main = page.locator('main');
      const overdueTile = main.getByRole('button').filter({ hasText: 'Quá hạn' }).first();
      const dueTile = main.getByRole('button').filter({ hasText: 'Đến giờ hôm nay' }).first();
      const onTrackTile = main.getByRole('button').filter({ hasText: 'Đúng hẹn' }).first();
      await expect(overdueTile).toContainText('1');
      await expect(dueTile).toContainText('1');
      await expect(onTrackTile).toContainText('1');

      const overdue = page.locator('[data-card]').filter({ hasText: 'Việc quá hạn cần gọi' });
      await expect(overdue).toHaveCount(1);
      await expect(overdue.locator('[title="Quá hạn"]')).toBeVisible();
      await expect(overdue.getByRole('button', { name: /Làm ngay/ })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Việc đến hạn hôm nay' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Khách mới chưa gọi' })).toBeVisible();
      await expect(page.locator('[data-card]')).toHaveCount(3);
      expect(
        await page
          .locator('[data-card]')
          .evaluateAll((cards) => cards.every((card) => card.querySelectorAll('[data-card]').length === 0)),
      ).toBe(true);
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      const widths = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    });
  });
}
