import { expect, type Page, test } from '@playwright/test';

const userId = 'ch01-chart-e2e';
const NOW = new Date(2026, 9, 21, 9, 30);
const at = (days: number, hours = 10) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  date.setHours(hours, 0, 0, 0);
  return date.toISOString();
};

async function installFixture(page: Page) {
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
      email: 'charts@example.test',
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
  await page.evaluate(
    async ({ id, current, previous, lead, metaAt }) => {
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
      customers.put({
        id: 'chart-care',
        owner_id: id,
        full_name: 'Khách chăm sóc',
        phone: '0910000001',
        source: ['facebook_ads'],
        care_stage: 'Đang chăm sóc',
        registered_at: current.registered,
        qualified_at: current.qualified,
        care_stage_updated_at: current.qualified,
        care_stage_history: [{ at: current.qualified, stage: 'Đang chăm sóc' }],
        call_attempts: [{ at: current.call, result: 'talked' }],
      });
      customers.put({
        id: 'chart-booking',
        owner_id: id,
        full_name: 'Khách Booking',
        phone: '0910000002',
        source: ['referral'],
        care_stage: 'Booking & Làm hồ sơ',
        registered_at: previous.registered,
        qualified_at: previous.qualified,
        care_stage_updated_at: current.qualified,
        care_stage_history: [
          { at: previous.qualified, stage: 'Đang chăm sóc' },
          { at: current.qualified, stage: 'Booking & Làm hồ sơ' },
        ],
        call_attempts: [
          { at: previous.call, result: 'no_answer' },
          { at: current.call, result: 'talked' },
        ],
      });
      customers.put({
        id: 'chart-lead',
        owner_id: id,
        full_name: 'Khách mới',
        phone: '0910000003',
        source: ['website'],
        care_stage: 'Đăng kí mới',
        registered_at: lead.registered,
        call_attempts: [],
        next_tasks: [],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: metaAt });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      id: userId,
      current: { registered: at(-1, 8), qualified: at(-1, 9), call: at(0, 9) },
      previous: { registered: at(-8, 8), qualified: at(-7, 9), call: at(-6, 9) },
      lead: { registered: at(0, 8) },
      metaAt: NOW.toISOString(),
    },
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`biểu đồ Hiệu quả đọc được ở 360 / 1280, giao diện ${scheme}`, async ({ page }, info) => {
    test.skip(info.project.name === 'phone-390', 'Biểu đồ được đo ở 360px và 1280px.');
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await installFixture(page);
    await page.goto('/hieu-qua');
    const main = page.locator('main');
    // Phễu & tuần mở sẵn, không cần bấm.
    await expect(main.getByRole('button', { name: 'Phễu & tuần', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    const funnel = main.getByTestId('insights-chart-funnel');
    const weekly = main.getByTestId('insights-chart-weekly');
    await expect(funnel.getByRole('application')).toBeVisible();
    await expect(weekly.getByRole('application')).toBeVisible();
    await expect(funnel.locator('svg[role="application"] text').filter({ hasText: '3 khách' })).toBeVisible();
    await expect(weekly.locator('svg[role="application"] .recharts-label-list text').first()).toBeVisible();
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll<HTMLElement>('*'))
        .map((element) => ({
          element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${String(element.className).slice(0, 70)}`,
          right: Math.round(element.getBoundingClientRect().right),
          width: element.scrollWidth,
          client: element.clientWidth,
        }))
        .filter((element) => element.right > window.innerWidth + 1)
        .slice(0, 12),
    }));
    expect(layout.scrollWidth <= layout.width, JSON.stringify(layout)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
}
