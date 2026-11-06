import { expect, type Page, test } from '@playwright/test';

// D-032 (Curtis 06/11): khách đang chăm cũng giao được; nút Giao khách (icon) ở đầu hồ sơ cạnh bậc/SLA/nhóm;
// sau khi giao (vẫn theo dõi), người giao vẫn ghi giùm cuộc gọi, tương tác, ghi chú — chỉ Gọi/Zalo/Hẹn khoá.
const USER = 'd032-user';
const CUSTOMER = 'd032-customer';
const DB = `crm_khach_hang__${encodeURIComponent(USER)}`;
const TEAM = [
  { user_id: USER, full_name: 'Curtis', email: 'curtis@example.test', is_admin: false, is_me: true },
  { user_id: 'd032-lan', full_name: 'Lan', email: 'lan@example.test', is_admin: false, is_me: false },
];

async function readCustomer(page: Page) {
  return page.evaluate(
    async ({ name, id }) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const get = db.transaction('customers').objectStore('customers').get(id);
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return row;
    },
    { name: DB, id: CUSTOMER },
  );
}

async function open(page: Page) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/team_list', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEAM) }),
  );
  await page.addInitScript(
    ({ uid, team }) => {
      const user = {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'curtis@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
      localStorage.setItem(`crm_team:${uid}`, JSON.stringify(team));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-d032-token',
          refresh_token: 'synthetic-d032-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    },
    { uid: USER, team: TEAM },
  );
  await page.goto('/');
  await page.evaluate(
    async ({ name, uid, id }) => {
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
        // Khách đang chăm, đã gọi 2 cuộc — vẫn giao được.
        tx.objectStore('customers').put({
          id,
          owner_id: uid,
          full_name: 'Khách Đang Chăm',
          phone: '0903200000',
          care_stage: 'Đang chăm sóc',
          care_stage_history: [{ stage: 'Đang chăm sóc', note: null, at: '2026-11-01T00:00:00.000Z' }],
          registered_at: '2026-11-01T00:00:00.000Z',
          qualified_at: '2026-11-01T00:00:00.000Z',
          call_attempts: [
            { at: '2026-11-02T02:00:00.000Z', result: 'talked', origin: 'manual' },
            { at: '2026-11-04T02:00:00.000Z', result: 'busy', origin: 'manual' },
          ],
          next_tasks: [],
          contact_prefs: {},
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: DB, uid: USER, id: CUSTOMER },
  );
  await page.goto(`/ho-so/${CUSTOMER}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Khách Đang Chăm' })).toBeVisible();
}

test('D-032: giao khách đang chăm từ hồ sơ, sau đó vẫn ghi giùm tương tác + cuộc gọi', async ({ page }) => {
  await open(page);
  const assign = page.getByRole('button', { name: 'Giao khách', exact: true });
  await expect(assign).toBeVisible();
  // Phương án A (Curtis 06/11): nút chữ "Giao" ở hàng đáy thẻ, cột phải; khách tiềm năng chỉ còn nút này.
  await expect(assign).toHaveText('Giao');
  await expect(page.getByRole('button', { name: 'Chuyển tiềm năng', exact: true })).toHaveCount(0);
  const stageBox = await page.getByRole('button', { name: /^Đổi bậc/ }).boundingBox();
  const assignBox = await assign.boundingBox();
  expect(assignBox?.y ?? 0).toBeGreaterThan(stageBox?.y ?? 0);

  await assign.click();
  await page.getByLabel('Người nhận khách').selectOption('d032-lan');
  await page.getByRole('button', { name: 'Xác nhận giao' }).click();
  await expect(page.getByLabel('Notifications (F8)').getByText('Đã giao cho Lan', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readCustomer(page)).owner_id).toBe('d032-lan');
  expect((await readCustomer(page)).followers).toEqual([USER]);

  // Người giao (đang theo dõi): Gọi/Zalo/Hẹn khoá, Ghi chú mở.
  const bar = page.getByRole('navigation', { name: 'Hành động nhanh' }).filter({ visible: true }).first();
  await expect(bar.getByRole('button', { name: 'Gọi' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Zalo' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Hẹn' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Giao khách', exact: true })).toHaveCount(0);

  // Ghi tương tác giùm.
  await bar.getByRole('button', { name: 'Ghi chú' }).click();
  await page.getByRole('button', { name: 'Đã gặp' }).click();
  await expect(page.getByText('Đã ghi cuộc gặp', { exact: true })).toBeVisible();
  await expect.poll(async () => ((await readCustomer(page)).interactions as unknown[] | undefined)?.length).toBe(1);

  // Ghi cuộc gọi giùm (hộp ghi chú vẫn mở, bấm Đã gọi ngay trong đó).
  await page.getByRole('button', { name: 'Đã gọi' }).click();
  await page.getByRole('radio', { name: 'Nói chuyện được' }).click();
  await page.getByRole('textbox', { name: 'Ghi chú cuộc gọi' }).fill('Ghi giùm Lan');
  const noNext = page.getByRole('checkbox', { name: 'Không hẹn gọi tiếp' });
  if (await noNext.count()) await noNext.check();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(async () => ((await readCustomer(page)).call_attempts as unknown[] | undefined)?.length).toBe(3);
  const row = await readCustomer(page);
  expect(row.owner_id).toBe('d032-lan');
  expect((row.call_attempts as { note?: string }[])[2]?.note).toBe('Ghi giùm Lan');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
