import { expect, type Page, test } from '@playwright/test';

const userId = 'pc03-offline-user';
const customerId = 'pc03-offline-customer';
const dbName = `crm_khach_hang__${encodeURIComponent(userId)}`;

async function customerFromStore(page: Page) {
  return page.evaluate(async (name) => {
    const request = indexedDB.open(name, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const get = db.transaction('customers', 'readonly').objectStore('customers').get('pc03-offline-customer');
      get.onsuccess = () => resolve(get.result as Record<string, unknown> | undefined);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return row;
  }, dbName);
}

test('lưu trữ khi ngoại tuyến ghi ngay vào bản local và hàng đợi', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'offline@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-offline-token',
        refresh_token: 'synthetic-offline-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ name, ownerId, id }) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        tx.objectStore('customers').put({
          id,
          owner_id: ownerId,
          full_name: 'Khách ngoại tuyến',
          phone: '0909000111',
          care_stage: 'Đang chăm sóc',
          care_stage_history: [{ stage: 'Đang chăm sóc', at: '2026-10-20T02:00:00.000Z' }],
          interactions: [{ kind: 'sent', channel: 'zalo', at: '2026-10-21T02:00:00.000Z', by: ownerId }],
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: dbName, ownerId: userId, id: customerId },
  );
  await page.goto(`/ho-so/${customerId}`);
  await expect(page.getByRole('heading', { name: 'Khách ngoại tuyến' })).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Lưu trữ khách…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lưu trữ khách Khách ngoại tuyến?' });
  await dialog.getByRole('combobox', { name: 'Lý do lưu trữ' }).selectOption('so_sai');
  await dialog.getByRole('button', { name: 'Lưu trữ khách', exact: true }).click();
  await expect(page.getByText(/Khách đã lưu trữ ngày/)).toBeVisible();
  const saved = await customerFromStore(page);
  expect(saved?.archived_at).toEqual(expect.any(String));
  expect(saved?.interactions).toEqual([
    expect.objectContaining({ kind: 'archived', reason: 'so_sai', channel: 'other' }),
    expect.objectContaining({ kind: 'sent' }),
  ]);
});
