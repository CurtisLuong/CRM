import { expect, type Locator, type Page, test } from '@playwright/test';
import type { Customer } from '../../src/domain/customer/types';

const NOW = '2026-11-05T03:00:00.000Z';
const MAIN = ['Nói chuyện được', 'Bận, hẹn lại', 'Không nghe'];
const OTHER = ['Thuê bao', 'Sai số', 'Cúp máy', 'Máy bận'];

async function setup(page: Page, hungUp = false) {
  await page.clock.install({ time: new Date(NOW) });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const user = {
      id: 'cr01-e2e-user',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-11-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: user.id, email: user.email }));
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
    const opened: string[] = [];
    (window as Window & { __cr01Opened?: string[] }).__cr01Opened = opened;
    window.open = (url) => {
      opened.push(String(url));
      return null;
    };
  });
  await page.goto('/');
  await page.evaluate(async (hasHungUp) => {
    const request = indexedDB.open('crm_khach_hang__cr01-e2e-user', 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('customers'))
          database.createObjectStore('customers', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('queue'))
          database.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 'cr01-e2e-customer',
        owner_id: 'cr01-e2e-user',
        full_name: 'Khách CR-01',
        phone: '0901234567',
        qualified_at: null,
        care_stage: 'Đang tiếp cận',
        registered_at: '2026-11-04T01:00:00.000Z',
        created_at: '2026-11-04T01:00:00.000Z',
        updated_at: '2026-11-04T01:00:00.000Z',
        next_call_at: '2026-11-06T02:00:00.000Z',
        next_call_end: '2026-11-06T04:00:00.000Z',
        next_call_reason: 'Lịch cũ',
        call_attempts: hasHungUp ? [{ at: '2026-11-04T02:00:00.000Z', result: 'hung_up', note: null }] : [],
        next_tasks: [],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, hungUp);
  await page.goto('/thao-tac-nhanh');
  await expect(page.getByRole('heading', { name: 'Khách CR-01', exact: true })).toBeVisible();
}

