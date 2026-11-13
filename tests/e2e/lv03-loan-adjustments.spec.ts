import { expect, type Locator, type Page, test } from '@playwright/test';
import { compute, DEFAULT_LOAN } from '../../src/domain/loan';

const WARNING = 'Số liệu tạm tính để tham khảo nhanh. CHƯA phải chính thức.';
const USER = 'lv03-user';
const PROJECTS = [
  { id: 'project-a', name: 'Dự án A', vat_rate: 10, kpbt_rate: 3, handover_date: '2027-11-15' },
  { id: 'project-b', name: 'Dự án B', vat_rate: 0, kpbt_rate: 1, handover_date: '2028-01-15' },
];
function sample(code = '') {
  return {
    unit: {
      projectName: '',
      building: '',
      code,
      aptType: '',
      area: 53.6,
      pricePerM2: 19911530,
      netOverride: null,
      fee: null,
      vatRate: 5,
      kpbtRate: 2,
    },
    dates: { contractDate: '2026-10-05', handoverDate: '2027-11-15', titleAfterMonths: 1.5 },
    loan: structuredClone(DEFAULT_LOAN),
  };
}
type Quote = { id: string; created_at: string; unit_code: string; inputs: ReturnType<typeof sample>; summary: unknown };

async function prepare(page: Page, theme: 'light' | 'dark') {
  await page.clock.install({ time: new Date('2026-11-13T10:00:00+07:00') });
  await page.addInitScript((theme) => localStorage.setItem('sk-theme', theme), theme);
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
}

