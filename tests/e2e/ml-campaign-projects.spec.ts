import { expect, type Page, test } from '@playwright/test';

// ML-04: quy tắc "chiến dịch quảng cáo → dự án" trong Cài đặt. Supabase giả + IndexedDB seed, không gọi mạng thật.
const API = 'http://127.0.0.1:54321';
const USER = 'ml04-e2e-user';
const CAMPAIGN = 'TC_Form_HighIntent_T10_Remarketing_Thang_10';
const PROJECT = 'Marquee Homes';

type RuleRow = {
  campaign: string;
  project: string;
  archived_at: string | null;
  updated_at?: string;
};

type Write = { method: string; body: Record<string, unknown>; url: string };

const customers = [
  {
    id: 'ml04-c1',
    owner_id: USER,
    full_name: 'Khách Chiến Dịch Một',
    phone: '0904000001',
    care_stage: 'Đăng kí mới',
    source: ['facebook_ads'],
    campaign: CAMPAIGN,
    projects: [],
    created_at: '2026-10-16T08:00:00.000Z',
    registered_at: '2026-10-16T08:00:00.000Z',
    updated_at: '2026-10-16T08:00:00.000Z',
    call_attempts: [],
    next_tasks: [],
  },
  {
    id: 'ml04-c2',
    owner_id: USER,
    full_name: 'Khách Chiến Dịch Hai',
    phone: '0904000002',
    care_stage: 'Đăng kí mới',
    source: ['facebook_ads'],
    campaign: CAMPAIGN,
    created_at: '2026-10-16T08:05:00.000Z',
    registered_at: '2026-10-16T08:05:00.000Z',
    updated_at: '2026-10-16T08:05:00.000Z',
    call_attempts: [],
    next_tasks: [],
  },
  {
    id: 'ml04-c3',
    owner_id: USER,
    full_name: 'Khách Đã Có Dự Án',
    phone: '0904000003',
    care_stage: 'Đăng kí mới',
    source: ['facebook_ads'],
    campaign: CAMPAIGN,
    projects: ['Vin Tràng Cát'],
    created_at: '2026-10-16T08:10:00.000Z',
    registered_at: '2026-10-16T08:10:00.000Z',
    updated_at: '2026-10-16T08:10:00.000Z',
    call_attempts: [],
    next_tasks: [],
  },
];

