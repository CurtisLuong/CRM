import { expect, test } from '@playwright/test';

const USER_ID = 'r3-02-notifications-user';
const NOW = new Date(2026, 9, 28, 9, 30);
const localTime = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();

const rows = ['Khách Nhóm A', 'Khách Nhóm B', 'Khách Nhóm C'].map((full_name, index) => ({
  id: `r3-02-customer-${index + 1}`,
  owner_id: USER_ID,
  full_name,
  phone: `090000000${index + 1}`,
  care_stage: 'Đăng kí mới',
  registered_at: localTime(28, 8),
  created_at: localTime(28, 8),
  updated_at: localTime(28, 8),
  call_attempts: [],
  next_tasks: [],
}));

async function openNotifications(page: import('@playwright/test').Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r3-02@example.test',
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
    async ({ userId, customers }) => {
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
        for (const customer of customers) tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { userId: USER_ID, customers: rows },
  );
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/thong-bao');
  await expect(page.getByText('3 tín hiệu', { exact: true })).toBeVisible();
}

test('R3-02 nhóm vẫn mở đúng từng khách và chuông giảm ngay khi ẩn một tín hiệu', async ({ page }) => {
  await openNotifications(page);

  for (const [index, customer] of rows.entries()) {
    const name = customer.full_name;
    await expect(page.getByRole('button', { name: `Mở hồ sơ ${name}` })).toBeVisible();
    await page.getByRole('button', { name: `Mở hồ sơ ${name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/ho-so/r3-02-customer-${index + 1}$`));
    await page.goto('/thong-bao');
  }

  const bell = page.getByRole('button', { name: 'Thông báo, 3 mục' });
  await expect(bell).toBeVisible();
  await page.getByRole('button', { name: `Ẩn tín hiệu Hệ thống của ${rows[0].full_name}` }).click();
  await expect(page.getByRole('button', { name: 'Thông báo, 2 mục' })).toBeVisible();
  await expect(page.getByText('2 tín hiệu', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('button', { name: 'Thông báo, 2 mục' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
