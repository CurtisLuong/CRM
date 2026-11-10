import { expect, test } from '@playwright/test';

// KB-04: dữ liệu giả local, quyền chủ khách và ghi mức quan tâm theo trường.
const USER_ID = 'kb04-profile-user';
const NOW = new Date(2026, 10, 10, 9, 0);
const LONG =
  'gọi 11:50, 09.11.2026 (1p1s) — Nói chuyện được · hẹn gọi lại Thứ Năm 12/11, 09:00–10:00, khách cần thêm thời gian bàn với gia đình về khoản vay và tiến độ thanh toán';
const rows = [
  {
    id: 'kb04-customer',
    owner_id: USER_ID,
    interest_level: 20,
    full_name: 'Anh Văn KB',
    phone: '0900000188',
    source: ['facebook_ads', 'legacy_unknown'],
    campaign: 'Đợt cũ',
    notes: { text: 'Ghi chú cũ', unknown: 'giữ nguyên' },
    custom_unknown: { keep: true },
    intake_method: 'manual', // KB-04: khách thật luôn có cách nhập; ô chỉ xem
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
      email: 'kb04@example.test',
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
    { userId: USER_ID, customers: rows.map((row) => ({ ...row, owner_id: otherOwner ? 'kb04-colleague' : USER_ID })) },
  );
  await page.goto('/ho-so/kb04-customer');
  await expect(page.getByRole('heading', { name: 'Anh Văn KB' }).first()).toBeVisible();
}

async function readCustomer(page: import('@playwright/test').Page) {
  return page.evaluate(async (userId) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<(typeof rows)[number]>((resolve, reject) => {
      const get = db.transaction('customers').objectStore('customers').get('kb04-customer');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return row;
  }, USER_ID);
}

for (const theme of ['light', 'dark'] as const) {
  test(`KB-04 ${theme}: Đăng ký có khung, sửa theo trường và không cuộn ngang`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openProfile(page);
    await expect(page.getByRole('region', { name: 'Đã biết' }).getByText(/Vướng mắc/)).toHaveCount(0);
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    const more = page.getByRole('button', { name: /^Mở rộng \(\d+\)$/ });
    if (await more.count()) await more.click();
    await page.getByRole('button', { name: 'Nâng cao', exact: true }).click();
    const registration = page.getByRole('group', { name: 'Đăng ký' });
    const controls = ['Nguồn', 'Chiến dịch', 'Cách nhập'].map((label) =>
      registration.getByLabel(label, { exact: true }),
    );
    for (const control of controls) {
      await expect(control).toBeVisible();
      const border = await control.evaluate((el) => {
        const styles = [getComputedStyle(el), getComputedStyle(el.parentElement ?? el)];
        return styles.some((style) => parseFloat(style.borderTopWidth) >= 1 && style.borderTopStyle === 'solid');
      });
      expect(border).toBe(true);
    }
    if (page.viewportSize()?.width === 1280) {
      const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
      expect(
        Math.max(...boxes.map((box) => box?.y ?? Number.NaN)) - Math.min(...boxes.map((box) => box?.y ?? Number.NaN)),
      ).toBeLessThanOrEqual(2);
    }
    await expect(registration.getByLabel('Cách nhập', { exact: true })).toBeDisabled();
    await expect(registration.getByLabel('Cách nhập', { exact: true })).toHaveValue('Nhập tay');
    await expect(registration.getByLabel('Ghi chú đăng ký')).toHaveValue('Ghi chú cũ');
    await expect(registration.getByLabel('Ngày đăng ký')).toHaveValue('08:00 07/11/2026');
    const before = await readCustomer(page);
    await registration.getByLabel('Chiến dịch', { exact: true }).fill('Chiến dịch đã sửa');
    await registration.getByLabel('Chiến dịch', { exact: true }).blur();
    await expect.poll(async () => (await readCustomer(page)).campaign).toBe('Chiến dịch đã sửa');
    const after = await readCustomer(page);
    const { campaign: _oldCampaign, updated_at: _oldUpdated, ...beforeOther } = before;
    const { campaign: _newCampaign, updated_at: _newUpdated, ...afterOther } = after;
    expect(afterOther).toEqual(beforeOther);
    await registration.getByLabel('Nguồn', { exact: true }).selectOption('website');
    await expect
      .poll(async () => (await readCustomer(page)).source)
      .toEqual(['website', 'facebook_ads', 'legacy_unknown']);
    await expect(registration).not.toContainText('facebook_ads');
    await expect(registration).not.toContainText('legacy_unknown');
    await expect(registration).not.toContainText('[object Object]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}
