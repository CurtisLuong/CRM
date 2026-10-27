import { expect, test } from '@playwright/test';

// M5 — Hiệu quả v3 (D-023 §4; bản mẫu docs/v3/mockups/hieu-qua.html). Lead viết TRƯỚC khi giao worker.
const userId = 'm5i-e2e-user';
const NOW = new Date(2026, 9, 21, 9, 30);
const iso = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();

test('Hiệu quả v3: màn đầu = 4 con số bấm được; chi tiết thu gọn; không lặp tiêu đề', async ({ page }, info) => {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'm5i@example.test',
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
    {
      uid: userId,
      rows: Array.from({ length: 6 }, (_, i) => ({
        id: `m5i-${i}`,
        owner_id: userId,
        full_name: `Khách Hiệu Quả ${i}`,
        phone: `09150000${i}0`,
        care_stage: i < 2 ? 'Booking & Làm hồ sơ' : 'Đăng kí mới',
        registered_at: iso(14 + i, 8),
        created_at: iso(14 + i, 8),
        updated_at: iso(20, 8),
        source: 'facebook_ads',
        call_attempts: [{ at: iso(14 + i, 8), result: i % 2 ? 'talked' : 'no_answer' }],
        care_stage_history: i < 2 ? [{ at: iso(20, 8), stage: 'Booking & Làm hồ sơ' }] : [],
      })),
    },
  );
  await page.goto('/hieu-qua');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveCount(0);
  await expect(main.getByText(/Dữ liệu khách bạn phụ trách/)).toHaveCount(0);
  const tiles = ['Gọi khách mới', 'Nói chuyện được', 'Chăm đúng nhịp', 'Booking / Kí tuần này'];
  for (const name of tiles) await expect(main.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(main.getByRole('button', { name: /^Booking \/ Kí tuần này/ })).toContainText('2');
  // Phễu & tuần mở sẵn; chi tiết khác thu gọn mặc định.
  await expect(main.getByRole('button', { name: 'Phễu & tuần', exact: true })).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Chăm sóc chi tiết', 'Nguồn & Marketing'])
    await expect(main.getByRole('button', { name, exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(main.getByText('Tốc độ gọi lần đầu · trung vị')).toHaveCount(0);
  // Bấm ô → mở khối chi tiết tương ứng.
  await main.getByRole('button', { name: /^Nói chuyện được/ }).click();
  await expect(main.getByRole('button', { name: 'Chăm sóc chi tiết', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(main.getByText('Tốc độ gọi lần đầu · trung vị')).toBeVisible();
  if (info.project.name === 'phone-360') {
    await page.evaluate(() => window.scrollTo(0, 0));
    const inView = await main
      .locator('[data-tile]')
      .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().bottom <= innerHeight - 64).length);
    expect(inView).toBe(4);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
