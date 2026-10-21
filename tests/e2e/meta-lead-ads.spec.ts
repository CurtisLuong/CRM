import { expect, type Page, test } from '@playwright/test';

// ML-02: app chỉ đọc dòng integration_health Worker ghi. Supabase giả + giờ cố định.
const API = 'http://127.0.0.1:54321';
const USER = 'ml02-e2e-user';
const NOW = new Date('2026-10-19T10:31:00+07:00');
const CHECKED = '2026-10-19T10:25:00+07:00';
const MESSAGE = 'Token Facebook đã hết hạn, lead mới có thể không vào CRM.';

type HealthRow = {
  id: string;
  owner_id: string;
  status: 'ok' | 'warning' | 'error';
  message: string | null;
  token_expires_at: string | null;
  last_lead_at: string | null;
  last_webhook_at: string | null;
  pending_count: number;
  stuck_count: number;
  details: Record<string, unknown>;
  checked_at: string;
};

function health(overrides: Partial<HealthRow> = {}): HealthRow {
  return {
    id: 'meta_lead_ads',
    owner_id: USER,
    status: 'ok',
    message: 'Kết nối ổn định.',
    token_expires_at: null,
    last_lead_at: null,
    last_webhook_at: null,
    pending_count: 0,
    stuck_count: 0,
    details: {},
    checked_at: CHECKED,
    ...overrides,
  };
}

/** Đăng nhập giả + Supabase giả; `row = null` → máy chủ trả 500. */
async function install(page: Page, row: HealthRow | null) {
  await page.clock.install({ time: NOW });
  await page.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${API}/rest/v1/integration_health**`, (route) => {
    if (!row)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'server error', details: null, hint: null }),
      });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row]) });
  });
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ml02@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-ml02-token',
        refresh_token: 'synthetic-ml02-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, USER);
}

async function seedLead(page: Page) {
  await page.evaluate(async (userId) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    request.onupgradeneeded = () => {
      const current = request.result;
      if (!current.objectStoreNames.contains('customers')) current.createObjectStore('customers', { keyPath: 'id' });
      if (!current.objectStoreNames.contains('queue'))
        current.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
      if (!current.objectStoreNames.contains('meta')) current.createObjectStore('meta', { keyPath: 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 'ml02-lead',
        owner_id: userId,
        full_name: 'Khách Facebook E2E',
        phone: '0901234567',
        care_stage: 'Đăng kí mới',
        interest_level: 20,
        registered_at: '2026-10-16T08:00:00.000Z',
        created_at: '2026-10-16T08:00:00.000Z',
        updated_at: '2026-10-16T08:00:00.000Z',
        call_attempts: [],
        next_tasks: [],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, USER);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`ML-02 lỗi + lead cần xử lý tay: Cài đặt báo lỗi, Khách mới có cảnh báo tới đúng thẻ (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await install(
      page,
      health({ status: 'error', message: MESSAGE, pending_count: 3, stuck_count: 2, token_expires_at: null }),
    );
    await page.goto('/');
    await seedLead(page);
    await page.goto('/khach-moi');

    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await expect(page.getByText(`Kết nối Facebook: ${MESSAGE}`)).toBeVisible();
    // Cảnh báo không chặn danh sách.
    await expect(page.getByRole('button', { name: /Khách Facebook E2E/ })).toBeVisible();
    await expect(page.getByLabel('Lọc khách')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: 'Mở Cài đặt' }).click();
    await expect(page).toHaveURL(/\/cai-dat#meta-lead-ads$/);
    await expect(page.getByRole('heading', { name: 'Kết nối Facebook Lead Ads' })).toBeVisible();
    await expect(page.getByText('Đang lỗi')).toBeVisible();
    await expect(page.getByText('Cần xử lý tay: 2 lead')).toBeVisible();
    await expect(page.getByText('Đang chờ tự thử lại: 3 lead')).toBeVisible();
    await expect(page.getByText('Token Facebook: không hết hạn')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

test('ML-02 kết nối tốt: Khách mới không có dòng cảnh báo, Cài đặt báo đang hoạt động', async ({ page }) => {
  await install(page, health());
  await page.goto('/khach-moi');
  await expect(page.locator('#main').getByRole('heading', { name: 'Khách mới' })).toBeVisible();
  await expect(page.getByText(/Kết nối Facebook:/)).toHaveCount(0);

  await page.goto('/cai-dat');
  await expect(page.getByRole('heading', { name: 'Kết nối Facebook Lead Ads' })).toBeVisible();
  await expect(page.getByText('Đang hoạt động')).toBeVisible();
});

test('ML-02 Supabase trả lỗi: Cài đặt nói chưa tải được, không nói đang hoạt động', async ({ page }) => {
  await install(page, null);
  await page.goto('/cai-dat');
  await expect(page.getByText('Chưa tải được tình trạng kết nối Facebook. Kiểm tra mạng rồi mở lại.')).toBeVisible();
  await expect(page.getByText('Đang hoạt động')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