async function install(page: Page, options: { rules?: RuleRow[]; failRules?: boolean } = {}) {
  const writes: Write[] = [];
  await page.clock.install({ time: new Date('2026-10-21T10:00:00+07:00') });
  await page.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${API}/rest/v1/lead_campaign_projects**`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (options.failRules)
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'XX000', message: 'server error', details: null, hint: null }),
        });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options.rules ?? []),
      });
    }
    const raw = request.postDataJSON() as Record<string, unknown> | Record<string, unknown>[];
    writes.push({
      method: request.method(),
      body: (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>,
      url: request.url(),
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(
    ({ userId, project }) => {
      const user = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'ml04@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-ml04-token',
          refresh_token: 'synthetic-ml04-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      // Giỏ hàng đã có dự án; Cài đặt đọc cache của account.catalog.
      localStorage.setItem(
        `crm_catalog_v2:${userId}`,
        JSON.stringify({
          projects: [{ id: 'ml04-project', name: project, sort_order: 1, created_at: '2026-01-01T00:00:00.000Z' }],
          buildings: [],
          units: [],
          projectTypes: [],
          buildingTypes: [],
        }),
      );
    },
    { userId: USER, project: PROJECT },
  );
  return writes;
}

async function seedCustomers(page: Page) {
  await page.evaluate(
    async ({ userId, rows }) => {
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
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { userId: USER, rows: customers },
  );
}

async function openSettings(page: Page, options: { rules?: RuleRow[]; failRules?: boolean } = {}) {
  const writes = await install(page, options);
  await page.goto('/');
  await seedCustomers(page);
  await page.goto('/cai-dat');
  await expect(page.getByRole('heading', { name: 'Dự án theo chiến dịch quảng cáo' })).toBeVisible();
  return writes;
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('ML-04 gán dự án theo chiến dịch rồi điền cho khách cũ đang trống', async ({ page }) => {
  const writes = await openSettings(page);

  await expect(page.getByRole('heading', { name: CAMPAIGN })).toBeVisible();
  await expect(page.getByText('3 khách', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa gán', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByLabel(`Dự án cho chiến dịch ${CAMPAIGN}`).selectOption(PROJECT);
  await page.getByRole('button', { name: 'Lưu dự án' }).click();

  const upsert = writes.find((write) => write.method === 'POST');
  expect(upsert?.body).toMatchObject({ campaign: CAMPAIGN, project: PROJECT, archived_at: null });
  // Hợp đồng: chỉ ghi 4 cột campaign/project/archived_at/updated_at (owner_id do bảng mặc định).
  expect(Object.keys(upsert?.body ?? {}).sort()).toEqual(['archived_at', 'campaign', 'project', 'updated_at']);
  await expect(page.getByText(`Đã gán dự án ${PROJECT} cho chiến dịch.`)).toBeVisible();
  await expect(page.getByText(`Dự án đang gán: ${PROJECT}`)).toBeVisible();
  await expectNoHorizontalScroll(page);

  const fillButton = page.getByRole('button', { name: 'Điền dự án cho 2 khách đang trống' });
  await expect(fillButton).toBeVisible();
  await fillButton.click();
  await expect(page.getByText(`Đã điền dự án ${PROJECT} cho 2 khách.`)).toBeVisible();
  await expectNoHorizontalScroll(page);

  const stored = await page.evaluate(async (userId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const tx = db.transaction('customers', 'readonly');
      const request = tx.objectStore('customers').getAll();
      request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows;
  }, USER);

  expect(stored.find((row) => row.id === 'ml04-c1')?.projects).toEqual([PROJECT]);
  expect(stored.find((row) => row.id === 'ml04-c2')?.projects).toEqual([PROJECT]);
  // Khách đã có dự án khác phải giữ nguyên.
  expect(stored.find((row) => row.id === 'ml04-c3')?.projects).toEqual(['Vin Tràng Cát']);
});

test('ML-04 bỏ gán là xoá mềm: PATCH archived_at, không DELETE dòng quy tắc', async ({ page }) => {
  const writes = await openSettings(page);

  await page.getByLabel(`Dự án cho chiến dịch ${CAMPAIGN}`).selectOption(PROJECT);
  await page.getByRole('button', { name: 'Lưu dự án' }).click();
  await expect(page.getByText(`Dự án đang gán: ${PROJECT}`)).toBeVisible();

  await page.getByRole('button', { name: 'Bỏ gán' }).click();
  await expect(page.getByText('Đã bỏ gán dự án cho chiến dịch.')).toBeVisible();
  await expect(page.getByText('Chưa gán', { exact: true })).toBeVisible();

  const patch = writes.find((write) => write.method === 'PATCH');
  expect(patch).toBeTruthy();
  expect(typeof patch?.body.archived_at).toBe('string');
  expect(typeof patch?.body.updated_at).toBe('string');
  expect(Object.keys(patch?.body ?? {}).sort()).toEqual(['archived_at', 'updated_at']);
  expect(writes.some((write) => write.method === 'DELETE')).toBe(false);
});

test('ML-04 đọc quy tắc lỗi: báo lỗi, không hiện "Chưa gán", nút lưu bị khoá', async ({ page }) => {
  await openSettings(page, { failRules: true });

  await expect(
    page.getByText(
      'Không tải được quy tắc dự án theo chiến dịch. Kiểm tra mạng hoặc quyền; chưa có dự án nào bị thay đổi.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Chưa gán', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lưu dự án' })).toBeDisabled();
  await expect(page.getByLabel(`Dự án cho chiến dịch ${CAMPAIGN}`)).toBeDisabled();
  await expectNoHorizontalScroll(page);
});