async function installAccount(page: Page) {
  const server = { quotes: [] as Quote[], writes: [] as string[], readError: false };
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const table = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) server.writes.push(table);
    if (table === 'loan_quotes' && request.method() === 'GET' && server.readError) {
      await route.fulfill({ status: 500, json: { message: 'Không đọc được phương án thử.' } });
      return;
    }
    let data: unknown = [];
    if (table === 'projects') data = PROJECTS;
    if (table === 'team_list')
      data = [{ user_id: USER, full_name: 'Nguyễn Tư Vấn', email: 'lv03@example.test', is_me: true }];
    if (table === 'user_settings') data = { ui_state: { profile: { phone: '0901234567' } } };
    if (table === 'loan_quotes') {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON();
        const id = `PA-${server.quotes.length + 1}`;
        server.quotes.unshift({ ...payload, id, created_at: `2026-11-13T03:0${server.quotes.length}:00Z` });
        data = { id };
      } else data = server.quotes;
    }
    const count = Array.isArray(data) ? data.length : 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': count ? `0-${count - 1}/${count}` : '*/0',
        'access-control-expose-headers': 'content-range',
      },
      body: JSON.stringify(data),
    });
  });
  await page.addInitScript((id) => {
    const email = 'lv03@example.test';
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-lv03-token',
        refresh_token: 'synthetic-lv03-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id,
          email,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: '2026-10-01T00:00:00Z',
        },
      }),
    );
  }, USER);
  await page.goto('/');
  await page.evaluate(async (userId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${userId}`, 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('customers', { keyPath: 'id' });
        request.result.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        request.result.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: 'legacy-imported', at: '2026-11-13T03:00:00Z' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, USER);
  return server;
}

const field = (page: Page, name: string) => page.getByLabel(name, { exact: true });
const section = (page: Page, name: string) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .last();
async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('Không đo được phần tử');
  return bounds;
}
async function geometry(control: Locator) {
  return control.evaluate((input) => {
    const label = input.id
      ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
      : input.closest('label')?.firstElementChild;
    const border = input.getAttribute('type') === 'number' ? input.parentElement : input;
    if (!label || !border) throw new Error('Thiếu nhãn hoặc ô');
    const a = label.getBoundingClientRect();
    const b = border.getBoundingClientRect();
    return { x: b.x, top: b.top, bottom: b.bottom, labelTop: a.top, labelGap: b.top - a.bottom };
  });
}
async function density(page: Page, names: string[]) {
  const fields = await Promise.all(names.map((name) => geometry(field(page, name))));
  for (const [index, bounds] of fields.entries()) {
    expect(Math.abs(bounds.labelGap - 6), names[index]).toBeLessThanOrEqual(2);
  }
  const rows: (typeof fields)[] = [];
  for (const bounds of fields) {
    const row = rows.find((items) => Math.abs((items[0]?.top ?? 0) - bounds.top) < 2);
    if (row) row.push(bounds);
    else rows.push([bounds]);
  }
  rows.sort((a, b) => (a[0]?.top ?? 0) - (b[0]?.top ?? 0));
  const gaps = rows.slice(1).map((row, index) => {
    const previous = rows[index] ?? [];
    return Math.min(...row.map((bounds) => bounds.labelTop)) - Math.max(...previous.map((bounds) => bounds.bottom));
  });
  for (const gap of gaps) expect(Math.abs(gap - 12)).toBeLessThanOrEqual(2);
  return fields[0]?.labelGap ?? 0;
}

for (const theme of ['light', 'dark'] as const) {
  test(`LV-03: cảnh báo, nhãn, nhịp 6/12 và ảnh ${theme}`, async ({ page }, info) => {
    test.skip(page.viewportSize()?.width === 390, 'Nghiệm thu ảnh 360/1280px.');
    await prepare(page, theme);
    await page.goto('/tinh-vay');
    await field(page, 'Ngày ký hợp đồng').fill('2026-10-05');
    await field(page, 'Ngày bàn giao').fill('2027-11-15');
    await page.evaluate(() => document.fonts.ready);
    const warning = page.getByRole('note');
    await expect(warning).toHaveText(WARNING);
    await expect(warning).toHaveCSS('font-size', '15px');
    await expect(warning).toHaveCSS('font-weight', '700');
    await expect(warning).toHaveClass(/bg-soon-tint/);
    await expect(warning.locator('svg')).toHaveCount(1);
    const saved = section(page, 'Phương án đã lưu');
    await expect(saved.getByText('Chưa lưu phương án nào.', { exact: true })).toBeVisible();
    await expect(saved.locator('[data-form-card] p')).toHaveCount(1);
    expect((await box(saved.locator('[data-form-card]'))).height).toBeLessThan(60);
    await expect(field(page, 'VAT')).toHaveValue('5');
    await expect(field(page, 'KPBT')).toHaveValue('2');
    await expect(field(page, 'Số tiền vay')).toHaveCount(0);
    for (const [name, note] of [
      ['Giá thuần', '(diện tích × đơn giá)'],
      ['Tỷ lệ vay', '(max 80%)'],
      ['Tiền vay', '(max 896,5 tr)'],
      ['Phí tất toán theo năm vay', '(%, phân cách dấu phẩy)'],
    ]) {
      const control = field(page, name ?? '');
      await expect(control).toHaveAccessibleName(name ?? '');
      await expect(control).toHaveAccessibleDescription(note ?? '');
      const id = await control.getAttribute('aria-describedby');
      const description = page.locator(`[id="${id}"]`);
      await expect(description).toBeVisible();
      expect((await box(description)).y).toBeLessThan((await box(control)).y);
    }
    await expect(page.getByText(/Tự tính =|Tối đa 80% =|VAT 5% · KPBT/)).toHaveCount(0);
    const apartment = await density(page, [
      'Dự án',
      'Toà',
      'Mã căn',
      'Loại căn',
      'Diện tích',
      'Đơn giá',
      'Phí',
      'VAT',
      'KPBT',
      'Giá thuần',
    ]);
    const loan = await density(page, ['Gói vay', 'Tỷ lệ vay', 'Thời hạn vay', 'Tiền vay', 'Bắt đầu giải ngân từ đợt']);
    expect(Math.abs(apartment - loan)).toBeLessThanOrEqual(2);
    for (const [title, name] of [
      ['Tiến độ', 'Ngày ký hợp đồng'],
      ['Bậc lãi suất', 'Bậc 1: số tháng'],
      ['Trả nợ', 'Tính lãi'],
    ]) {
      const heading = section(page, title ?? '').getByRole('heading', { name: title, exact: true });
      expect(Math.abs((await box(heading)).x - (await geometry(field(page, name ?? ''))).x)).toBeLessThanOrEqual(1);
    }
    const vat = await geometry(field(page, 'VAT'));
    const kpbt = await geometry(field(page, 'KPBT'));
    expect(Math.abs(vat.top - kpbt.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(vat.labelTop - (await geometry(field(page, 'Đơn giá'))).bottom - 12)).toBeLessThanOrEqual(2);
    await expect(page.getByRole('button', { name: 'Cập nhật ngày bàn giao vào dự án' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`lv03-${theme}.png`), fullPage: true });
  });

  test(`LV-03: thuế dự án, sửa riêng, lưu/mở 0/1/2 dòng và PDF ${theme}`, async ({ page, context }, info) => {
    test.skip(page.viewportSize()?.width === 390, 'Nghiệm thu 360/1280px.');
    await prepare(page, theme);
    const server = await installAccount(page);
    await context.addInitScript(() => {
      window.print = () => {};
    });
    await page.goto('/tinh-vay?projectName=D%E1%BB%B1%20%C3%A1n%20A&code=A-101');
    await expect(page.locator('#loan-projects option')).toHaveCount(2);
    await expect(field(page, 'VAT')).toHaveValue('10');
    await expect(field(page, 'KPBT')).toHaveValue('3');
    const saved = section(page, 'Phương án đã lưu');
    await expect(saved.getByText('Chưa lưu phương án nào.', { exact: true })).toBeVisible();
    await field(page, 'Ngày ký hợp đồng').fill('2026-10-05');
    await field(page, 'Ngày bàn giao').fill('2027-12-15');
    await field(page, 'VAT').fill('7.5');
    await field(page, 'KPBT').fill('1.5');
    const state = sample();
    state.unit.vatRate = 7.5;
    state.unit.kpbtRate = 1.5;
    state.dates.handoverDate = '2027-12-15';
    const expected = compute({ unit: state.unit, dates: state.dates, loan: state.loan });
    const price = page.getByRole('table', { name: 'Phiếu giá', exact: true });
    await expect(price).toContainText(Math.round(expected.price.full).toLocaleString('vi-VN'));
    await page.getByRole('button', { name: 'Lưu phương án', exact: true }).click();
    await expect(saved.locator('li')).toHaveCount(1);
    expect(server.quotes[0]?.inputs.unit).toMatchObject({ vatRate: 7.5, kpbtRate: 1.5 });
    await expect(saved.getByRole('button', { pressed: true })).toContainText('A-101');
    await expect(saved.getByRole('button', { pressed: true })).toContainText('Đang mở');
    await expect(saved.getByRole('button', { pressed: true })).toHaveClass(/bg-ion-tint/);
    const firstHeight = (await box(saved.locator('[data-form-card]'))).height;
    expect((await box(saved.locator('li'))).height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`lv03-one-${theme}.png`), fullPage: true });
    await field(page, 'Dự án').fill('Dự án B');
    await expect(field(page, 'VAT')).toHaveValue('0');
    await expect(field(page, 'KPBT')).toHaveValue('1');
    await field(page, 'Mã căn').fill('B-202');
    await page.getByRole('button', { name: 'Lưu phương án', exact: true }).click();
    await expect(saved.locator('li')).toHaveCount(2);
    const cardHeight = (await box(saved.locator('[data-form-card]'))).height;
    const heights = await Promise.all([0, 1].map(async (index) => (await box(saved.locator('li').nth(index))).height));
    expect(heights.every((height) => height >= 44)).toBe(true);
    expect(Math.abs(cardHeight - firstHeight - (heights[0] ?? 0))).toBeLessThanOrEqual(1);
    await saved.getByRole('button').filter({ hasText: 'A-101' }).click();
    await expect(field(page, 'VAT')).toHaveValue('7.5');
    await expect(field(page, 'KPBT')).toHaveValue('1.5');
    await expect(field(page, 'Ngày bàn giao')).toHaveValue('2027-12-15');
    await expect(price).toContainText(Math.round(expected.price.full).toLocaleString('vi-VN'));
    await expect(saved.getByRole('button', { pressed: true })).toContainText('A-101');
    await expect(saved.getByRole('button').filter({ hasText: 'B-202' })).toContainText('Mở');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`lv03-two-${theme}.png`), fullPage: true });
    await expect(page.getByRole('button', { name: 'Cập nhật ngày bàn giao vào dự án' })).toHaveCount(0);
    expect(server.writes.filter((table) => ['projects', 'buildings', 'units'].includes(table))).toEqual([]);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'In / Lưu PDF A4', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup.getByRole('note')).toHaveText(WARNING);
    await expect(popup.getByRole('note')).toHaveCSS('font-size', '15px');
    await expect(popup.getByRole('note')).toHaveCSS('border-top-width', '2px');
    await expect(popup.locator('p').filter({ hasText: 'Tư vấn viên:' })).toHaveText(
      'Tư vấn viên: Nguyễn Tư Vấn · 0901234567',
    );
    expect(
      await popup.locator('.lm-print').evaluate((report) =>
        Array.from(report.children)
          .slice(0, 5)
          .map((node) => node.tagName),
      ),
    ).toEqual(['H1', 'DIV', 'DIV', 'P', 'DIV']);
    await expect(popup.locator('.sub')).toContainText('(PTG tạm tính');
    await expect(popup.locator('.foot')).not.toContainText('Tư vấn viên:');
    await expect(popup.locator('body')).toContainText('VAT (7.5%)');
    await expect(popup.locator('body')).toContainText('Số tiền vay');
    if (info.project.name === 'desktop-1280') {
      await popup.pdf({
        path: info.outputPath(`lv03-${theme}.pdf`),
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      await popup.screenshot({ path: info.outputPath(`lv03-print-${theme}.png`), fullPage: true });
    }
    await popup.close();
    await page.reload();
    await saved.getByRole('button').filter({ hasText: 'A-101' }).click();
    await expect(field(page, 'VAT')).toHaveValue('7.5');
    await expect(field(page, 'KPBT')).toHaveValue('1.5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('LV-03: đọc lỗi không hiển thị trống, giữ cache và thử lại được', async ({ page }) => {
  await prepare(page, 'light');
  const server = await installAccount(page);
  server.readError = true;
  await page.goto('/tinh-vay');
  const saved = section(page, 'Phương án đã lưu');
  await expect(saved.getByRole('alert')).toContainText('Chưa tải được phương án');
  await expect(saved.getByText('Chưa lưu phương án nào.')).toHaveCount(0);
  const state = sample('CAN-CACHE');
  state.dates.handoverDate = '2027-11-15';
  server.quotes.push({
    id: 'cached',
    created_at: '2026-11-13T03:00:00Z',
    unit_code: 'CAN-CACHE',
    inputs: state,
    summary: {},
  });
  server.readError = false;
  await saved.getByRole('button', { name: 'Thử lại' }).click();
  await expect(saved.locator('li')).toHaveCount(1);
  await expect(saved.getByRole('alert')).toHaveCount(0);
  server.readError = true;
  await page.reload();
  await expect(saved.getByRole('alert')).toBeVisible();
  await expect(saved.locator('li')).toHaveCount(1);
  await expect(saved.getByText('Chưa lưu phương án nào.')).toHaveCount(0);
});
