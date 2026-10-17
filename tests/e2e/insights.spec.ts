import { expect, type Page, test } from '@playwright/test';

async function installInsightsFixture(page: Page) {
  const userId = 't313-insights-e2e';
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'insights@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
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
  }, userId);
  await page.goto('/');
  await page.evaluate(async (ownerId) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(ownerId)}`, 2);
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
    const current = new Date();
    const at = (days: number, hours = 10, minutes = 0) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      date.setHours(hours, minutes, 0, 0);
      return date.toISOString();
    };
    const tx = db.transaction(['customers', 'meta'], 'readwrite');
    const customers = tx.objectStore('customers');
    customers.put({
      id: 'insights-qualified',
      owner_id: ownerId,
      full_name: 'Khách phân tích',
      phone: '0901234567',
      source: ['facebook_ads'],
      campaign: 'Campaign E2E',
      care_stage: 'Đang chăm sóc',
      qualified_at: at(-20),
      care_stage_updated_at: at(-10),
      care_stage_history: [{ stage: 'Đang chăm sóc', at: at(-20), note: null }],
      registered_at: at(-30, 8, 0),
      call_attempts: [
        { at: at(-30, 9, 0), result: 'talked' },
        { at: at(-1, 14, 0), result: 'no_answer' },
      ],
      next_tasks: [{ at: 'open', text: 'Gửi thông tin', due: at(-2), due_allday: true }],
      interest_level: 70,
    });
    customers.put({
      id: 'insights-booking',
      owner_id: ownerId,
      full_name: 'Khách Booking',
      phone: '0901234568',
      source: ['website'],
      care_stage: 'Booking & Làm hồ sơ',
      qualified_at: at(-15),
      care_stage_updated_at: at(-3),
      care_stage_history: [{ stage: 'Booking & Làm hồ sơ', at: at(-15), note: null }],
      registered_at: at(-20),
      call_attempts: [{ at: at(-19, 11, 40), result: 'talked' }],
      next_call_at: at(1),
      call_attempts_extra: [],
    });
    customers.put({
      id: 'insights-lead',
      owner_id: ownerId,
      full_name: 'Khách mới',
      phone: '0901234569',
      source: ['referral'],
      care_stage: 'Đăng kí mới',
      registered_at: at(-2),
      call_attempts: [],
      next_tasks: [],
    });
    customers.put({
      id: 'insights-nurture',
      owner_id: ownerId,
      full_name: 'Khách nuôi',
      phone: '0901234570',
      source: ['facebook_ads'],
      care_stage: 'Nuôi dài hạn',
      qualified_at: at(-40),
      care_stage_history: [{ stage: 'Đang chăm sóc', at: at(-40), note: null }],
      registered_at: at(-50),
      call_attempts: [],
      next_tasks: [],
    });
    tx.objectStore('meta').put({ key: 'legacy-imported', at: current.toISOString() });
    db.close();
  }, userId);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Hiệu quả ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('hiển thị mẫu số, phễu, hiệu suất tuần và nguồn khách, không tràn ngang', async ({ page }) => {
      await installInsightsFixture(page);
      await page.goto('/hieu-qua');
      const main = page.locator('#main');
      await expect(main.getByRole('heading', { name: 'Hiệu quả', exact: true })).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Nhịp chăm sóc khách' })).toBeVisible();
      await expect(main.getByText('Khách đã trao đổi', { exact: true })).toBeVisible();
      await expect(main.getByText('Có bước tiếp theo', { exact: true })).toBeVisible();
      await expect(main.getByText('Cam kết quá hạn', { exact: true })).toBeVisible();
      await expect(main.getByText('Trung vị gọi lần đầu', { exact: true })).toBeVisible();
      await expect(main.getByText('2/4 khách có mốc hợp lệ')).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Phễu và tốc độ' })).toBeVisible();
      await expect(main.getByRole('rowheader', { name: 'Booking & Làm hồ sơ' })).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Hiệu suất tuần' })).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Nguồn khách' })).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Facebook Ads' })).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Marketing' })).toBeVisible();
      await expect(main.getByRole('tab', { name: 'Campaign' })).toBeVisible();
      await expect(main.getByText('Cohort đăng ký theo tháng')).toBeVisible();
      await expect(main.getByText(/Đường thu lead Facebook/)).toBeVisible();
      await main.getByRole('tab', { name: 'Campaign' }).click();
      await expect(main.getByText('Campaign E2E')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}
