import { expect, test } from '@playwright/test';

const USER = 't310-e2e-user';
const TEAM = [
  { user_id: USER, full_name: 'Curtis thử nghiệm', email: 'curtis@example.test', is_admin: true, is_me: true },
  { user_id: 't310-recipient', full_name: 'Lan', email: 'lan@example.test', is_admin: false, is_me: false },
];

async function installFixture(page: import('@playwright/test').Page) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/team_list', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEAM) }),
  );
  await page.addInitScript(() => {
    const user = {
      id: 't310-e2e-user',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'curtis@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: user.id, email: user.email }));
    localStorage.setItem(
      'crm_team:t310-e2e-user',
      JSON.stringify([
        { user_id: user.id, full_name: 'Curtis thử nghiệm', email: user.email, is_admin: true, is_me: true },
        { user_id: 't310-recipient', full_name: 'Lan', email: 'lan@example.test', is_admin: false, is_me: false },
      ]),
    );
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-t310-token',
        refresh_token: 'synthetic-t310-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent('t310-e2e-user')}`, 2);
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
        id: 't310-e2e-customer',
        owner_id: 't310-e2e-user',
        full_name: 'Khách E2E Nhóm',
        phone: '0903100000',
        care_stage: 'Đang chăm sóc',
        care_stage_history: [{ stage: 'Đang chăm sóc', note: null, at: '2026-10-01T00:00:00.000Z' }],
        registered_at: '2026-10-01T00:00:00.000Z',
        qualified_at: '2026-10-01T00:00:00.000Z',
        call_attempts: [],
        next_tasks: [],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
}

test('admin can manage team and a server-rejected assignment rolls back in local storage', async ({ page }) => {
  await installFixture(page);
  let addBody = '';
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/team_add', async (route) => {
    addBody = route.request().postData() || '';
    await route.fulfill({ status: 200, contentType: 'application/json', body: '"added"' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/customers**', async (route) => {
    if (route.request().method() === 'PATCH' && route.request().postData()?.includes('t310-recipient')) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto('/dong-nghiep');
  await expect(page.locator('#main').getByRole('heading', { name: 'Đồng nghiệp', exact: true })).toBeVisible();
  await expect(page.getByText('Curtis thử nghiệm')).toBeVisible();
  await page.getByLabel('Email đồng nghiệp').fill('new@example.test');
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect.poll(() => addBody).toContain('new@example.test');

  await page.goto('/khach-hang');
  await page.getByText('Khách E2E Nhóm', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Giao khách' }).click();
  await page.getByLabel('Người nhận khách').selectOption('t310-recipient');
  await page.getByLabel('Ghi chú giao khách').fill('Hẹn xem nhà mẫu thứ 7');
  await page.getByRole('button', { name: 'Xác nhận giao' }).click();
  await expect(page.getByLabel('Notifications (F8)').getByText('Đã giao cho Lan', { exact: true })).toBeVisible();
  await expect(
    page
      .getByLabel('Notifications (F8)')
      .getByText('Không giao được: người nhận đã có khách trùng số điện thoại trong danh sách của họ', { exact: true }),
  ).toBeVisible();

  const result = await page.evaluate(async () => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent('t310-e2e-user')}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const customer = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const get = db.transaction('customers').objectStore('customers').get('t310-e2e-customer');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return customer;
  });
  expect(result.owner_id).toBe(USER);
  expect(result).not.toHaveProperty('followers');
  expect(result).not.toHaveProperty('notes_manual');
  expect(result.care_stage).toBe('Đang chăm sóc');
  expect(result.care_stage_updated_at).toBeUndefined();
  expect(result.care_stage_history).toEqual([{ stage: 'Đang chăm sóc', note: null, at: '2026-10-01T00:00:00.000Z' }]);
});
