import { expect, type Locator, type Page, test } from '@playwright/test';

const userId = 'ui03a-e2e-user';
const NOW = new Date(2026, 10, 8, 9, 30);
const AT = NOW.toISOString();
const customer = {
  id: 'ui03a-customer',
  owner_id: userId,
  full_name: 'Nguyễn Thị Hưởng',
  phone: '0901234567',
  care_stage: 'Nuôi dài hạn',
  care_stage_updated_at: AT,
  qualified_at: AT,
  created_at: AT,
  updated_at: AT,
  gender: 'Nữ',
  dob: '1985-08-15',
  marital_status: 'Đã kết hôn',
  occupation: 'Giáo viên',
  income: '25 triệu',
  residence: 'Hải Phòng',
  contact_prefs: { channel: 'Zalo', slot: '18:00–20:00' },
  projects: [],
  next_tasks: [],
  call_attempts: [],
  notes_manual: [],
  advanced: {
    life_context: 'Đang thuê nhà, cần gần trường học',
    capital: 800000000,
    assets_total: 1200000000,
    loan_need: 400000000,
    x_old: 'Ghi cũ vẫn giữ',
  },
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
  // TL-03 (09/11): hồ sơ mở sẵn tab Dòng thời gian → chuyển sang Nhu cầu & căn.
  await page.getByRole('tab', { name: 'Nhu cầu & căn' }).click();
}

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) throw new Error('Không đo được ô đang hiển thị');
  return rect;
}

async function sameRow(a: Locator, b: Locator) {
  const first = await box(a);
  const second = await box(b);
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(2);
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function contained(advanced: Locator, title: string, field: Locator) {
  const card = advanced.locator('[data-form-card]');
  const group = advanced
    .locator('[data-form-subsection]')
    .filter({ has: advanced.page().getByRole('heading', { name: title, exact: true }) });
  const cardBox = await box(card);
  const headBox = await box(group.getByRole('heading', { name: title, exact: true }));
  const fieldBox = await box(field);
  expect(headBox.x - cardBox.x).toBeGreaterThan(20);
  expect(fieldBox.x).toBeGreaterThanOrEqual(headBox.x);
  expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
  expect(
    await field.evaluate((el, container) => el.closest('[data-form-card]') === container, await card.elementHandle()),
  ).toBe(true);
  const button = advanced.getByRole('button', { name: 'Nâng cao' });
  expect(
    await button.evaluate((el) =>
      el.closest('[data-form-card]')?.contains(document.getElementById(el.getAttribute('aria-controls') || '')),
    ),
  ).toBe(true);
  expect(await card.locator('[data-form-card]').count()).toBe(0);
}

for (const theme of ['light', 'dark'] as const) {
  test(`UI-03a: thẻ và mục con tab Nhu cầu & căn (${theme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page, customer);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const more = page.getByRole('button', { name: /^Mở rộng \(\d+\)$/ });
    if (await more.count()) await more.click();
    const advanced = page.getByRole('region', { name: 'Nhu cầu nâng cao' });
    await advanced.getByRole('button', { name: 'Nâng cao' }).click();
    for (const [title, label] of [
      ['Sở thích bất động sản', 'Khu vực'],
      ['Nhu cầu theo đợt', 'Dự án quan tâm mới'],
      ['Người cùng quyết định', 'Tên người cùng quyết định'],
    ])
      await contained(advanced, title, page.getByLabel(label, { exact: true }));
    await sameRow(page.getByLabel('Dự án quan tâm mới'), page.getByLabel('Loại căn đợt mới'));
    await sameRow(page.getByLabel('Ngân sách đợt mới'), page.getByLabel('Mục đích đợt mới'));
    await sameRow(page.getByLabel('Tên người cùng quyết định'), page.getByLabel('Vai trò người cùng quyết định'));
    if (testInfo.project.name === 'desktop-1280') {
      await sameRow(page.getByLabel('Loại căn đợt mới'), page.getByLabel('Mục đích đợt mới'));
      await sameRow(
        page.getByLabel('Vai trò người cùng quyết định'),
        page.getByLabel('Số điện thoại người cùng quyết định'),
      );
    }
    const area = await box(page.getByLabel('Khu vực', { exact: true }));
    for (const label of ['Loại sản phẩm', 'Điều kiện']) {
      const long = await box(page.getByLabel(label, { exact: true }));
      expect(Math.abs(long.width - area.width)).toBeLessThanOrEqual(2);
      expect(long.y).toBeGreaterThan(area.y);
    }
    for (const [name, label] of [
      ['Thêm đợt', 'Dự án quan tâm mới'],
      ['Thêm người', 'Tên người cùng quyết định'],
    ]) {
      const button = page.getByRole('button', { name });
      expect((await box(button)).width).toBeLessThan(
        (await box(page.getByLabel(label).locator('xpath=ancestor::section[@data-form-subsection]'))).width * 0.8,
      );
    }
    const note = await box(page.getByLabel('Ghi chú người cùng quyết định'));
    const role = await box(page.getByLabel('Vai trò người cùng quyết định'));
    expect(note.width).toBeGreaterThan(role.width * 1.5);
    await noOverflow(page);
    await advanced.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`ui03a-needs-${theme}.png`), fullPage: true });
    await advanced.getByRole('button', { name: 'Nâng cao' }).click();
    await expect(page.getByLabel('Dự án quan tâm mới')).toHaveCount(0);
  });

  test(`UI-03a: thẻ và ô ngắn tab Trí nhớ (${theme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page, customer);
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    for (const label of ['Số điện thoại', 'Kênh liên hệ ưu tiên', 'Lý do kết thúc']) {
      expect(await page.getByLabel(label, { exact: true }).evaluate((el) => !!el.closest('[data-form-card]'))).toBe(
        true,
      );
    }
    await sameRow(page.getByLabel('Kênh liên hệ ưu tiên'), page.getByLabel('Khung giờ liên hệ'));
    await sameRow(page.getByLabel('Liên hệ lại sau ngày'), page.getByLabel('Ngân sách tối đa', { exact: true }));
    const advanced = page.getByRole('region', { name: 'Hồ sơ nâng cao' });
    await advanced.getByRole('button', { name: 'Nâng cao' }).click();
    await contained(advanced, 'Bối cảnh sống', page.getByLabel('Bối cảnh sống', { exact: true }));
    await contained(advanced, 'Tài sản', page.getByLabel('Giá trị tài sản'));
    await sameRow(page.getByLabel('Giá trị tài sản'), page.getByLabel('Vốn hiện có'));
    if (testInfo.project.name === 'desktop-1280')
      await sameRow(page.getByLabel('Vốn hiện có'), page.getByLabel('Nhu cầu vay'));
    const unknown = advanced
      .locator('[data-form-subsection]')
      .filter({ has: page.getByRole('heading', { name: 'Trường cũ khác' }) });
    expect((await box(unknown.getByRole('heading'))).x).toBeGreaterThan(
      (await box(advanced.locator('[data-form-card]'))).x + 20,
    );
    await noOverflow(page);
    await advanced.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`ui03a-memory-${theme}.png`), fullPage: true });
    await advanced.getByRole('button', { name: 'Nâng cao' }).click();
    await expect(page.getByLabel('Bối cảnh sống')).toHaveCount(0);
  });
}

