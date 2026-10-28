import { expect, type Page, test } from '@playwright/test';

const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;

async function seedSession(page: Page, userId: string) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r5-01b@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-r5-01b-token',
        refresh_token: 'synthetic-r5-01b-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
}

async function readCustomers(page: Page, userId: string) {
  return page.evaluate(async (name) => {
    const request = indexedDB.open(name, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const get = db.transaction('customers', 'readonly').objectStore('customers').getAll();
      get.onsuccess = () => resolve(get.result as Record<string, unknown>[]);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return rows;
  }, dbName(userId));
}

async function seedCustomer(page: Page, userId: string, customerId: string) {
  await page.evaluate(
    async ({ uid, id }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        tx.objectStore('customers').put({
          id,
          owner_id: uid,
          full_name: 'Nguyễn Thị Ngày Sinh',
          phone: '0911222333',
          dob: '--05-12',
          source: ['facebook_ads'],
          projects: [],
          next_tasks: [],
          call_attempts: [],
          notes_manual: [],
          created_at: '2026-10-10T00:00:00.000Z',
          updated_at: '2026-10-10T00:00:00.000Z',
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, id: customerId },
  );
}

test('R5-01b: nút phụ trong form không tạo khách trên mobile và desktop', async ({ page }, testInfo) => {
  const userId = `r5-01b-buttons-${testInfo.project.name}`;
  await seedSession(page, userId);
  await page.goto('/intake');
  await page.getByLabel('Họ tên *').fill('Khách thử nút phụ');
  await page.getByLabel('Số điện thoại *').fill('0911888777');

  const countBefore = (await readCustomers(page, userId)).length;
  const auxiliaryButtons = page.locator('form button:not([type="submit"])');
  await expect(auxiliaryButtons).not.toHaveCount(0);
  expect(
    await auxiliaryButtons.evaluateAll((buttons) =>
      buttons.every((button) => button.getAttribute('type') === 'button'),
    ),
  ).toBe(true);

  await page.getByRole('button', { name: 'Nhập từ ảnh' }).click();
  const more = page.getByRole('button', { name: 'Thêm thông tin' });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await page.getByLabel('Ghi chú mới').fill('Ghi chú thử');
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await page.getByRole('button', { name: 'Xoá', exact: true }).click();

  expect((await readCustomers(page, userId)).length).toBe(countBefore);
});

test('R5-01b: lưu hồ sơ giữ nguyên ngày sinh chỉ có tháng và ngày', async ({ page }, testInfo) => {
  const userId = `r5-01b-dob-${testInfo.project.name}`;
  const customerId = `r5-01b-customer-${testInfo.project.name}`;
  await seedSession(page, userId);
  await seedCustomer(page, userId, customerId);
  await page.goto(`/intake/${customerId}`);

  await page.getByRole('button', { name: /Thêm thông tin/ }).click();
  await expect(page.getByLabel('Ngày sinh (ngày/tháng/năm)')).toHaveValue('12/05');
  await page.getByRole('button', { name: 'Lưu khách' }).click();

  await expect(page).toHaveURL(/\/khach-hang$/);
  await expect
    .poll(async () => (await readCustomers(page, userId)).find((row) => row.id === customerId)?.dob)
    .toBe('--05-12');
});

test('R5-01b: mở khách cũ không gửi form và không tạo khách', async ({ page }, testInfo) => {
  const userId = `r5-01b-existing-${testInfo.project.name}`;
  const customerId = `r5-01b-existing-customer-${testInfo.project.name}`;
  await seedSession(page, userId);
  await seedCustomer(page, userId, customerId);
  await page.goto('/intake');
  await page.getByLabel('Họ tên *').fill('Khách khác');
  await page.getByLabel('Số điện thoại *').fill('0911222333');

  const countBefore = (await readCustomers(page, userId)).length;
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Mở khách cũ' }).click();
  await expect(page).toHaveURL(new RegExp(`/khach-hang/${customerId}$`));
  expect((await readCustomers(page, userId)).length).toBe(countBefore);
});

test('R5-01b: Huỷ không gửi form và không tạo khách', async ({ page }, testInfo) => {
  const userId = `r5-01b-cancel-${testInfo.project.name}`;
  await seedSession(page, userId);
  await page.goto('/intake');
  await page.getByLabel('Họ tên *').fill('Khách huỷ');
  await page.getByLabel('Số điện thoại *').fill('0911777666');

  const countBefore = (await readCustomers(page, userId)).length;
  await page.getByRole('button', { name: 'Huỷ', exact: true }).click();
  await expect(page).not.toHaveURL(/\/intake/);
  expect((await readCustomers(page, userId)).length).toBe(countBefore);
});
