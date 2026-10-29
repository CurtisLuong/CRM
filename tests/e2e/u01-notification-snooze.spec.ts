import { expect, test } from '@playwright/test';

const USER_ID = 'u01-notification-snooze-user';
const NOW = new Date(2026, 9, 29, 10, 0);
const rows = ['Khách U01 A', 'Khách U01 B', 'Khách U01 C'].map((full_name, index) => ({
  id: `u01-customer-${index + 1}`,
  owner_id: USER_ID,
  full_name,
  phone: `091000000${index + 1}`,
  care_stage: 'Đăng kí mới',
  registered_at: new Date(2026, 9, 29, 8).toISOString(),
  created_at: new Date(2026, 9, 29, 8).toISOString(),
  updated_at: new Date(2026, 9, 29, 8).toISOString(),
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
      email: 'u01@example.test',
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

test('hoãn mặc định, hoàn tác, chọn 2 giờ và hiện lại; hỗ trợ màn hẹp và rộng', async ({ page }) => {
  await openNotifications(page);
  await expect(page.getByText('Ẩn tín hiệu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ẩn tín hiệu/ })).toHaveCount(0);

  const bell = page.getByRole('button', { name: 'Thông báo, 3 mục' });
  await page.getByRole('button', { name: `Tạm hoãn tín hiệu Hệ thống của ${rows[0].full_name}` }).click();
  await expect(page.getByRole('button', { name: 'Thông báo, 2 mục' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Đã hoãn đến 18:00' })).toBeVisible();
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page.getByRole('button', { name: 'Thông báo, 3 mục' })).toBeVisible();

  await page.getByRole('combobox', { name: `Chọn thời gian hoãn cho ${rows[0].full_name}` }).selectOption('2 giờ');
  await expect(page.getByRole('button', { name: 'Thông báo, 2 mục' })).toBeVisible();
  await page.clock.fastForward(2 * 60 * 60 * 1000);
  await expect(page.getByRole('button', { name: 'Thông báo, 3 mục' })).toBeVisible();
  await expect(bell).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('hoãn hàng loạt nhóm tín hiệu cùng loại', async ({ page }) => {
  await openNotifications(page);
  await page.getByRole('button', { name: 'Tạm hoãn nhóm tín hiệu Hệ thống' }).click();
  await expect(page.getByText('0 tín hiệu', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có thông báo cần xử lý')).toBeVisible();
});
