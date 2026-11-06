import { expect, test } from '@playwright/test';

// Curtis 03/11 — hồ sơ: nhóm dưới tên, Giá ước tính, hẹn gọi trong Việc tiếp theo, "Còn thiếu" bấm tới ô.
const USER_ID = 'p3-profile-user';
const NOW = new Date(2026, 10, 3, 9, 0);
const rows = [
  {
    id: 'p3-customer',
    owner_id: USER_ID,
    full_name: 'Chị Lan Hồ Sơ',
    phone: '0900000099',
    source: ['facebook_ads'],
    apt_area: 45,
    projects: ['Vin TC'],
    registered_at: new Date(2026, 10, 2, 8).toISOString(),
    created_at: new Date(2026, 10, 2, 8).toISOString(),
    updated_at: new Date(2026, 10, 2, 8).toISOString(),
    next_call_at: new Date(2026, 10, 3, 14).toISOString(),
    next_call_end: new Date(2026, 10, 3, 15).toISOString(),
    call_attempts: [],
    next_tasks: [],
  },
];

async function openProfile(page: import('@playwright/test').Page) {
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
      email: 'p3@example.test',
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
  await page.goto('/ho-so/p3-customer');
  await expect(page.getByRole('heading', { name: 'Chị Lan Hồ Sơ' }).first()).toBeVisible();
}

test('hồ sơ: nhóm dưới tên, hẹn gọi, giá ước tính, còn thiếu bấm tới ô', async ({ page }) => {
  await openProfile(page);
  const main = page.locator('#main');
  const header = main.locator('header').first();
  await expect(header.getByText('Khách mới', { exact: true })).toBeVisible();
  await expect(header.getByText(/Facebook/)).toHaveCount(0);

  const next = main.getByRole('region', { name: 'Việc tiếp theo' });
  await expect(next.getByText('Hẹn gọi lại')).toBeVisible();
  await expect(next.getByText(/Hôm nay 14:00–15:00/)).toBeVisible();

  await expect(page.getByLabel('Giá căn (tỷ)')).toHaveValue('2,25');
  await expect(main.getByText('45 m² × 50 triệu/m²')).toBeVisible();
  await expect(page.getByLabel('Tài chính sẵn có (VNĐ)')).toHaveCount(0);

  const known = main.getByRole('region', { name: 'Đã biết' });
  await known.getByRole('button', { name: 'Tài chính' }).click();
  await expect(page.getByRole('tab', { name: 'Trí nhớ' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Vốn hiện có')).toBeFocused();

  await known.getByRole('button', { name: 'Mua để' }).click();
  await expect(page.getByRole('tab', { name: /Nhu cầu/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Mục đích mua' })).toBeFocused();

  await known.getByRole('button', { name: 'Người quyết định' }).click();
  await expect(page.getByLabel('Tên người cùng quyết định')).toBeFocused();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
