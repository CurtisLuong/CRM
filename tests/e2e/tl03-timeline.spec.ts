import { expect, type Locator, type Page, test } from '@playwright/test';

const NOW = new Date('2026-11-09T10:53:00+07:00');
const at = (day: string, time: string) => new Date(`2026-${day}T${time}:00+07:00`).toISOString();
const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;
type Seed = Record<string, unknown> & { id: string; owner_id: string; full_name: string; phone: string };

async function installApp(page: Page, userId: string) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'tl02@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-tl02-token',
        refresh_token: 'synthetic-tl02-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
}

async function seed(page: Page, userId: string, row: Seed) {
  await page.evaluate(
    async ({ name, row: customer }) => {
      const request = indexedDB.open(name, 2);
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
        tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: dbName(userId), row },
  );
}

const customer: Seed = {
  id: 'tl03-customer',
  owner_id: 'tl03-user',
  full_name: 'Khách TL-03',
  phone: '0912000003',
  qualified_at: at('10-01', '09:00'),
  registered_at: at('10-01', '09:00'),
  created_at: at('10-01', '09:00'),
  updated_at: at('10-30', '10:00'),
  next_call_at: at('11-09', '08:00'),
  next_call_end: at('11-09', '09:00'),
  care_stage: 'Nuôi dài hạn',
  care_stage_updated_at: at('10-30', '10:00'),
  care_stage_history: [
    { stage: 'Đang chăm sóc', at: at('10-10', '10:00'), note: 'Mốc đầu tiên' },
    { stage: 'Xem dự án', at: at('10-20', '10:00') },
    { stage: 'Nuôi dài hạn', at: at('10-30', '10:00') },
  ],
  notes_manual: [
    { at: at('10-31', '09:00'), text: 'Một dòng' },
    { at: at('10-31', '10:00'), text: 'Dòng thứ nhất\nDòng thứ hai\nDòng thứ ba' },
    { at: at('10-05', '09:00'), text: 'Trước mốc bậc' },
  ],
  call_attempts: [
    { at: at('10-31', '11:00'), result: 'no_answer' },
    { at: at('10-15', '11:00'), result: 'talked', note: 'Gọi một dòng' },
  ],
  interactions: [{ at: at('10-21', '11:00'), channel: 'zalo', kind: 'sent', note: 'Đã gửi thông tin' }],
  next_tasks: [],
};

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  if (!result) throw new Error(`Không có hộp bố cục: ${locator.toString()}`);
  return result;
}
const bottom = (r: { y: number; height: number }) => r.y + r.height;
const right = (r: { x: number; width: number }) => r.x + r.width;

async function checkNotes(scope: Locator, profile: boolean) {
  const notes = scope.locator('[data-timeline-note]:visible');
  expect(await notes.count()).toBeGreaterThanOrEqual(5);
  for (const frame of await notes.all()) {
    const text = profile ? frame.locator('[data-entry-body] > span').first() : frame;
    const rect = await box(frame);
    const height = await text.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      // Range đo chữ thực; line-height là hộp dòng, bao gồm khoảng thở của font.
      const lines = new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top)));
      return lines.size * Number.parseFloat(getComputedStyle(el).lineHeight);
    });
    const inset = await frame.evaluate((el) => {
      const css = getComputedStyle(el);
      return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(
        (sum, key) =>
          sum + Number.parseFloat(css.getPropertyValue(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))),
        0,
      );
    });
    expect(Math.abs(rect.height - height - inset), (await frame.textContent()) ?? '').toBeLessThanOrEqual(2);
  }
  const one = await box(notes.filter({ hasText: /^Một dòng$/ }));
  const three = await box(notes.filter({ hasText: /^Dòng thứ nhất/ }));
  expect(three.height - one.height).toBe(40);
}

