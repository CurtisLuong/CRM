import { expect, test } from '@playwright/test';

test('Ghi chú → Đã gọi → kết quả được lưu vào nhật ký cuộc gọi', async ({ page }) => {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const userId = 'pc02-e2e-user';
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
  await page.evaluate(async () => {
    const userId = 'pc02-e2e-user';
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('customers'))
          database.createObjectStore('customers', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('queue'))
          database.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 'pc02-e2e-customer',
        owner_id: userId,
        full_name: 'Khách PC-02',
        phone: '0901234567',
        qualified_at: '2026-10-01T03:00:00.000Z',
        care_stage: 'Đang chăm sóc',
        registered_at: '2026-10-01T03:00:00.000Z',
        created_at: '2026-10-01T03:00:00.000Z',
        updated_at: '2026-10-01T03:00:00.000Z',
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

  await page.goto('/thao-tac-nhanh');
  await expect(page.getByRole('heading', { name: 'Khách PC-02' })).toBeVisible();
  await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
  await page.getByRole('button', { name: 'Đã gọi', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Kết quả cuộc gọi/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Không nghe / không liên lạc' }).click();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();

  await expect(page.getByRole('region', { name: 'Nhật ký cuộc gọi Khách PC-02' })).toContainText('Không nghe máy');
  const attempts = await page.evaluate(async () => {
    const request = indexedDB.open('crm_khach_hang__pc02-e2e-user', 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<{ call_attempts: Array<{ result: string }> }>((resolve, reject) => {
      const get = db.transaction('customers').objectStore('customers').get('pc02-e2e-customer');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return row.call_attempts;
  });
  expect(attempts).toMatchObject([{ result: 'no_answer' }]);
});
