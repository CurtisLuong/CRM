import { expect, test } from '@playwright/test';

// KB-02: dữ liệu giả local, quyền chủ khách và ghi mức quan tâm theo trường.
const USER_ID = 'kb02-profile-user';
const NOW = new Date(2026, 10, 10, 9, 0);
const LONG =
  'gọi 11:50, 09.11.2026 (1p1s) — Nói chuyện được · hẹn gọi lại Thứ Năm 12/11, 09:00–10:00, khách cần thêm thời gian bàn với gia đình về khoản vay và tiến độ thanh toán';
const rows = [
  {
    id: 'kb02-customer',
    owner_id: USER_ID,
    interest_level: 20,
    full_name: 'Anh Văn KB',
    phone: '0900000188',
    source: ['facebook_ads'],
    purpose: 'Ở',
    apt_type: '3N-2WC',
    projects: ['Vin TC'],
    advanced: { capital: 1_000_000_000, pain_points: LONG },
    registered_at: new Date(2026, 10, 7, 8).toISOString(),
    created_at: new Date(2026, 10, 7, 8).toISOString(),
    updated_at: new Date(2026, 10, 9, 8).toISOString(),
    call_attempts: [
      { at: new Date(2026, 10, 9, 11, 50).toISOString(), result: 'talked', note: 'Khách hẹn xem nhà mẫu' },
    ],
    next_tasks: [{ at: new Date(2026, 10, 9, 12).toISOString(), text: 'Hồ sơ', kind: 'docs' }],
  },
];

async function openProfile(page: import('@playwright/test').Page, otherOwner = false) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Chỉ bảng Giỏ hàng có số đếm; bảng khách không có → app giữ khách đã seed trên máy.
      headers: /\/rest\/v1\/(buildings|units|project_apt_types|building_apt_types)\?/.test(route.request().url())
        ? { 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '*/0' }
        : {},
      body: '[]',
    }),
  );
  // Giỏ hàng: dự án có giá 50 triệu/m² → Giá ước tính 45 m² ≈ 2,25 tỷ.
  await page.route('http://127.0.0.1:54321/rest/v1/projects?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '0-0/1' },
      body: JSON.stringify([{ id: 'p1', name: 'Vin TC', typical_price_per_m2: 50000000, owner_id: USER_ID }]),
    }),
  );
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'kb02@example.test',
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
  }, USER_ID);
  await page.goto('/');
  await page.evaluate(
    async ({ userId, customers }) => {
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
        for (const customer of customers) tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { userId: USER_ID, customers: rows.map((row) => ({ ...row, owner_id: otherOwner ? 'kb02-colleague' : USER_ID })) },
  );
  await page.goto('/ho-so/kb02-customer');
  await expect(page.getByRole('heading', { name: 'Anh Văn KB' }).first()).toBeVisible();
}

async function readCustomer(page: import('@playwright/test').Page) {
  return page.evaluate(async (userId) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<{ interest_level: number; call_attempts: { result: string }[] }>(
      (resolve, reject) => {
        const get = db.transaction('customers').objectStore('customers').get('kb02-customer');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      },
    );
    db.close();
    return row;
  }, USER_ID);
}

for (const theme of ['light', 'dark'] as const) {
  test(`KB-02 ${theme}: Đã biết gọn, đổi mức quan tâm 2 chạm và Đăng ký chỉ xem`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openProfile(page);
    const known = page.getByRole('region', { name: 'Đã biết' });
    for (const label of ['Số lần gọi', 'Lần gọi cuối', 'Mức quan tâm']) {
      await expect(known.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(known.getByText('Lời hứa mở', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Việc tiếp theo' }).getByText('Em hứa', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('region', { name: 'Thông tin thêm' })).toHaveCount(0);
    await known.getByRole('button', { name: 'Mức quan tâm: Lạnh' }).click();
    const choices = page.getByRole('group', { name: 'Mức quan tâm' });
    await expect(choices.getByRole('button', { name: 'Lạnh', exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const button of await choices.getByRole('button').all()) {
      await expect.poll(async () => (await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await choices.getByRole('button', { name: 'Nóng', exact: true }).click();
    await expect(known.getByRole('button', { name: 'Mức quan tâm: Nóng' })).toBeVisible();
    await expect.poll(async () => (await readCustomer(page)).interest_level).toBe(60);
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    const more = page.getByRole('button', { name: /^Mở rộng \(\d+\)$/ });
    if (await more.count()) await more.click();
    await page.getByRole('button', { name: 'Nâng cao', exact: true }).click();
    const registration = page.getByRole('group', { name: 'Đăng ký' });
    // KB-04 (Curtis 10/11): Đăng ký thành ô sửa được; Cách nhập do máy ghi → chỉ xem.
    await expect(registration.getByLabel('Chiến dịch', { exact: true })).toBeEditable();
    await expect(registration.getByLabel('Cách nhập', { exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('KB-02: khách nhóm không bấm được mức quan tâm và không được chọn khi ghi giùm', async ({ page }) => {
  await openProfile(page, true);
  const known = page.getByRole('region', { name: 'Đã biết' });
  await expect(known.getByText('Lạnh', { exact: true })).toBeVisible();
  await expect(known.getByRole('button', { name: /^Mức quan tâm:/ })).toHaveCount(0);
  await page.goto('/thao-tac-nhanh');
  await page.getByRole('button', { name: 'Ghi tương tác', exact: true }).first().click();
  await page
    .getByRole('dialog', { name: /Ghi tương tác/ })
    .getByRole('button', { name: 'Đã gọi', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: /Kết quả cuộc gọi/ });
  await sheet.getByRole('radio', { name: 'Nói chuyện được' }).click();
  await expect(sheet.getByRole('group', { name: 'Mức quan tâm' })).toHaveCount(0);
});

test('KB-02: nói chuyện được lưu Nóng cùng cuộc gọi; Hoàn tác trả mức cũ và giữ nhật ký cuộc gọi', async ({ page }) => {
  await openProfile(page);
  await page.goto('/thao-tac-nhanh');
  await page.getByRole('button', { name: 'Ghi tương tác', exact: true }).first().click();
  await page
    .getByRole('dialog', { name: /Ghi tương tác/ })
    .getByRole('button', { name: 'Đã gọi', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: /Kết quả cuộc gọi/ });
  await sheet.getByRole('radio', { name: 'Không nghe', exact: true }).click();
  await expect(sheet.getByRole('group', { name: 'Mức quan tâm' })).toHaveCount(0);
  await sheet.getByRole('radio', { name: 'Nói chuyện được' }).click();
  await sheet.getByRole('button', { name: 'Nóng', exact: true }).click();
  await sheet.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await readCustomer(page)).interest_level).toBe(60);
  const saved = await readCustomer(page);
  expect(saved.call_attempts).toHaveLength(2);
  expect(saved.call_attempts.at(-1)?.result).toBe('talked');
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect.poll(async () => (await readCustomer(page)).interest_level).toBe(20);
  expect((await readCustomer(page)).call_attempts).toHaveLength(2);
});
