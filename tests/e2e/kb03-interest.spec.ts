import { expect, type Page, test } from '@playwright/test';

const USER_ID = 'kb03-user';
const NOW = new Date('2026-11-10T02:00:00Z');
const DB_NAME = `crm_khach_hang__${USER_ID}`;

async function open(page: Page, level?: number) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'kb03@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-11-09T01:00:00Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-kb03-token',
        refresh_token: 'synthetic-kb03-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, USER_ID);
  await page.goto('/');
  await page.evaluate(
    async ({ name, userId, level }) => {
      const request = indexedDB.open(name, 2);
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
          id: 'kb03-customer',
          owner_id: userId,
          full_name: 'Khách KB Ba',
          phone: '0900000311',
          care_stage: 'Đang chăm sóc',
          qualified_at: '2026-11-09T01:00:00Z',
          created_at: '2026-11-09T01:00:00Z',
          updated_at: '2026-11-09T01:00:00Z',
          care_stage_history: [{ stage: 'Đang chăm sóc', at: '2026-11-09T01:00:00Z' }],
          ...(level == null ? {} : { interest_level: level }),
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: DB_NAME, userId: USER_ID, level },
  );
  await page.goto('/ho-so/kb03-customer');
  await expect(page.getByRole('heading', { name: 'Khách KB Ba' }).first()).toBeVisible();
}

async function readCustomer(page: Page) {
  return page.evaluate(async (name) => {
    const request = indexedDB.open(name, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const customer = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const get = db.transaction('customers').objectStore('customers').get('kb03-customer');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return customer;
  }, DB_NAME);
}

for (const theme of ['light', 'dark'] as const) {
  test(`KB-03 ${theme}: thiếu số hiện Lạnh, thứ tự 4 bậc, chọn trùng không ghi`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    const known = page.getByRole('region', { name: 'Đã biết' });
    await known.getByRole('button', { name: 'Mức quan tâm: Lạnh' }).click();
    const choices = page.getByRole('group', { name: 'Mức quan tâm' });
    await expect(choices.getByRole('button')).toHaveText(['Lạnh', 'Ấm', 'Nóng', 'Nguội']);
    await choices.getByRole('button', { name: 'Lạnh', exact: true }).click();
    expect(await readCustomer(page)).not.toHaveProperty('interest_level');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test(`KB-03 ${theme}: Nóng 70 → Nuôi dài hạn hiện Lạnh và ghi 20`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page, 70);
    await expect(page.getByRole('button', { name: 'Mức quan tâm: Nóng' })).toBeVisible();
    await page.getByRole('button', { name: /^Đổi bậc · / }).click();
    const sheet = page.getByRole('dialog', { name: 'Đổi bậc khách' });
    await sheet.getByRole('radio', { name: 'Nuôi dài hạn' }).click();
    await sheet.getByRole('button', { name: 'Tiếp tục' }).click();
    await sheet.getByRole('button', { name: 'Xác nhận đổi bậc' }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(async () => (await readCustomer(page)).interest_level).toBe(20);
    await expect(page.getByRole('button', { name: 'Mức quan tâm: Lạnh' })).toBeVisible();
  });

  test(`KB-03 ${theme}: lưu trữ Nóng → 0; khôi phục từ danh sách → 20`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page, 70);
    await page.getByRole('button', { name: 'Lưu trữ khách', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Lưu trữ khách Khách KB Ba?' });
    await sheet.getByRole('combobox', { name: 'Lý do lưu trữ' }).selectOption('so_sai');
    await sheet.getByRole('button', { name: 'Lưu trữ khách', exact: true }).click();
    await expect.poll(async () => (await readCustomer(page)).interest_level).toBe(0);
    await expect(page.getByRole('region', { name: 'Đã biết' }).getByText('Nguội', { exact: true })).toBeVisible();
    await page.goto('/khach-hang/luu-tru');
    await page.getByRole('button', { name: 'Khôi phục Khách KB Ba', exact: true }).click();
    await expect.poll(async () => (await readCustomer(page)).interest_level).toBe(20);
    expect((await readCustomer(page)).archived_at).toBeNull();
    await page.goto('/ho-so/kb03-customer');
    await expect(page.getByRole('button', { name: 'Mức quan tâm: Lạnh' })).toBeVisible();
  });

  test(`KB-03 ${theme}: form mới không có mức quan tâm hay %, tick Đạt vẫn lưu 20`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    await page.goto('/intake');
    await expect(page.getByRole('heading', { name: 'Thêm khách mới' })).toBeVisible();
    await expect(page.getByText(/Mức quan tâm|%/)).toHaveCount(0);
    await page.getByRole('checkbox', { name: /Đã nói chuyện/ }).check();
    await expect(page.getByText(/Mức quan tâm|%/)).toHaveCount(0);
    await expect(page.getByRole('slider')).toHaveCount(0);
    await page.getByLabel('Họ tên *').fill('Khách Nhập Ba');
    await page.getByLabel('Số điện thoại *').fill('0900000322');
    await page.getByRole('button', { name: 'Lưu khách', exact: true }).click();
    await expect(page).toHaveURL(/\/khach-hang$/);
    const level = await page.evaluate(async (name) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      const rows = await new Promise<Record<string, unknown>[]>((resolve) => {
        const get = db.transaction('customers').objectStore('customers').getAll();
        get.onsuccess = () => resolve(get.result);
      });
      db.close();
      return rows.find((row) => row.phone === '0900000322')?.interest_level;
    }, DB_NAME);
    expect(level).toBe(20);
  });
}
