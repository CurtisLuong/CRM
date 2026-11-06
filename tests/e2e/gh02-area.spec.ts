import { expect, test } from '@playwright/test';

// GH-02 — diện tích kế thừa chỉ hiển thị, khách ghi đè rồi xoá để kế thừa lại.
const USER_ID = 'gh02-profile-user';
const NOW = new Date(2026, 10, 3, 9, 0);
const rows = [
  {
    id: 'gh02-customer',
    owner_id: USER_ID,
    full_name: 'Chị Lan Hồ Sơ',
    phone: '0900000099',
    source: ['facebook_ads'],
    apt_type: '2N',
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
  // Dữ liệu Giỏ hàng giả; mọi API đều bị chặn và trả dữ liệu tại chỗ.
  await page.route('http://127.0.0.1:54321/rest/v1/projects?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '0-0/1' },
      body: JSON.stringify([{ id: 'p1', name: 'Vin TC', typical_price_per_m2: 25000000, owner_id: USER_ID }]),
    }),
  );
  await page.route('http://127.0.0.1:54321/rest/v1/project_apt_types?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '0-0/1' },
      body: JSON.stringify([{ id: 't1', project_id: 'p1', apt_type: '2N', typical_area_m2: 60 }]),
    }),
  );
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'gh02@example.test',
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
  await page.goto('/ho-so/gh02-customer');
  await expect(page.getByRole('heading', { name: 'Chị Lan Hồ Sơ' }).first()).toBeVisible();
}

async function readLocal(page: import('@playwright/test').Page) {
  return page.evaluate(async (userId) => {
    const open = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<{ customers: Record<string, unknown>[]; queue: unknown[] }>((resolve, reject) => {
        const tx = db.transaction(['customers', 'queue'], 'readonly');
        const customers = tx.objectStore('customers').getAll();
        const queue = tx.objectStore('queue').getAll();
        tx.oncomplete = () => resolve({ customers: customers.result, queue: queue.result });
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, USER_ID);
}

for (const theme of ['light', 'dark'] as const) {
  test(`diện tích Giỏ hàng → số riêng → xoá về kế thừa (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openProfile(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const area = page.getByLabel('Diện tích (m²)', { exact: true });
    // 06/11: Giá ước tính thành ô Giá căn (tỷ), điền sẵn ước tính = Giá dự kiến (thuần + VAT 5% + KPBT 2%):
    // 1,5 tỷ thuần → 1,605; 1,125 → 1,204.
    const estimate = page.getByLabel('Giá căn (tỷ)', { exact: true });
    await expect(estimate).toHaveValue('1,605');
    await expect(area).toHaveValue('');
    await expect(area).toHaveAttribute('placeholder', '60');
    await expect(page.getByText('60 m² · theo Giỏ hàng', { exact: true })).toBeVisible();
    await expect(page.getByText('Ước tính · 60 m² × 25 triệu/m² + VAT 5% + KPBT 2%', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở rộng (5)', exact: true })).toBeVisible();

    // Mở hồ sơ và chỉ chạm/rời ô không được ghi khách hoặc tạo queue.
    expect(await readLocal(page)).toEqual({ customers: rows, queue: [] });
    await area.focus();
    await area.blur();
    expect(await readLocal(page)).toEqual({ customers: rows, queue: [] });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await area.fill('45');
    await area.blur();
    await expect(estimate).toHaveValue('1,204');
    await expect(page.getByText('60 m² · theo Giỏ hàng', { exact: true })).toHaveCount(0);
    expect((await readLocal(page)).customers[0].apt_area).toBe(45);
    await page.reload();
    await expect(area).toHaveValue('45');
    await expect(estimate).toHaveValue('1,204');

    await area.fill('');
    await area.blur();
    await expect(estimate).toHaveValue('1,605');
    await expect(page.getByText('60 m² · theo Giỏ hàng', { exact: true })).toBeVisible();
    expect((await readLocal(page)).customers[0].apt_area).toBeNull();
    await page.reload();
    await expect(area).toHaveValue('');
    await expect(area).toHaveAttribute('placeholder', '60');
    await expect(estimate).toHaveValue('1,605');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
