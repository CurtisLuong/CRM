import { expect, type Page, test } from '@playwright/test';

const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;

/** Phiên giả + Supabase giả (offline IndexedDB) như các spec khác. */
async function seedSession(page: Page, userId: string) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pf03@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pf03-token',
        refresh_token: 'synthetic-pf03-refresh',
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

// Lead vá sau review PF-03: lưu xong rời màn không bị hỏi "Bản nháp chưa lưu".
test('PF-03 Lead: lưu khách xong sang danh sách, không hỏi bỏ nháp', async ({ page }, testInfo) => {
  const userId = `pf03-saved-${testInfo.project.name}`;
  await seedSession(page, userId);
  await page.goto('/intake');
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.getByLabel('Họ tên *').fill('Khách Lưu Thẳng');
  await page.getByLabel('Số điện thoại *').fill('0911555666');
  await page.getByRole('button', { name: 'Lưu khách' }).click();
  await expect(page).toHaveURL(/\/khach-hang$/);
  await expect
    .poll(async () => (await readCustomers(page, userId)).find((row) => row.phone === '0911555666')?.full_name)
    .toBe('Khách Lưu Thẳng');
  expect(dialogs).toEqual([]);
});
