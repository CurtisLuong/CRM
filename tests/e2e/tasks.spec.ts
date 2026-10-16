import { expect, test } from '@playwright/test';

async function installTaskFixture(page: import('@playwright/test').Page) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const userId = 't37-e2e-user';
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
    const userId = 't37-e2e-user';
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const plusDays = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      date.setHours(14, 0, 0, 0);
      return date.toISOString();
    };
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 't37-e2e-customer',
        owner_id: userId,
        full_name: 'Khách E2E T3.7',
        phone: '0901234567',
        care_stage: 'Đang chăm sóc',
        care_stage_history: [{ stage: 'Đang chăm sóc', note: null, at: '2026-10-01T00:00:00.000Z' }],
        registered_at: '2026-10-01T00:00:00.000Z',
        call_attempts: [],
        next_tasks: [
          { at: 'late', text: 'Gọi khách quá hạn', kind: 'call', due: yesterday.toISOString(), due_allday: true },
          { at: 'today', text: 'Gửi bảng giá', kind: 'docs', due: today.toISOString(), due_allday: true },
          { at: 'week', text: 'Hẹn xem căn', kind: 'visit', due: plusDays(4), side: 'customer' },
          { at: 'later', text: 'Chuẩn bị hồ sơ', kind: 'docs', due: plusDays(8) },
          { at: 'none', text: 'Nhắn tin hỏi thăm', kind: 'message' },
          { at: 'done', text: 'Đã gọi trước đây', kind: 'call', done_at: '2026-10-15T10:00:00.000Z' },
        ],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`công việc ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('nhóm hạn, lọc loại và cam kết; hoàn tất ghi history và có thể hoàn tác', async ({ page }) => {
      await installTaskFixture(page);
      await page.goto('/cong-viec');
      await expect(page.locator('#main').getByRole('heading', { name: 'Công việc', exact: true })).toBeVisible();
      for (const heading of ['Quá hạn', 'Hôm nay', '7 ngày tới', 'Sau đó', 'Chưa có hạn', 'Đã xong']) {
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      }
      await expect(page.locator('#main li').getByText('Em hứa', { exact: true }).first()).toBeVisible();
      await expect(page.locator('#main li').getByText('Khách hẹn', { exact: true })).toBeVisible();

      await page.getByLabel('Lọc theo loại việc').selectOption('docs');
      await expect(page.getByText('Gửi bảng giá')).toBeVisible();
      await expect(page.getByText('Chuẩn bị hồ sơ')).toBeVisible();
      await expect(page.getByText('Hẹn xem căn')).toHaveCount(0);

      await page.getByRole('button', { name: 'Hoàn tất: Gửi bảng giá' }).click();
      await expect(page.getByRole('heading', { name: 'Đã xong', exact: true })).toBeVisible();
      await expect(page.getByText(/^Đã xong · /)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeVisible();
      const done = await page.evaluate(async () => {
        const request = indexedDB.open('crm_khach_hang__t37-e2e-user', 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const get = db.transaction('customers').objectStore('customers').get('t37-e2e-customer');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        });
        db.close();
        return row;
      });
      expect(done.next_tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: 'Gửi bảng giá', done_at: expect.any(String), log_at: expect.any(String) }),
        ]),
      );
      expect(done.care_stage_history).toEqual(
        expect.arrayContaining([expect.objectContaining({ note: 'Xong việc: Gửi bảng giá' })]),
      );
      await page.getByRole('button', { name: 'Hoàn tác' }).click();
      await expect(page.getByRole('button', { name: 'Hoàn tất: Gửi bảng giá' })).toBeVisible();
    });

    test('bố cục vừa viewport điện thoại và desktop khi đăng xuất', async ({ page }) => {
      await page.goto('/cong-viec');
      await expect(page.locator('main h1')).toHaveText('Công việc');
      await expect(page.getByText(/Đăng nhập để xem các cam kết|Chưa cấu hình kết nối/)).toBeVisible();
      for (const width of [360, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 850 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    });
  });
}
