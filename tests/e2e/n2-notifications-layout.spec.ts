import { expect, test } from '@playwright/test';

const USER_ID = 'n2-notifications-user';
const NOW = new Date(2026, 9, 28, 9, 30);
const localTime = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();

const rows = ['Khách Nhóm A', 'Khách Nhóm B', 'Khách Nhóm C'].map((full_name, index) => ({
  id: `n2-customer-${index + 1}`,
  owner_id: USER_ID,
  full_name,
  phone: `090000000${index + 1}`,
  care_stage: 'Đăng kí mới',
  registered_at: localTime(28, 8),
  created_at: localTime(28, 8),
  updated_at: localTime(28, 8),
  call_attempts: [],
  next_tasks: [],
}));

async function openNotifications(page: import('@playwright/test').Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'n2@example.test',
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
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/thong-bao');
  await expect(page.getByText('3 tín hiệu', { exact: true })).toBeVisible();
}

// Mỗi khách đúng 3 hàng: tên (bấm mở hồ sơ) + mức quá hạn · loại tín hiệu · "Hoãn 8 giờ ▾".
for (const width of [360, 1280]) {
  test(`thông báo gọn: 3 hàng mỗi khách (${width}px)`, async ({ page }) => {
    await openNotifications(page);
    await page.setViewportSize({ width, height: 900 });
    const main = page.locator('#main');
    await expect(main.getByText('3 tín hiệu', { exact: true })).toBeVisible();

    // Không còn khối rối: avatar, "N tín hiệu cùng loại", "Thu gọn", nút chữ "Mở hồ sơ …", ô "Khác".
    await expect(main.getByText(/tín hiệu cùng loại/)).toHaveCount(0);
    await expect(main.getByRole('button', { name: /Thu gọn|Xem \d+ khách/ })).toHaveCount(0);
    await expect(main.getByText(/^Mở hồ sơ/)).toHaveCount(0);
    await expect(main.getByText('Khác', { exact: true })).toHaveCount(0);

    const items = main.locator('li');
    await expect(items).toHaveCount(3);
    const first = items.first();
    // Chữ người dùng thấy (bỏ danh sách tuỳ chọn ẩn của ô chọn thời gian).
    const visible = await first.evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      for (const select of copy.querySelectorAll('select')) select.remove();
      document.body.append(copy);
      const text = copy.innerText;
      copy.remove();
      return text;
    });
    const lines = visible
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines[0]).toBe(rows[0].full_name);
    expect(lines[1]).toMatch(/quá hạn|còn|hôm nay|trễ/i);
    expect(lines.at(-1)).toBe('8 giờ');
    expect(lines.at(-2)).toBe('Hoãn');

    // Không cuộn ngang.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('chọn thời gian hoãn khác → hoãn ngay; bấm tên → mở hồ sơ', async ({ page }) => {
  await openNotifications(page);
  const main = page.locator('#main');
  const select = main.getByRole('combobox', { name: `Chọn thời gian hoãn cho ${rows[0].full_name}` });
  await select.selectOption('1 ngày');
  await expect(main.getByText('2 tín hiệu', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Đã hoãn đến' })).toBeVisible();

  await main.getByRole('button', { name: `Mở hồ sơ ${rows[1].full_name}` }).click();
  await expect(page).toHaveURL(/\/ho-so\/n2-customer-2$/);
});