async function checkRail(groups: Locator, profile: boolean) {
  await expect(groups).toHaveCount(4);
  const icons: Awaited<ReturnType<typeof box>>[] = [];
  for (const group of await groups.all()) {
    const icon = await box(
      // TL-04 (09/11): hồ sơ dùng khuôn Hành trình → dấu bậc ở cột trái của nhóm như tấm xem nhanh.
      group.locator(':scope > [data-timeline-stage-icon]'),
    );
    const title = await box(group.locator(profile ? '[data-timeline-header] h3' : '[data-stage-title]'));
    expect(Math.abs(bottom(icon) - bottom(title)), 'icon căn đáy tên bậc').toBeLessThanOrEqual(2);
    icons.push(icon);
  }
  for (let i = 0; i < 3; i++) {
    const rail = await box(groups.nth(i).locator(':scope > [data-timeline-stage-rail]'));
    expect(Math.abs(rail.x + rail.width / 2 - icons[i].x - icons[i].width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(rail.y - bottom(icons[i])), 'đường bắt đầu dưới icon').toBeLessThanOrEqual(1);
    expect(Math.abs(bottom(rail) - icons[i + 1].y), 'không hở giữa hai nhóm').toBeLessThanOrEqual(1);
    // Không còn đường song song trong cột các dòng con của hồ sơ.
    if (profile)
      expect(
        await groups
          .nth(i)
          .locator(':scope > div')
          .evaluate((el) => getComputedStyle(el).borderLeftWidth),
      ).toBe('0px');
  }
  await expect(groups.last().locator(':scope > [data-timeline-stage-rail]')).toHaveCount(0);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`TL-03 · ${theme}`, () => {
    test.use({ colorScheme: theme });
    test('bút cuối hàng, ghi chú co theo chữ, bậc thẳng hàng và đường nối liền; tab mặc định', async ({ page }) => {
      await installApp(page, customer.owner_id);
      await seed(page, customer.owner_id, customer);
      await page.goto(`/ho-so/${customer.id}`);
      const tabs = page.getByRole('tablist', { name: 'Nội dung hồ sơ khách' }).getByRole('tab');
      await expect(tabs).toHaveText([/Dòng thời gian/, 'Trí nhớ', 'Nhu cầu & căn', /Tài liệu/]);
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await expect(tabs.first()).toContainText('9');
      const panel = page.getByRole('tabpanel', { name: 'Dòng thời gian' });
      await expect(panel.getByText('Trước khi có mốc bậc', { exact: true })).toBeVisible();
      await checkNotes(panel, true);
      await checkRail(panel.locator('[data-timeline-group]'), true);

      const pens = panel.locator('[data-timeline-edit]');
      await expect(pens).toHaveCount(9);
      for (const pen of await pens.all()) {
        const rect = await box(pen);
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
        const note = pen.locator('xpath=ancestor::*[@data-timeline-note][1]');
        if (await note.count()) {
          const frame = await box(note);
          const text = await box(note.locator('[data-entry-body] > span').first());
          expect(frame.x + frame.width - right(rect), 'bút sát mép phải khung').toBeLessThanOrEqual(12);
          expect(right(rect)).toBeLessThanOrEqual(right(frame));
          const glyph = await box(pen.locator('svg'));
          expect(right(frame) - right(glyph), 'hình bút sát mép phải').toBeLessThanOrEqual(12);
          expect(Math.abs(bottom(glyph) - bottom(text)), 'hình bút căn đáy chữ').toBeLessThanOrEqual(4);
          expect(Math.abs(bottom(rect) - bottom(text)), 'bút căn đáy chữ cuối').toBeLessThanOrEqual(4);
          expect(right(text), 'chữ chừa chỗ cho bút').toBeLessThanOrEqual(rect.x);
        } else {
          const header = pen.locator('xpath=ancestor::*[@data-timeline-item-header][1]');
          const row = await box(header);
          expect(Math.abs(bottom(rect) - bottom(row))).toBeLessThanOrEqual(1);
          expect(Math.abs(right(rect) - right(row))).toBeLessThanOrEqual(1);
          const time = header.locator('time');
          if (await time.count()) expect(right(await box(time))).toBeLessThanOrEqual(rect.x);
          await expect(header.locator('[data-timeline-edit]').last()).toHaveAttribute(
            'aria-label',
            (await pen.getAttribute('aria-label')) ?? '',
          );
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      // Nhảy tới trường cụ thể vẫn chọn đúng tab, không bị mặc định ghi đè.
      await page
        .getByRole('region', { name: 'Đã biết', exact: true })
        .getByRole('button', { name: 'Mua để', exact: true })
        .click();
      await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('combobox', { name: 'Mục đích mua', exact: true })).toBeFocused();
      // Tab chọn trực tiếp và giữ qua thao tác trên hồ sơ.
      await tabs.nth(1).click();
      await expect(page.getByRole('tabpanel', { name: 'Trí nhớ' })).toBeVisible();
      await tabs.nth(2).click();
      await expect(page.getByRole('tabpanel', { name: 'Nhu cầu & căn' })).toBeVisible();
      await tabs.first().click();
      await expect(panel).toBeVisible();

      await page.goto('/today');
      await page.getByRole('button', { name: 'Mở Khách TL-03', exact: true }).click();
      const journey = page.getByRole('region', { name: 'Hành trình khách hàng' });
      const groups = journey.locator(':scope > ol > li');
      for (const group of await groups.all()) {
        const toggle = group.getByRole('button', { expanded: false });
        if (await toggle.count()) await toggle.click();
      }
      await checkRail(groups, false);
      await checkNotes(journey, false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
