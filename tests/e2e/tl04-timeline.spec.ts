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
      email: 'tl04@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-tl04-token',
        refresh_token: 'synthetic-tl04-refresh',
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

const days = ['10-02', '10-21', '11-08'];
const customer: Seed = {
  id: 'tl04-customer',
  owner_id: 'tl04-user',
  full_name: 'Khách TL-04',
  phone: '0912000004',
  qualified_at: at('10-01', '09:00'),
  registered_at: at('10-01', '09:00'),
  created_at: at('10-01', '09:00'),
  updated_at: at('11-08', '14:00'),
  next_call_at: at('11-09', '08:00'),
  next_call_end: at('11-09', '09:00'),
  care_stage: 'Xem dự án',
  care_stage_updated_at: at('11-08', '09:00'),
  care_stage_history: ['Đang tiếp cận', 'Đang chăm sóc', 'Xem dự án'].map((stage, i) => ({
    stage,
    at: at(days[i], '09:00'),
    note: `Ghi chú mốc ${i + 1}`,
  })),
  notes_manual: days.map((day, i) => ({ at: at(day, '13:00'), text: `Ghi chú tay ${i + 1}` })),
  call_attempts: days.flatMap((day, i) =>
    [10, 11, 12].map((hour) => ({
      at: at(day, `${hour}:00`),
      result: 'talked',
      note: `Cuộc gọi ${i + 1} lúc ${hour}`,
    })),
  ),
  interactions: [],
  next_tasks: [],
};

