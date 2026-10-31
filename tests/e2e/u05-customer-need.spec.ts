import { expect, type Page, test } from '@playwright/test';

const userId = 'u05-need-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const stamp = (hour: number, minute = 0) => new Date(2026, 9, 19, hour, minute).toISOString();
const common = {
  id: 'u05-common',
  owner_id: userId,
  phone: '0912345678',
  full_name: 'Nguyễn Thị Khách Hàng Tên Rất Dài Có Dấu',
  care_stage: 'Đang chăm sóc',
  qualified_at: stamp(8),
  created_at: stamp(8),
  registered_at: stamp(8),
  updated_at: stamp(8),
  apt_type: '3N-2WC',
  projects: ['Happy Home', 'Vinhomes Marina'],
  interests: [{ apt_type: '2N-1WC', project: 'Hoàng Huy', status: 'open' }],
  next_call_at: stamp(8),
  next_call_end: stamp(8, 30),
  next_tasks: [{ at: stamp(8), text: 'Gửi thông tin căn hộ', kind: 'other', due: stamp(11) }],
  call_attempts: [],
  notes_manual: [],
  contact_prefs: {},
};
const rows = [
  common,
  {
    ...common,
    id: 'u05-lead',
    full_name: 'Khách mới U05',
    care_stage: 'Đăng kí mới',
    qualified_at: null,
    next_call_at: null,
    next_call_end: null,
    next_tasks: [],
    apt_type: null,
    projects: [],
    interests: [],
  },
  {
    ...common,
    id: 'u05-archived',
    full_name: 'Khách lưu trữ U05',
    archived_at: stamp(8),
    next_call_at: null,
    next_call_end: null,
    next_tasks: [],
  },
];

async function seed(page: Page, path: string) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'u05@example.test',
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
    async ({ uid, customers }) => {
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
        for (const customer of customers) tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, customers: rows },
  );
  await page.goto(path);
}

test('dòng nhu cầu xuất hiện đúng một lần trên sáu danh sách khách', async ({ page }) => {
  const routes: [string, string, string][] = [
    ['/today', common.full_name, '3N-2WC +1 · Happy Home +2'],
    ['/cong-viec', common.full_name, '3N-2WC +1 · Happy Home +2'],
    ['/khach-hang', common.full_name, '3N-2WC +1 · Happy Home +2'],
    ['/khach-moi', 'Khách mới U05', 'Chưa rõ loại căn · Chưa rõ dự án'],
    ['/khach-hang/retarget', common.full_name, '3N-2WC +1 · Happy Home +2'],
    ['/khach-hang/luu-tru', 'Khách lưu trữ U05', '3N-2WC +1 · Happy Home +2'],
  ];
  for (const [path, customerName, expectedNeed] of routes) {
    await seed(page, path);
    const need = page.getByText(expectedNeed, { exact: true });
    const expectedCount = path === '/cong-viec' ? 2 : 1;
    await expect(need).toHaveCount(expectedCount);
    const name = page.getByText(customerName, { exact: true }).first();
    const nameBox = await name.boundingBox();
    expect(nameBox).not.toBeNull();
    if (!nameBox) throw new Error(`Không đo được tên ở ${path}`);
    for (let index = 0; index < expectedCount; index += 1) {
      const needRow = need.nth(index);
      await expect(needRow).toBeVisible();
      const needBox = await needRow.boundingBox();
      expect(needBox).not.toBeNull();
      if (!needBox) throw new Error(`Không đo được dòng nhu cầu ở ${path}`);
      expect(needBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
      expect(needBox.height).toBeLessThanOrEqual(20);
    }
    await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'dark'));
    await expect(need.first()).toBeVisible();
    await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'light'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('Khách hàng mobile giữ thẻ 64px và không hiện SĐT', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seed(page, '/khach-hang');
  const card = page.locator('[data-card]').filter({ hasText: common.full_name }).first();
  await expect(card).toBeVisible();
  await expect(card).not.toContainText(common.phone);
  expect((await card.boundingBox())?.height).toBe(64);
});
