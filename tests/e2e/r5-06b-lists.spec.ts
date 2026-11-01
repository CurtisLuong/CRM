import { expect, test } from '@playwright/test';

const USER = 'r5-06b-e2e';

async function installAccount(page: import('@playwright/test').Page, customers: Record<string, unknown>[] = []) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/team_list', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const user = {
      id: 'r5-06b-e2e',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r5-06b@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: user.id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-r5-06b-token',
        refresh_token: 'synthetic-r5-06b-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  });
  await page.goto('/');
  await page.evaluate(async (rows) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent('r5-06b-e2e')}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
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
      for (const row of rows) tx.objectStore('customers').put(row);
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, customers);
}

const widths = [360, 1280];

test('Khách mới có ô lọc nhìn thấy được và danh sách rỗng có hành động', async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await installAccount(page, [
      {
        id: 'lead',
        owner_id: USER,
        full_name: 'Khách đầu vào',
        phone: '0901234567',
        care_stage: 'Đăng kí mới',
        call_attempts: [],
        next_tasks: [],
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
    ]);
    await page.goto('/khach-moi');
    const filter = page.getByRole('combobox', { name: 'Lọc khách' });
    await expect(filter).toBeVisible();
    await expect(page.locator('#lead-filter-compat')).toHaveCount(0);
    await filter.selectOption('dropped');
    await expect(page.getByRole('button', { name: 'Xoá lọc' })).toBeVisible();
    await page.getByRole('button', { name: 'Xoá lọc' }).click();
    await expect(page.getByText('Khách đầu vào')).toBeVisible();
  }
});

test('các danh sách rỗng có một hành động phù hợp', async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await installAccount(page);

    await page.goto('/khach-moi');
    await expect(page.getByRole('button', { name: 'Thêm khách' })).toBeVisible();

    await page.goto('/khach-hang/luu-tru');
    await expect(page.getByRole('button', { name: 'Mở danh sách khách' })).toBeVisible();

    await page.goto('/khach-hang/retarget');
    await expect(page.getByRole('button', { name: 'Đổi điều kiện' })).toBeVisible();

    await page.goto('/dong-nghiep');
    await expect(page.getByRole('button', { name: 'Tải lại' })).toBeVisible();
  }
});

test('retarget hiện lý do phù hợp ngay trên dòng khách', async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await installAccount(page, [
      {
        id: 'retarget-match',
        owner_id: USER,
        full_name: 'Khách phù hợp',
        phone: '0901111111',
        apt_type: '2N-2WC',
        projects: ['Dự án kiểm thử'],
        interests: [{ id: 'i1', project: 'Dự án kiểm thử', apt_type: '2N', status: 'open', timeline: '6 tháng' }],
        contact_prefs: { do_not_contact: false },
        next_tasks: [],
        call_attempts: [],
        interactions: [],
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-16T00:00:00.000Z',
      },
    ]);
    await page.goto('/khach-hang/retarget');
    await expect(page.getByText('Khách phù hợp', { exact: true })).toBeVisible();
    await expect(page.getByText(/Phù hợp vì:/)).toBeVisible();
    await expect(page.getByText(/Dự án kiểm thử/).last()).toBeVisible();
  }
});