async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Không đo được ${locator}`);
  return box;
}

async function checkLayout(scope: Locator) {
  for (const frame of await scope.locator('[data-timeline-note]').all()) {
    const measured = await frame.evaluate((el) => {
      const text = el.querySelector('[data-entry-body] > span');
      const pen = el.querySelector('[data-timeline-edit]');
      if (!text || !pen) throw new Error('Thiếu chữ hoặc bút sửa');
      const range = document.createRange();
      range.selectNodeContents(text);
      const lines = new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top)));
      const css = getComputedStyle(el);
      const inset = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(
        (sum, key) =>
          sum + Number.parseFloat(css.getPropertyValue(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))),
        0,
      );
      const textBox = text.getBoundingClientRect();
      const penBox = pen.getBoundingClientRect();
      return {
        frameHeight: el.getBoundingClientRect().height,
        contentHeight: lines.size * Number.parseFloat(getComputedStyle(text).lineHeight) + inset,
        bottomGap: Math.abs(textBox.bottom - penBox.bottom),
        overlap: textBox.right - penBox.left,
      };
    });
    expect(Math.abs(measured.frameHeight - measured.contentHeight), 'khung co theo chữ').toBeLessThanOrEqual(2);
    expect(measured.bottomGap, 'bút căn đáy chữ').toBeLessThanOrEqual(4);
    expect(measured.overlap, 'chữ chừa chỗ cho bút').toBeLessThanOrEqual(1);
  }
  const groups = scope.locator('[data-timeline-group]');
  for (const group of await groups.all()) {
    const header = group.locator('[data-timeline-header]');
    const elements = [header.locator('h3'), header.locator('p'), header.locator('[data-timeline-note]')];
    const activities = group.locator('ol > li');
    for (const activity of await activities.all()) {
      elements.push(activity.locator('[data-timeline-entry]'), activity.locator('[data-timeline-note]'));
      const icon = activity.locator(':scope > span:not([data-timeline-activity-rail])');
      await expect(icon).toHaveCSS('border-radius', /.*px|calc.*/);
      expect((await rect(icon)).width).toBe(24);
    }
    const lefts = await Promise.all(elements.map(async (element) => (await rect(element)).x));
    expect(Math.max(...lefts) - Math.min(...lefts), 'mọi nội dung chung lề trái').toBeLessThanOrEqual(2);
    const rail = group.locator(':scope > [data-timeline-stage-rail]');
    if (await rail.count()) {
      const thick = await rect(rail);
      const thin = await rect(group.locator('[data-timeline-activity-rail]').first());
      const mark = await rect(group.locator(':scope > [data-timeline-stage-icon]'));
      expect(thick.width).toBeGreaterThanOrEqual(2);
      expect(thin.width).toBe(1);
      expect(thick.width).toBeGreaterThan(thin.width);
      expect(Math.abs(thick.x + thick.width / 2 - mark.x - mark.width / 2)).toBeLessThanOrEqual(1);
    }
  }
}

async function noOverflow(page: Page, scope: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await scope.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`TL-04 · ${theme}`, () => {
    test.use({ colorScheme: theme });
    test('8 hoạt động, hai đường nối, chung lề, tấm đủ lịch sử và sửa/xoá; SLA chỉ ở bậc hiện tại', async ({
      page,
    }) => {
      await installApp(page, customer.owner_id);
      await seed(page, customer.owner_id, customer);
      await page.goto(`/ho-so/${customer.id}`);
      const panel = page.getByRole('tabpanel', { name: /Dòng thời gian/ });
      await expect(panel.locator('[data-timeline-entry]')).toHaveCount(8);
      await expect(panel.locator('[data-timeline-group]')).toHaveCount(2);
      await expect(panel.getByRole('button', { name: 'Đổi bậc', exact: true })).toBeVisible();
      await checkLayout(panel);
      await noOverflow(page, panel);
      await panel.getByRole('button', { name: 'Xem toàn bộ lịch sử (4 mục)', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Lịch sử · Khách TL-04', exact: true });
      await expect(sheet.locator('[data-timeline-entry]')).toHaveCount(12);
      await expect(sheet.locator('[data-timeline-group]')).toHaveCount(3);
      await checkLayout(sheet);
      const body = sheet.locator('[data-sheet-body]');
      expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const sheetRect = await rect(sheet);
      const viewport = page.viewportSize();
      if (!viewport) throw new Error('Thiếu kích thước màn hình');
      if (viewport.width < 1024) {
        expect(sheetRect.width).toBe(viewport.width);
        expect(Math.abs(sheetRect.y + sheetRect.height - viewport.height)).toBeLessThanOrEqual(2);
      } else {
        expect(Math.abs(sheetRect.x + sheetRect.width - viewport.width)).toBeLessThanOrEqual(2);
        expect(sheetRect.height).toBe(viewport.height);
      }
      await sheet.getByRole('button', { name: 'Sửa ghi chú', exact: true }).last().click();
      await sheet.getByRole('textbox', { name: 'Sửa ghi chú', exact: true }).fill('Ghi chú cũ đã sửa trong tấm');
      await sheet.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(sheet.getByText('Ghi chú cũ đã sửa trong tấm', { exact: true })).toBeVisible();
      await expect(page.getByText('Đã cập nhật ghi chú', { exact: true })).toBeVisible();
      await noOverflow(page, body);
      // Lọc trong tấm vẫn hiện đầy đủ, tab dùng cùng bộ lọc nhưng chỉ 8 kết quả.
      await sheet.getByRole('button', { name: /^Cuộc gọi/ }).click();
      await expect(sheet.locator('[data-timeline-entry]')).toHaveCount(9);
      await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(panel.locator('[data-timeline-entry]')).toHaveCount(8);
      await expect(panel.getByRole('button', { name: 'Xem toàn bộ lịch sử (1 mục)', exact: true })).toBeVisible();
      await panel.getByRole('button', { name: /^Ghi chú/ }).click();
      await expect(panel.locator('[data-timeline-entry]')).toHaveCount(3);
      await expect(panel.getByRole('button', { name: /Xem toàn bộ lịch sử/ })).toHaveCount(0);
      await expect(panel.getByText('Ghi chú cũ đã sửa trong tấm', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Tất cả', exact: true }).click();
      await panel.getByRole('button', { name: 'Xem toàn bộ lịch sử (4 mục)', exact: true }).click();
      await sheet.getByRole('button', { name: 'Sửa ghi chú', exact: true }).last().click();
      await sheet.getByRole('button', { name: 'Xoá', exact: true }).click();
      await page
        .getByRole('alertdialog', { name: 'Xoá mục này?' })
        .getByRole('button', { name: 'Xoá', exact: true })
        .click();
      await expect(sheet.locator('[data-timeline-entry]')).toHaveCount(11);
      await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
      await page.reload();
      await panel.getByRole('button', { name: 'Xem toàn bộ lịch sử (3 mục)', exact: true }).click();
      await expect(sheet.getByText('Ghi chú cũ đã sửa trong tấm', { exact: true })).toHaveCount(0);
      await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
      await page.goto('/today');
      await page.getByRole('button', { name: 'Mở Khách TL-04', exact: true }).click();
      const journey = page.getByRole('region', { name: 'Hành trình khách hàng' });
      const stages = journey.locator(':scope > ol > li');
      await expect(stages).toHaveCount(3);
      const sla = /^(Quá hạn|Đến hạn|Đúng mục tiêu)$/;
      await expect(stages.first().getByText(sla)).toBeVisible();
      for (const stage of (await stages.all()).slice(1)) await expect(stage.getByText(sla)).toHaveCount(0);
      await noOverflow(page, journey);
    });
  });
}
