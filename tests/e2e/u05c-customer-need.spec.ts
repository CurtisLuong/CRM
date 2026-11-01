import { expect, type Page, test } from '@playwright/test';

const userId = 'u05c-review-user';
const NOW = new Date(2026, 9, 31, 9, 30);
const at = new Date(2026, 9, 31, 10, 0).toISOString();
const customer = {
  id: 'u05c-customer',
  owner_id: userId,
  phone: '0912345678',
  full_name: 'Nguyễn Thị Khách Hàng U05c',
  care_stage: 'Đang chăm sóc',
  qualified_at: at,
  created_at: at,
  registered_at: at,
  updated_at: at,
  care_stage_updated_at: at,
  sla_anchor_at: at,
  apt_type: '2 phòng ngủ',
  projects: ['Vin Tràng Cát'],
  interests: [],
  call_attempts: [{ at, result: 'talked' }],
  next_tasks: [{ at, text: 'Gửi thông tin căn hộ', kind: 'other', due: at }],
  next_call_at: at,
  next_call_end: new Date(new Date(at).getTime() + 45 * 60_000).toISOString(),
  notes_manual: [],
  contact_prefs: {},
};

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'u05c@example.test',
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
        for (const name of ['customers', 'queue', 'meta']) {
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, {
              keyPath: name === 'queue' ? 'opId' : name === 'meta' ? 'key' : 'id',
              autoIncrement: name === 'queue',
            });
        }
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
  await page.goto(path);
}

test('thẻ Khách hàng hiện nhu cầu đúng ở 360/390/1280px và gọn 64px trên điện thoại', async ({ page }) => {
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 780 });
    await open(page, '/khach-hang');
    const line = page.locator('[data-testid="customer-need-line"]:visible').first();
    await expect(line).toHaveText('2N-2WC · Vin TC');
    const card = page.locator('[data-card]').filter({ has: line }).first();
    expect(await line.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width <= 390) {
      await expect(line).toHaveAttribute('title', '2 phòng ngủ · Vin Tràng Cát');
      expect((await card.boundingBox())?.height).toBe(64);
      await expect(card.getByText('Đang chăm sóc', { exact: true })).toBeHidden();
      await expect(card.locator('[aria-label="Bậc: Đang chăm sóc"]')).toBeVisible();
    }
  }
});

test('ActionItem trên Hôm nay và Công việc dành dòng nhu cầu riêng đủ rộng tại 360/390/1280px', async ({ page }) => {
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/today', '/cong-viec']) {
      await open(page, path);
      const line = page.getByTestId('customer-need-line').first();
      await expect(line, `Thiếu dòng nhu cầu ${path} ${width}px`).toBeVisible();
      await expect(line).toHaveText('2N-2WC · Vin TC');
      await expect(line).toHaveAttribute('title', '2 phòng ngủ · Vin Tràng Cát');
      const card = line.locator('xpath=ancestor::article[1]');
      const measure = await line.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const articleElement = element.closest('article');
        const customerElement = element.parentElement?.querySelector('.font-semibold.text-ink');
        if (!articleElement || !customerElement) throw new Error('Không tìm thấy thẻ hoặc tên khách');
        const article = articleElement.getBoundingClientRect();
        const customer = customerElement.getBoundingClientRect();
        const button = articleElement
          .querySelector('button[aria-label*="Gọi"], button[aria-label*="Xong"]')
          ?.getBoundingClientRect();
        return {
          width: rect.width,
          cardWidth: article.width,
          top: rect.top,
          customerBottom: customer.bottom,
          lineBottom: rect.bottom,
          buttonTop: button?.top,
          buttonBottom: button?.bottom,
        };
      });
      expect(measure.top).toBeGreaterThanOrEqual(measure.customerBottom - 1);
      if (width <= 390) expect(measure.width).toBeGreaterThan(measure.cardWidth * 0.7);
      if (measure.buttonTop !== undefined) {
        expect(
          measure.lineBottom <= measure.buttonTop ||
            (measure.buttonBottom !== undefined && measure.top >= measure.buttonBottom),
        ).toBe(true);
      }
      expect(await card.evaluate((element) => getComputedStyle(element).padding)).toBe('8px');
      if (path === '/cong-viec') expect((await card.boundingBox())?.height).toBeLessThanOrEqual(170);
      const name = line.locator('xpath=..').locator('.font-semibold.text-ink').first();
      expect(await line.evaluate((element) => element.getBoundingClientRect().left)).toBe(
        await name.evaluate((element) => element.getBoundingClientRect().left),
      );
    }
  }
});