test('UI-03a: mẫu sống khuôn form trên UI kit', async ({ page }, testInfo) => {
  await open(page, customer);
  await page.goto('/dev/ui-kit');
  const demo = page.locator('#form-sections');
  await expect(demo.getByRole('heading', { name: 'Thông tin liên hệ mẫu' })).toBeVisible();
  await demo.getByRole('button', { name: 'Nâng cao' }).click();
  await sameRow(demo.getByLabel('Ngân sách mẫu'), demo.getByLabel('Thời điểm mẫu'));
  await contained(
    demo.getByRole('region', { name: 'Khuôn nâng cao mẫu' }),
    'Nhu cầu mẫu',
    demo.getByLabel('Ngân sách mẫu'),
  );
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: theme === 'light' ? 'Sáng' : 'Tối', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await demo.scrollIntoViewIfNeeded();
    await demo.screenshot({ path: testInfo.outputPath(`ui03a-kit-${theme}.png`) });
  }
});

test('UI-03a: thanh tab không chồng header khi cuộn hồ sơ dài', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-1280', 'Header desktop luôn hiện');
  await open(page, customer);
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();
  await page.getByRole('button', { name: 'Nâng cao' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => {
    const contact = document.querySelector('[data-jump="contact"]');
    if (!contact) throw new Error('Thiếu khu Tuỳ chọn liên hệ');
    window.scrollTo(0, contact.getBoundingClientRect().top + scrollY - 150);
  });
  await page.waitForTimeout(300);
  const overlaps = await page.evaluate(async () => {
    const header = document.querySelector('header');
    const tabs = document.querySelector('[role="tablist"][aria-label="Nội dung hồ sơ khách"]');
    if (!header || !tabs) throw new Error('Thiếu thanh đầu hoặc tab hồ sơ');
    // Cuộn ngược lên: header xuất hiện trong khi tab vẫn đang dính.
    window.scrollBy(0, -120);
    const rows = [];
    for (let i = 0; i < 24; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      rows.push(header.getBoundingClientRect().bottom - tabs.getBoundingClientRect().top);
    }
    return rows;
  });
  expect(Math.max(...overlaps)).toBeLessThanOrEqual(1);
  const tabBox = await page.getByRole('tablist', { name: 'Nội dung hồ sơ khách' }).boundingBox();
  const headerBox = await page.locator('header').first().boundingBox();
  expect(tabBox?.y).toBeGreaterThanOrEqual((headerBox?.y || 0) + (headerBox?.height || 0) - 1);
});