async function readCustomer(page: Page): Promise<Customer> {
  return page.evaluate(async () => {
    const request = indexedDB.open('crm_khach_hang__cr01-e2e-user', 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Customer>((resolve, reject) => {
      const get = db.transaction('customers').objectStore('customers').get('cr01-e2e-customer');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return row;
  });
}

async function ingest(page: Page, seconds: number) {
  await page.waitForFunction(() => !!(window as Window & { CRMCalls?: unknown }).CRMCalls);
  expect(
    await page.evaluate(async (durationSec) => {
      const bridge = (window as Window & { CRMCalls?: { ingest(calls: unknown[]): Promise<number> } }).CRMCalls;
      return bridge?.ingest([
        {
          id: 'cr01-device-call',
          number: '0901234567',
          startedAt: Date.parse('2026-11-05T02:55:00.000Z'),
          durationSec,
          direction: 'out',
        },
      ]);
    }, seconds),
  ).toBe(1);
  const sheet = page.getByRole('dialog', { name: 'Kết quả cuộc gọi · Khách CR-01' });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function manual(page: Page) {
  await page.getByRole('button', { name: 'Ghi tương tác', exact: true }).click();
  await page
    .getByRole('dialog', { name: /Ghi tương tác/ })
    .getByRole('button', { name: 'Đã gọi', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Kết quả cuộc gọi · Khách CR-01' });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function checkLayout(page: Page, sheet: Locator) {
  const radios = sheet.getByRole('radiogroup', { name: 'Kết quả cuộc gọi' }).getByRole('radio');
  await expect(radios).toHaveText(MAIN);
  const boxes = await radios.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      const icon = element.querySelector('svg')?.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element.lastChild ?? element);
      const text = range.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        parentWidth: element.parentElement?.getBoundingClientRect().width,
        textHeight: text.height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
        inline: !!icon && Math.abs(icon.y + icon.height / 2 - (text.y + text.height / 2)) < 4,
      };
    }),
  );
  for (const [i, box] of boxes.entries()) {
    expect(box.height).toBeGreaterThanOrEqual(56);
    expect(box.width).toBeCloseTo(box.parentWidth ?? 0, 1);
    expect(box.x).toBe(boxes[0]?.x);
    expect(box.inline).toBe(true);
    expect(box.textHeight).toBeLessThanOrEqual(box.lineHeight);
    if (i > 0) expect(box.y).toBeGreaterThan((boxes[i - 1]?.y ?? 0) + 55);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`CR-01 ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('ghi tay: 3 nút một cột; Khác có 4 mục đúng thứ tự', async ({ page }) => {
      await setup(page);
      const sheet = await manual(page);
      await checkLayout(page, sheet);
      await expect(sheet.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
      await sheet.getByRole('button', { name: 'Khác…' }).click();
      await expect(sheet.getByRole('radiogroup', { name: 'Kết quả cuộc gọi' }).getByRole('radio')).toHaveText([
        ...MAIN,
        ...OTHER,
      ]);
      for (const label of OTHER) await expect(sheet.getByRole('radio', { name: label, exact: true })).toBeVisible();
    });

    for (const { duration, label, result, step } of [
      { duration: 75, label: 'Nói chuyện được', result: 'talked', step: 'Chốt phân loại: Đạt hay Loại' },
      { duration: 0, label: 'Không nghe', result: 'no_answer', step: 'Gọi lần 2' },
    ]) {
      test(`máy ${duration}s chọn sẵn ${label}, hiện gợi ý và Lưu ngay`, async ({ page }) => {
        await setup(page);
        const sheet = await ingest(page, duration);
        await expect(sheet.getByRole('radio', { name: label, exact: true })).toBeChecked();
        const next = sheet.locator('section').filter({ has: page.getByRole('heading', { name: 'Bước tiếp theo' }) });
        await expect(next).toContainText(step);
        await sheet.getByRole('button', { name: 'Lưu', exact: true }).click();
        await expect(sheet).toHaveCount(0);
        const saved = await readCustomer(page);
        expect(saved.call_attempts).toMatchObject([
          { result, duration, origin: 'device', device_id: 'cr01-device-call' },
        ]);
        expect(saved.next_call_at).toBeTruthy();
      });
    }

    test('hai Cúp máy tự loại; Hoàn tác khôi phục lịch và giữ cuộc gọi, không mở Zalo', async ({ page }) => {
      await setup(page, true);
      const sheet = await manual(page);
      await sheet.getByRole('button', { name: 'Khác…' }).click();
      await sheet.getByRole('radio', { name: 'Cúp máy', exact: true }).click();
      await expect(sheet).toContainText('Cúp máy 2 lần liên tiếp → chuyển Loại "Cúp máy".');
      await sheet.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(sheet).toHaveCount(0);
      expect(await readCustomer(page)).toMatchObject({
        disqualified_at: expect.any(String),
        disqualify_reason: 'cup_may',
        next_call_at: null,
        call_attempts: [{ result: 'hung_up' }, { result: 'hung_up' }],
      });
      await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
      await expect.poll(async () => (await readCustomer(page)).disqualified_at).toBeNull();
      expect(await readCustomer(page)).toMatchObject({
        disqualify_reason: null,
        next_call_at: '2026-11-06T02:00:00.000Z',
        next_call_end: '2026-11-06T04:00:00.000Z',
        next_call_reason: 'Lịch cũ',
        call_attempts: [{ result: 'hung_up' }, { result: 'hung_up' }],
      });
      expect(await page.evaluate(() => (window as Window & { __cr01Opened?: string[] }).__cr01Opened)).toEqual([]);
      await page
        .getByRole('button', { name: /Sửa kết quả cuộc gọi.*Cúp máy/ })
        .last()
        .click();
      const reopened = page.getByRole('dialog', { name: /Sửa kết quả cuộc gọi/ });
      await expect(reopened.getByRole('radio', { name: 'Cúp máy', exact: true })).toBeChecked();
      await expect(reopened.getByRole('radio')).toHaveCount(7);
    });
  });
}
