import { expect, type Page, test } from '@playwright/test';

const userId = 'tabs-sticky-user';
const NOW = new Date(2026, 10, 8, 9, 30);
const AT = NOW.toISOString();
const customer = {
  id: 'tabs-sticky-customer',
  owner_id: userId,
  full_name: 'Nguyễn Thị Hưởng',
  phone: '0901234567',
  care_stage: 'Nuôi dài hạn',
  care_stage_updated_at: AT,
  qualified_at: AT,
  created_at: AT,
  updated_at: AT,
  gender: 'Nữ',
  dob: '1985-08-15',
  marital_status: 'Đã kết hôn',
  occupation: 'Giáo viên',
  income: '25 triệu',
  residence: 'Hải Phòng',
  contact_prefs: { channel: 'Zalo', slot: '18:00–20:00' },
  projects: [],
  next_tasks: [],
  call_attempts: [],
  notes_manual: [],
  advanced: {
    life_context: 'Đang thuê nhà, cần gần trường học',
    capital: 800000000,
    assets_total: 1200000000,
    loan_need: 400000000,
    x_old: 'Ghi cũ vẫn giữ',
  },
};

async function open(page: Page, customer: Record<string, unknown>) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pf11@example.test',
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
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, row }) => {
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
        tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, row: customer },
  );
  await page.goto(`/ho-so/${customer.id}`);
  await expect(page.getByRole('heading', { level: 1, name: String(customer.full_name) })).toBeVisible();
}

// Curtis 11/11: khi cuộn mà tab chưa dính đầu màn → tab không được trùm lên thẻ Tính vay phía trên.
test('thanh tab hồ sơ không trùm thẻ phía trên khi cuộn', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-1280', 'Header desktop luôn hiện');
  await open(page, customer);
  await page.getByRole('tab', { name: 'Dòng thời gian' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const tabs = page.getByRole('tablist', { name: 'Nội dung hồ sơ khách' });
  const loan = page.getByRole('button', { name: 'Tính vay' });
  // Cuộn xuống từng bước tới khi tab còn cách đầu màn ~250px (chưa dính).
  await page.evaluate(async () => {
    const list = document.querySelector('[role="tablist"][aria-label="Nội dung hồ sơ khách"]');
    if (!list) throw new Error('Thiếu tab hồ sơ');
    const target = list.getBoundingClientRect().top + scrollY - 250;
    for (let y = 0; y <= target; y += 20) {
      window.scrollTo(0, y);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
  });
  await page.waitForTimeout(500);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await page.screenshot({ path: testInfo.outputPath(`tabs-sticky-${theme}.png`) });
  }
  const loanBox = await loan.boundingBox();
  const tabBox = await tabs.boundingBox();
  if (!loanBox || !tabBox) throw new Error('Không đo được');
  expect(loanBox.y + loanBox.height).toBeLessThanOrEqual(tabBox.y + 1);
  // Cuộn hết cỡ: tab (dính hoặc chưa) luôn nằm dưới thanh đầu (thanh đầu luôn hiện, 11/11), không chui xuống dưới nó.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const header = await page.locator('header').first().boundingBox();
  const stuck = await tabs.boundingBox();
  if (!header || !stuck) throw new Error('Không đo được');
  expect(stuck.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
});
