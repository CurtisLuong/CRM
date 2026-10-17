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
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        CallLog: {
          dial: async () => {
            const current = window as Window & { __dialCalls?: number };
            current.__dialCalls = (current.__dialCalls ?? 0) + 1;
          },
        },
      },
    };
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
        next_call_at: plusDays(3),
        next_call_end: new Date(Date.parse(plusDays(3)) + 60 * 60 * 1000).toISOString(),
        next_call_reason: 'Khách xin gọi lại',
        next_tasks: [
          { at: 'late', text: 'Gọi khách quá hạn', kind: 'call', due: yesterday.toISOString(), due_allday: true },
          { at: 'today', text: 'Gửi bảng giá', kind: 'docs', due: today.toISOString(), due_allday: true },
          { at: 'week', text: 'Hẹn xem căn', kind: 'visit', due: plusDays(4), side: 'customer' },
          { at: 'later', text: 'Chuẩn bị hồ sơ', kind: 'docs', due: plusDays(8) },
          { at: 'none', text: 'Nhắn tin hỏi thăm', kind: 'message' },
          { at: 'done', text: 'Đã gọi trước đây', kind: 'call', done_at: '2026-10-15T10:00:00.000Z' },
        ],
      });
      tx.objectStore('customers').put({
        id: 't37-e2e-disqualified',
        owner_id: userId,
        full_name: 'Khách đã loại',
        phone: '0901234568',
        disqualified_at: new Date().toISOString(),
        next_call_at: plusDays(1),
        next_tasks: [{ at: 'excluded', text: 'Không hiện', kind: 'docs', due: plusDays(1) }],
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
      await expect(page.getByText('Hẹn gọi · Khách xin gọi lại')).toBeVisible();
      await expect(page.getByText('Khách đã loại')).toHaveCount(0);

      await page.getByLabel('Lọc theo loại việc').selectOption('docs');
      await expect(page.getByText('Gửi bảng giá')).toBeVisible();
      await expect(page.getByText('Chuẩn bị hồ sơ')).toBeVisible();
      await expect(page.getByText('Hẹn xem căn')).toHaveCount(0);

      await page.getByLabel('Lọc theo loại việc').selectOption('call');
      await expect(page.getByText('Hẹn gọi · Khách xin gọi lại')).toBeVisible();
      await expect(page.getByText('Gửi bảng giá')).toHaveCount(0);
      await page.getByRole('button', { name: 'Gọi: Khách E2E T3.7' }).click();
      await page.waitForFunction(() => (window as Window & { __dialCalls?: number }).__dialCalls === 1);
      const appointmentState = await page.evaluate(async () => {
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
      expect(appointmentState.next_call_at).toBeTruthy();
      expect(appointmentState.next_tasks).toHaveLength(6);

      await page.getByLabel('Lọc theo loại việc').selectOption('docs');
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

    test('tạo lời hứa có key, chống trùng và dời giữ hạn gốc có thể hoàn tác', async ({ page }) => {
      await installTaskFixture(page);
      await page.goto('/cong-viec');
      const due = new Date();
      due.setDate(due.getDate() + 4);
      due.setHours(15, 0, 0, 0);
      const dueLocal = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}T15:00`;
      await page.getByRole('button', { name: 'Thêm lời hứa' }).click();
      await page.getByLabel('Khách hàng của lời hứa').selectOption('t37-e2e-customer');
      await page.getByLabel('Nội dung lời hứa').fill('Gửi bảng giá T4.2');
      await page.getByLabel('Loại lời hứa').selectOption('customer');
      await page.getByLabel('Hạn lời hứa').fill(dueLocal);
      await page.getByRole('button', { name: 'Lưu lời hứa' }).click();
      const item = page.locator('#main li').filter({ hasText: 'Gửi bảng giá T4.2' });
      await expect(item.getByText('Khách hẹn', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Thêm lời hứa' }).click();
      await page.getByLabel('Khách hàng của lời hứa').selectOption('t37-e2e-customer');
      await page.getByLabel('Nội dung lời hứa').fill('Gửi bảng giá T4.2');
      await page.getByLabel('Loại lời hứa').selectOption('customer');
      await page.getByLabel('Hạn lời hứa').fill(dueLocal);
      await page.getByRole('button', { name: 'Lưu lời hứa' }).click();
      await expect(page.getByText('Lời hứa đã có', { exact: true })).toBeVisible();

      const original = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('crm_khach_hang__t37-e2e-user', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const request = db.transaction('customers').objectStore('customers').get('t37-e2e-customer');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return (row.next_tasks as Record<string, unknown>[]).find((task) => task.text === 'Gửi bảng giá T4.2');
      });
      expect(original?.key).toEqual(expect.stringMatching(/^promise:/));
      expect(original?.side).toBe('customer');
      expect(original?.due).toBeTruthy();

      await item.getByRole('button', { name: 'Dời' }).click();
      const later = new Date(due);
      later.setDate(later.getDate() + 1);
      const laterLocal = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}T16:30`;
      await page.getByLabel('Hạn mới: Gửi bảng giá T4.2').fill(laterLocal);
      await page.getByLabel('Lý do dời: Gửi bảng giá T4.2').selectOption('Khách bận');
      await item.getByRole('button', { name: 'Lưu hạn mới' }).click();
      const snoozed = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('crm_khach_hang__t37-e2e-user', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const request = db.transaction('customers').objectStore('customers').get('t37-e2e-customer');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return (row.next_tasks as Record<string, unknown>[]).find((task) => task.text === 'Gửi bảng giá T4.2');
      });
      expect(snoozed?.due_original).toBe(original?.due);
      expect(snoozed?.snoozed_reason).toBe('Khách bận');
      expect(snoozed?.due).not.toBe(original?.due);
      await page.getByRole('button', { name: 'Hoàn tác' }).click();
      await expect
        .poll(async () =>
          page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open('crm_khach_hang__t37-e2e-user', 2);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
              const request = db.transaction('customers').objectStore('customers').get('t37-e2e-customer');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            db.close();
            const task = (row.next_tasks as Record<string, unknown>[]).find(
              (entry) => entry.text === 'Gửi bảng giá T4.2',
            );
            return task?.due;
          }),
        )
        .toBe(original?.due);
    });
  });
}
