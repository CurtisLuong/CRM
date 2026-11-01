import { expect, test } from '@playwright/test';

const userId = 'u02-e2e-user';
const now = new Date(2026, 9, 29, 9, 30);
const registered = new Date(2026, 9, 29, 9, 20).toISOString();
const customers = [
  {
    id: 'u02-long-history',
    owner_id: userId,
    full_name: 'Khách Nhật Ký Dài',
    phone: '0912000001',
    care_stage: 'Đăng kí mới',
    registered_at: registered,
    created_at: registered,
    updated_at: registered,
    source: 'facebook_ads',
    call_attempts: [
      {
        at: new Date(2026, 9, 25, 9, 9, 16).toISOString(),
        result: 'talked',
        note: 'Trao đổi rất dài về nhu cầu mua nhà ở xã hội, ngân sách, thời gian dự kiến chuyển nhà và các giấy tờ cần chuẩn bị cùng gia đình.',
      },
    ],
  },
  {
    id: 'u02-session-first',
    owner_id: userId,
    full_name: 'Khách Phiên Một',
    phone: '0912000002',
    care_stage: 'Đăng kí mới',
    registered_at: new Date(2026, 9, 29, 9, 25).toISOString(),
    created_at: registered,
    updated_at: registered,
    source: 'facebook_ads',
    call_attempts: [],
  },
  {
    id: 'u02-session-second',
    owner_id: userId,
    full_name: 'Khách Phiên Hai',
    phone: '0912000003',
    care_stage: 'Đăng kí mới',
    registered_at: new Date(2026, 9, 29, 9, 26).toISOString(),
    created_at: registered,
    updated_at: registered,
    source: 'facebook_ads',
    call_attempts: [],
  },
];

test('U-02: nhật ký gọn, ghi tương tác và phiên gọi trên Thao tác nhanh', async ({ page }) => {
  await page.clock.install({ time: now });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'u02@example.test',
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
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { CallLog: { dial: async () => ({}) } },
    };
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
    { uid: userId, rows: customers },
  );

  for (const viewport of [
    { width: 360, height: 780 },
    { width: 1280, height: 900 },
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.goto('/thao-tac-nhanh');
      const history = page.getByRole('region', { name: 'Nhật ký cuộc gọi Khách Nhật Ký Dài' });
      await expect(history).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ghi cuộc gọi' })).toHaveCount(0);
      const historyButton = history.getByRole('button').first();
      const metrics = await historyButton.evaluate((button) => {
        const parent = button.parentElement?.getBoundingClientRect();
        const box = button.getBoundingClientRect();
        const text = button.querySelector('span');
        return {
          withinParent: !!parent && box.left >= parent.left && box.right <= parent.right,
          lineClamp: text ? getComputedStyle(text).webkitLineClamp : '',
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
        };
      });
      expect(metrics.withinParent).toBe(true);
      expect(metrics.lineClamp).toBe('2');
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      await page.getByRole('button', { name: 'Ghi tương tác' }).first().click();
      await page
        .getByRole('dialog', { name: 'Ghi tương tác · Khách Nhật Ký Dài' })
        .getByRole('button', { name: 'Đã gọi' })
        .click();
      await expect(page.getByRole('dialog', { name: 'Kết quả cuộc gọi · Khách Nhật Ký Dài' })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  }

  await page.goto('/today');
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page).toHaveURL(/\/thao-tac-nhanh\?phien=goi&t=/);
  await expect(page.getByText('Phiên gọi · 1/2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Khách Phiên Một' })).toBeVisible();
  await page.getByRole('button', { name: 'Bỏ qua khách' }).click();
  await expect(page.getByText('Phiên gọi · 2/2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Khách Phiên Hai' })).toBeVisible();
  await page.getByRole('button', { name: 'Dừng phiên' }).click();
  await expect(page).toHaveURL(/\/today$/);
});
