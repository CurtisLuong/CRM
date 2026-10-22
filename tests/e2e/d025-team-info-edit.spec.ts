import { expect, type Page, test } from '@playwright/test';

// D-025 (Curtis duyệt 2026-10-22): hồ sơ khách đồng nghiệp — sửa được thông tin + thêm ghi chú;
// gọi, Zalo, hẹn, đổi bậc vẫn khoá. Giờ cố định, dữ liệu giả, Supabase giả 127.0.0.1.
const userId = 'd025-e2e-user';
const NOW = new Date(2026, 9, 22, 9, 30);

const colleague = {
  id: 'd025-colleague',
  owner_id: 'd025-colleague-owner',
  followers: [userId],
  full_name: 'Phạm Văn Khách Nhóm',
  phone: '0912345678',
  care_stage: 'Đang chăm sóc',
  qualified_at: '2026-10-01T02:00:00.000Z',
  care_stage_updated_at: '2026-10-10T02:00:00.000Z',
  registered_at: '2026-10-01T02:00:00.000Z',
  created_at: '2026-10-01T02:00:00.000Z',
  updated_at: '2026-10-20T02:00:00.000Z',
  income: '20 triệu',
  x_future: { kept: true },
  notes_manual: [],
  next_tasks: [],
};

async function seed(page: Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'd025@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
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
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, rows }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
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
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, rows: [colleague] },
  );
}

async function readState(page: Page) {
  return page.evaluate(
    async ({ name, id }) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['customers', 'queue'], 'readonly');
      const row = await new Promise<Record<string, unknown>>((resolve) => {
        const get = tx.objectStore('customers').get(id);
        get.onsuccess = () => resolve(get.result);
      });
      const queue = await new Promise<{ payload?: Record<string, unknown> }[]>((resolve) => {
        const all = tx.objectStore('queue').getAll();
        all.onsuccess = () => resolve(all.result);
      });
      db.close();
      return { row, queue };
    },
    { name: `crm_khach_hang__${encodeURIComponent(userId)}`, id: colleague.id },
  );
}

test('D-025: hồ sơ khách nhóm sửa được thông tin, việc chăm sóc vẫn khoá', async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().includes('/rest/v1/customers'))
      patches.push(JSON.parse(request.postData() || '{}'));
  });
  await seed(page);
  await page.goto(`/ho-so/${colleague.id}`);
  await expect(page.getByRole('heading', { level: 1, name: colleague.full_name })).toBeVisible();
  await expect(page.getByText('Khách nhóm · sửa thông tin')).toBeVisible();
  await expect(page.getByText('Chỉ xem', { exact: true })).toHaveCount(0);

  // Việc chăm sóc vẫn của người phụ trách.
  await expect(page.getByRole('button', { name: /Đổi bậc/ })).toBeDisabled();
  for (const name of ['Gọi', 'Zalo', 'Hẹn'])
    await expect(page.getByRole('button', { name, exact: true }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ghi chú', exact: true }).first()).toBeEnabled();

  // Sửa thông tin: ghi local + xếp hàng đúng cột, giữ trường lạ.
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();
  const income = page.getByLabel('Thu nhập');
  await expect(income).toBeEnabled();
  await income.fill('35 triệu');
  await income.blur();
  await expect.poll(async () => (await readState(page)).row.income).toBe('35 triệu');
  const { row } = await readState(page);
  expect(row).toMatchObject({ owner_id: colleague.owner_id, care_stage: 'Đang chăm sóc', x_future: { kept: true } });
  // Gửi lên server đúng cột thông tin (server chặn cột khác — SQL/v2/010).
  await expect
    .poll(() => patches.map((body) => Object.keys(body).sort()))
    .toEqual([['field_meta', 'income', 'updated_at']]);

  const w = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.vw);
});
