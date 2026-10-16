import { expect, test } from '@playwright/test';

test('Khách mới mặc định Trong phễu và Đạt yêu cầu một lần nói chuyện được', async ({ page }) => {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const userId = 't34-e2e-user';
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
    const userId = 't34-e2e-user';
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 't34-lead',
        owner_id: userId,
        full_name: 'Khách mới E2E',
        phone: '0901234567',
        care_stage: 'Đăng kí mới',
        interest_level: 20,
        registered_at: '2026-10-16T08:00:00.000Z',
        created_at: '2026-10-16T08:00:00.000Z',
        updated_at: '2026-10-16T08:00:00.000Z',
        call_attempts: [{ at: '2026-10-16T08:30:00.000Z', result: 'talked', note: 'Đã trao đổi', x_unknown: 'keep' }],
        next_tasks: [],
        x_future: { keep: true },
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto('/khach-moi');
  await expect(page.locator('main').getByRole('heading', { name: 'Khách mới' })).toBeVisible();
  await expect(page.getByLabel('Lọc khách')).toHaveValue('open');
  await expect(page.getByText('Đăng ký mới')).toBeVisible();
  await page.getByRole('button', { name: /Khách mới E2E/ }).click();
  await expect(page.getByRole('heading', { name: 'Nhật ký gọi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đạt' })).toBeEnabled();
  await page.getByRole('button', { name: 'Đạt' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const request = indexedDB.open('crm_khach_hang__t34-e2e-user', 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const get = db.transaction('customers').objectStore('customers').get('t34-lead');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return row;
  });
  expect(saved).toMatchObject({
    care_stage: 'Đang chăm sóc',
    interest_level: 60,
    x_future: { keep: true },
    call_attempts: [{ result: 'talked', x_unknown: 'keep' }],
  });
  expect(saved.qualified_at).toBeTruthy();
});
