import { expect, type Page, test } from '@playwright/test';

// PF-11 (Curtis 08/11): nút Mở rộng/Thu gọn nằm DƯỚI "Nâng cao" — mở rộng thì hiện ô trống + Nâng cao, thu gọn thì
// ẩn cả hai; ô cơ bản đã điền đủ thì không còn nút, Nâng cao hiện thẳng. Áp cho tab Trí nhớ và Nhu cầu & căn.
const userId = 'pf11-e2e-user';
const NOW = new Date(2026, 10, 8, 9, 30);
const AT = NOW.toISOString();
const base = {
  owner_id: userId,
  phone: '0901234511',
  care_stage: 'Đang chăm sóc',
  care_stage_updated_at: AT,
  qualified_at: AT,
  created_at: AT,
  updated_at: AT,
  projects: [],
  next_tasks: [],
  call_attempts: [],
  notes_manual: [],
};
const sparse = { ...base, id: 'pf11-sparse', full_name: 'Khách Thiếu Tin', gender: 'Nữ', contact_prefs: {} };
const full = {
  ...base,
  id: 'pf11-full',
  full_name: 'Khách Đủ Tin',
  dob: '1990-03-02',
  gender: 'Nam',
  marital_status: 'Đã kết hôn',
  occupation: 'Kỹ sư',
  income: '25 triệu',
  residence: 'Lê Chân, Hải Phòng',
  contact_prefs: { channel: 'Zalo', slot: '18:00-20:00' },
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

const toggle = (page: Page) => page.getByRole('button', { name: /^(Mở rộng \(\d+\)|Thu gọn)$/ });

test('PF-11: tab Trí nhớ — Nâng cao nằm trên Thu gọn, thu gọn ẩn cả Nâng cao', async ({ page }) => {
  await open(page, sparse);
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();
  const more = toggle(page);
  const advanced = page.getByRole('button', { name: 'Nâng cao' });
  await expect(more).toHaveText(/^Mở rộng/);
  await expect(advanced).toHaveCount(0);
  await more.click();
  await expect(more).toHaveText('Thu gọn');
  await expect(advanced).toBeVisible();
  await expect(page.getByLabel('Thu nhập')).toBeVisible();
  const a = await advanced.boundingBox();
  const t = await more.boundingBox();
  expect((t?.y ?? 0) - (a?.y ?? 0)).toBeGreaterThan(0);
  await more.click();
  await expect(advanced).toHaveCount(0);
  await expect(page.getByLabel('Thu nhập')).toHaveCount(0);
});

test('PF-11: tab Trí nhớ — ô cơ bản đủ thì không có Mở rộng/Thu gọn, Nâng cao và "Không liên hệ" hiện thẳng', async ({
  page,
}) => {
  await open(page, full);
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();
  await expect(page.getByRole('button', { name: 'Nâng cao' })).toBeVisible();
  await expect(toggle(page)).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Không liên hệ/ })).toBeVisible();
});

test('PF-11: tab Nhu cầu & căn — Nâng cao nằm trên Thu gọn, thu gọn ẩn cả Nâng cao', async ({ page }) => {
  await open(page, sparse);
  await page.getByRole('tab', { name: 'Nhu cầu & căn' }).click();
  const more = toggle(page);
  const advanced = page.getByRole('button', { name: 'Nâng cao' });
  await expect(more).toHaveText(/^Mở rộng/);
  await expect(advanced).toHaveCount(0);
  await more.click();
  await expect(advanced).toBeVisible();
  const a = await advanced.boundingBox();
  const t = await more.boundingBox();
  expect((t?.y ?? 0) - (a?.y ?? 0)).toBeGreaterThan(0);
  await more.click();
  await expect(advanced).toHaveCount(0);
  const view = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(view.sw).toBeLessThanOrEqual(view.vw);
});
