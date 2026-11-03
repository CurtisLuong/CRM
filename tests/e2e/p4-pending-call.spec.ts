import { expect, test } from '@playwright/test';

// Curtis 03/11 — "Cuộc gọi chưa ghi chú": ghi kết quả phải gắn vào cuộc gọi đang chờ (không thêm cuộc mới),
// và cuộc chờ hiện trong "Việc tiếp theo" của hồ sơ.
const USER_ID = 'p4-pending-user';
const NOW = new Date(2026, 10, 3, 15, 0);
const PENDING_AT = new Date(2026, 10, 3, 14, 30).toISOString();
const rows = [
  {
    id: 'p4-customer',
    owner_id: USER_ID,
    full_name: 'Anh Kiên Chờ Ghi',
    phone: '0900000088',
    qualified_at: new Date(2026, 9, 20).toISOString(),
    care_stage: 'Đang chăm sóc',
    registered_at: new Date(2026, 9, 20, 8).toISOString(),
    created_at: new Date(2026, 9, 20, 8).toISOString(),
    updated_at: new Date(2026, 10, 3, 14, 31).toISOString(),
    call_attempts: [{ at: PENDING_AT, result: null, note: null, duration: 45, origin: 'device', device_id: 'd1' }],
    next_tasks: [],
  },
];

async function callAttempts(page: import('@playwright/test').Page) {
  return page.evaluate(async (userId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<{ call_attempts?: { at: string; result: string | null }[] }>((resolve, reject) => {
      const get = db.transaction('customers').objectStore('customers').get('p4-customer');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return row.call_attempts ?? [];
  }, USER_ID);
}

async function recordTalked(page: import('@playwright/test').Page) {
  const sheet = page.getByRole('dialog', { name: 'Kết quả cuộc gọi · Anh Kiên Chờ Ghi' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('radio', { name: 'Nói chuyện được', exact: true }).click();
  const none = sheet.getByRole('radio', { name: /Không hẹn gọi tiếp/ });
  if (await none.count()) await none.click();
  await sheet.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

async function seed(page: import('@playwright/test').Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Chỉ bảng Giỏ hàng có số đếm; bảng khách không có → app giữ khách đã seed trên máy.
      headers: /\/rest\/v1\/(buildings|units|project_apt_types|building_apt_types)\?/.test(route.request().url())
        ? { 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '*/0' }
        : {},
      body: '[]',
    }),
  );
  // Giỏ hàng: dự án có giá 50 triệu/m² → Giá ước tính 45 m² ≈ 2,25 tỷ.
  await page.route('http://127.0.0.1:54321/rest/v1/projects?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '0-0/1' },
      body: JSON.stringify([{ id: 'p1', name: 'Vin TC', typical_price_per_m2: 50000000, owner_id: USER_ID }]),
    }),
  );
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'p4@example.test',
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
}

test('Hôm nay: Ghi kết quả gắn vào cuộc đang chờ → thẻ biến mất, không thêm cuộc gọi', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const card = page.getByRole('button', { name: /^Ghi kết quả Anh Kiên Chờ Ghi/ });
  await expect(card).toBeVisible();
  await card.click();
  await recordTalked(page);

  await expect(page.getByRole('button', { name: /^Ghi kết quả Anh Kiên Chờ Ghi/ })).toHaveCount(0);
  const attempts = await callAttempts(page);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ at: PENDING_AT, result: 'talked' });
});

test('Hồ sơ: cuộc chưa ghi kết quả nằm trong Việc tiếp theo và ghi được tại chỗ', async ({ page }) => {
  await seed(page);
  await page.goto('/ho-so/p4-customer');
  const next = page.locator('#main').getByRole('region', { name: 'Việc tiếp theo' });
  await expect(next.getByText('Cuộc gọi chưa ghi kết quả')).toBeVisible();
  await expect(next.getByText(/Hôm nay 14:30 · 45s/)).toBeVisible();
  await next.getByRole('button', { name: /^Ghi kết quả cuộc gọi/ }).click();
  await recordTalked(page);

  await expect(next.getByText('Cuộc gọi chưa ghi kết quả')).toHaveCount(0);
  const attempts = await callAttempts(page);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ at: PENDING_AT, result: 'talked' });
});
