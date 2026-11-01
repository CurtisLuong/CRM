import { expect, test } from '@playwright/test';

async function installTask(page: import('@playwright/test').Page) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const userId = 'r5-03-task-user';
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
    const userId = 'r5-03-task-user';
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
      request.onupgradeneeded = () => {
        const current = request.result;
        if (!current.objectStoreNames.contains('customers')) current.createObjectStore('customers', { keyPath: 'id' });
        if (!current.objectStoreNames.contains('queue'))
          current.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        if (!current.objectStoreNames.contains('meta')) current.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 'r5-03-customer',
        owner_id: userId,
        full_name: 'Khách mẫu R5',
        phone: '0901234567',
        next_tasks: [
          { at: 'r5-03-task', text: 'Gửi bảng giá', kind: 'docs', due: new Date(Date.now() + 3600_000).toISOString() },
        ],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`R5-03 tasks ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('dùng ActionItem và ChipGroup, không tràn ở điện thoại và desktop', async ({ page }) => {
      await installTask(page);
      await page.goto('/cong-viec');
      await expect(page.getByRole('article').filter({ hasText: 'Gửi bảng giá' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Lọc theo người hứa' })).toBeVisible();
      for (const width of [360, 390, 1280]) {
        await page.setViewportSize({ width, height: 850 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    });
  });
}
