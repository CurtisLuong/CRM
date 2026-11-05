import { expect, type Page, test } from '@playwright/test';

const USER_ID = 'gn01-e2e-user';
const CUSTOMER_ID = 'gn01-trang';
const NOW = new Date('2026-11-05T03:00:00.000Z');

async function readLocal(page: Page) {
  return page.evaluate(
    async ({ userId, customerId }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['customers', 'queue'], 'readonly');
      const read = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [customer, queue] = await Promise.all([
        read(tx.objectStore('customers').get(customerId)) as Promise<Record<string, unknown>>,
        read(tx.objectStore('queue').getAll()) as Promise<Record<string, unknown>[]>,
      ]);
      db.close();
      return { customer, queue };
    },
    { userId: USER_ID, customerId: CUSTOMER_ID },
  );
}

async function seed(page: Page) {
  await page.clock.install({ time: NOW });
  // Chỉ tài nguyên local; mọi API đều giả, không gửi dữ liệu ra mạng.
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === 'localhost' || host === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Ngoại tuyến kiểm thử' }),
    }),
  );
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'gn01@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-11-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-gn01-token',
        refresh_token: 'synthetic-gn01-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, USER_ID);
  await page.goto('/');
  await page.evaluate(
    async ({ userId, customerId, at }) => {
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
        tx.objectStore('customers').put({
          id: customerId,
          owner_id: userId,
          full_name: 'Phạm Thu Trang',
          phone: '0901234567',
          gender: null,
          // Dùng nguồn khác Facebook để kiểm tra gợi ý áp dụng cho mọi khách.
          source: ['referral'],
          intake_method: 'manual',
          qualified_at: at,
          care_stage: 'Nuôi dài hạn',
          care_stage_updated_at: at,
          created_at: at,
          updated_at: at,
          projects: [],
          next_tasks: [],
          call_attempts: [],
          notes_manual: [],
          interactions: [],
          contact_prefs: { x_keep: true },
          x_future: { keep: true },
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { userId: USER_ID, customerId: CUSTOMER_ID, at: NOW.toISOString() },
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`GN-01: chỉ lưu giới tính sau một chạm, Zalo xưng chị Trang (${theme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await seed(page);
    const before = await readLocal(page);
    await page.goto(`/ho-so/${CUSTOMER_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Phạm Thu Trang' })).toBeVisible();
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    const suggestion = page.getByText('Nữ · đoán từ tên', { exact: true });
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toHaveClass(/text-ink-muted/);
    await expect(page.getByLabel('Giới tính')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Lưu Nữ', exact: true })).toBeVisible();
    expect(await readLocal(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await suggestion.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`gn01-gender-${theme}.png`) });

    // Mở Zalo khi chưa lưu cũng dùng gợi ý, nhưng không ghi khách/hàng đợi.
    await page.getByRole('button', { name: 'Zalo', exact: true }).click();
    const message = page.getByRole('textbox', { name: 'Nội dung tin nhắn' });
    await expect(message).toHaveValue(/chị Trang/);
    await expect(message).not.toHaveValue(/anh\/chị/);
    expect(await readLocal(page)).toEqual(before);
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();

    await page.getByRole('button', { name: 'Lưu Nữ', exact: true }).click();
    await expect(page.getByLabel('Giới tính')).toHaveValue('nữ');
    await expect(suggestion).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lưu Nữ', exact: true })).toHaveCount(0);
    const saved = await readLocal(page);
    expect(saved.customer).toMatchObject({
      gender: 'nữ',
      field_meta: { gender: { by: 'sale', confirmed: true } },
      contact_prefs: { x_keep: true },
      x_future: { keep: true },
    });
    expect(saved.queue).toHaveLength(1);
    expect(saved.queue[0]).toMatchObject({ type: 'update', recordId: CUSTOMER_ID, payload: { gender: 'nữ' } });

    await page.getByRole('button', { name: 'Zalo', exact: true }).click();
    await expect(message).toHaveValue(/chị Trang/);
    await expect(message).not.toHaveValue(/anh\/chị/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    await expect(page.getByLabel('Giới tính')).toHaveValue('nữ');
    await expect(suggestion).toHaveCount(0);
  });
}
