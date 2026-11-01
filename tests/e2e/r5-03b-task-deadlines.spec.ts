import { expect, test } from '@playwright/test';

const NOW = '2026-10-28T03:20:00.000Z';

async function installTaskFixture(page: import('@playwright/test').Page, nextCallAt = '2026-10-28T02:00:00.000Z') {
  await page.clock.install({ time: new Date(NOW) });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const userId = 'r5-03b-task-user';
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
  await page.evaluate(
    async ({ nextCallAt }) => {
      const userId = 'r5-03b-task-user';
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
        request.onupgradeneeded = () => {
          const current = request.result;
          if (!current.objectStoreNames.contains('customers'))
            current.createObjectStore('customers', { keyPath: 'id' });
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
          id: 'r5-03b-customer',
          owner_id: userId,
          full_name: 'Khách mẫu R5-03b',
          phone: '0901234567',
          next_call_at: nextCallAt,
          next_call_end: '2026-10-28T03:00:00.000Z',
          next_call_reason: 'Khách xin gọi lại',
          next_tasks: [],
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { nextCallAt },
  );
}

test('hẹn gọi 09:00–10:00 vẫn đến hạn lúc 10:20 và quá hạn sau 10:30', async ({ page }) => {
  await installTaskFixture(page);
  await page.goto('/cong-viec');
  const card = page.getByRole('article').filter({ hasText: 'Hẹn gọi · Khách xin gọi lại' });
  await expect(card.getByText('Đến hạn · 09:00')).toBeVisible();
  await page.clock.runFor(11 * 60 * 1000);
  await expect(card.getByText('Quá 31 phút · 09:00')).toBeVisible();
});

test('bấm vùng tên khách trên thẻ mở hồ sơ khách', async ({ page }) => {
  await installTaskFixture(page);
  await page.goto('/cong-viec');
  await page.getByRole('button', { name: 'Mở Khách mẫu R5-03b' }).click();
  await expect(page).toHaveURL(/\/khach-hang\/r5-03b-customer$/);
});
