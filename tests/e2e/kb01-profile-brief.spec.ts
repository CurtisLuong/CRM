import { expect, test } from '@playwright/test';

// KB-01 (Curtis 10/11): "Lần trước" nội dung 14px chữ phụ; "Đã biết" ô ngắn 2 cột, "Vướng mắc gần nhất" cuối thẻ, cả bề ngang.
const USER_ID = 'kb01-profile-user';
const NOW = new Date(2026, 10, 10, 9, 0);
const LONG =
  'gọi 11:50, 09.11.2026 (1p1s) — Nói chuyện được · hẹn gọi lại Thứ Năm 12/11, 09:00–10:00, khách cần thêm thời gian bàn với gia đình về khoản vay và tiến độ thanh toán';
const rows = [
  {
    id: 'kb01-customer',
    owner_id: USER_ID,
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
    next_tasks: [{ at: new Date(2026, 10, 9, 12).toISOString(), text: 'Hồ sơ', kind: 'docs', side: 'me' }],
  },
];

async function openProfile(page: import('@playwright/test').Page) {
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
      email: 'kb01@example.test',
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
    { userId: USER_ID, customers: rows },
  );
  await page.goto('/ho-so/kb01-customer');
  await expect(page.getByRole('heading', { name: 'Anh Văn KB' }).first()).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`KB-01 ${theme}: Lần trước 14px; Đã biết 2 cột, vướng mắc cuối thẻ cả bề ngang, 3 dòng rồi bấm xem đủ`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openProfile(page);
    const last = page.getByRole('region', { name: 'Lần trước' });
    const lastText = last.locator('p').first();
    await expect(lastText).toBeVisible();
    expect(await lastText.evaluate((el) => getComputedStyle(el).fontSize)).toBe('14px');

    const known = page.getByRole('region', { name: 'Đã biết' });
    await expect(known.getByText('Vướng mắc gần nhất', { exact: true })).toBeVisible();
    const card = await known.boundingBox();
    const terms = known.locator('dt');
    const labels = await terms.allTextContents();
    expect(labels.at(-1)).toBe('Vướng mắc gần nhất');
    // Hai ô ngắn đầu cùng hàng (2 cột).
    const [a, b] = await Promise.all([terms.nth(0).boundingBox(), terms.nth(1).boundingBox()]);
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThanOrEqual(2);
    expect(b?.x ?? 0).toBeGreaterThan((a?.x ?? 0) + 40);
    // Vướng mắc: cả bề ngang thẻ (trừ padding), nằm dưới mọi ô ngắn, gọn 3 dòng.
    const objection = known.getByRole('button', { name: /gọi 11:50/ });
    const ob = await objection.boundingBox();
    expect(ob && card ? ob.width : 0).toBeGreaterThan((card?.width ?? 0) - 48);
    const lineHeight = await objection.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(ob?.height ?? 0).toBeLessThanOrEqual(lineHeight * 3 + 2);
    await objection.click();
    await expect(objection).toHaveAttribute('aria-expanded', 'true');
    expect((await objection.boundingBox())?.height ?? 0).toBeGreaterThan(ob?.height ?? 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}
