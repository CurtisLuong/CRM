import { expect, test } from '@playwright/test';

const userId = 'r401b-insights-e2e';
const NOW = new Date(2026, 9, 21, 9, 30);

async function installFixture(page: import('@playwright/test').Page) {
  await page.clock.install({ time: NOW });
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r401b@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-r401b-token',
        refresh_token: 'synthetic-r401b-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ id, now }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(id)}`, 2);
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
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      const customers = tx.objectStore('customers');
      [1, 12, 22, 22].forEach((age, index) => {
        const stageAt = new Date(now - age * 86_400_000).toISOString();
        customers.put({
          id: `r401b-${index}`,
          owner_id: id,
          full_name: `Khách ${index + 1}`,
          phone: `091000000${index + 1}`,
          source: ['facebook_ads'],
          care_stage: 'Đang chăm sóc',
          registered_at: stageAt,
          qualified_at: stageAt,
          care_stage_updated_at: stageAt,
          sla_anchor_at: stageAt,
          care_stage_history: [{ at: stageAt, stage: 'Đang chăm sóc' }],
          call_attempts: [],
          next_tasks: [],
        });
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date(now).toISOString() });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: userId, now: NOW.getTime() },
  );
}

for (const width of [360, 1280]) {
  test(`R4-01b: biểu đồ SLA khớp danh sách ở ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installFixture(page);
    await page.goto('/hieu-qua');
    const care = page.getByRole('button', { name: 'Chăm sóc chi tiết', exact: true });
    await care.click();
    await expect(page.getByRole('heading', { name: 'Tuổi bậc so với SLA' })).toBeVisible();

    const card = page.getByRole('heading', { name: 'Phân bố khách theo SLA' }).locator('xpath=../../..');
    const listed = page.getByTestId('stage-aging-list-2');
    const label = (await listed.locator('span').first().innerText()).trim();
    const chartRow = card.locator('button').filter({ hasText: label });
    await expect(chartRow).toHaveCount(1);

    const chartCounts = (await chartRow.getAttribute('title'))?.match(/\d+/g)?.map(Number);
    const listCounts = (await listed.locator('span').nth(2).innerText()).match(/\d+/g)?.map(Number);
    expect(chartCounts).toEqual(listCounts);
    expect(chartCounts?.reduce((sum, count) => sum + count, 0)).toBe(4);
    expect(await listed.locator('span').nth(1).innerText()).toBe('4 khách');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`R4-01b: FunnelChart và ChartCard thật được dùng ở ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installFixture(page);
    await page.goto('/hieu-qua');
    const funnel = page.getByTestId('insights-chart-funnel');
    await expect(funnel.getByRole('heading', { name: 'Phễu và tốc độ' })).toBeVisible();
    const kit = funnel.getByTestId('insights-funnel-kit');
    await expect(kit.getByText('Đăng kí mới', { exact: true })).toBeVisible();
    await expect(kit.getByText('Rơi nhiều nhất')).toBeVisible();
    await expect(funnel.locator('svg[aria-label="Số khách theo bậc"]')).toHaveCount(1);
    await expect(funnel.locator('svg[role="application"]')).toHaveCount(0);
  });
}
