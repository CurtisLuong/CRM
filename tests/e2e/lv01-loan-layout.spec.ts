import { expect, type Locator, type Page, test } from '@playwright/test';
import { compute, DEFAULT_LOAN, DEFAULT_SCHEDULE } from '../../src/domain/loan';

const money = (value: number) => Math.round(value).toLocaleString('vi-VN');
const savedInputs = (area = 53.6, code = '') => ({
  unit: { projectName: '', building: '', code, aptType: '', area, pricePerM2: 19911530, netOverride: null, fee: null },
  dates: { contractDate: '2026-10-05', handoverDate: '2027-11-15', titleAfterMonths: 1.5 },
  loan: structuredClone(DEFAULT_LOAN),
});

const USER = 'lv01-user';
const EMAIL = 'lv01@example.test';
const NAME = 'Nguyễn Tư Vấn';
const PHONE = '0901234567';

async function prepare(page: Page, theme: 'light' | 'dark') {
  await page.clock.install({ time: new Date('2026-11-12T10:00:00+07:00') });
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  await page.addInitScript((theme) => localStorage.setItem('sk-theme', theme), theme);
}

function quote(id: string, customerId: string, area: number, created: string) {
  const inputs = {
    ...savedInputs(area, id),
    consultant: { name: 'Tên tư vấn viên của phương án cũ', phone: '0999999999' },
    extension: { preserved: true },
  };
  return { id, customer_id: customerId, created_at: created, unit_code: id, inputs, summary: {} };
}

async function installAccount(page: Page, displayName = 'Tên trước khi sửa') {
  const quotes = [
    quote('PA-cu', 'customer-one', 60, '2026-11-01T03:00:00Z'),
    quote('PA-moi', 'customer-one', 75, '2026-11-12T03:00:00Z'),
    quote('PA-khach-hai', 'customer-two', 80, '2026-11-10T03:00:00Z'),
  ];
  const customers = ['customer-one', 'customer-two'].map((id, index) => ({
    id,
    owner_id: USER,
    full_name: `Khách ${index + 1}`,
    phone: `090000000${index}`,
    qualified_at: '2026-11-01T00:00:00Z',
    care_stage: 'Đang chăm sóc',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    call_attempts: [],
    next_tasks: [],
    interactions: [],
    projects: [],
  }));
  let name = displayName;
  let uiState = { profile: { phone: '', extra: 'giữ nguyên' }, retarget: { keep: true } };
  const writes: unknown[] = [];
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let data: unknown = [];
    if (table === 'team_list') data = [{ user_id: USER, full_name: name, email: EMAIL, is_me: true, is_admin: true }];
    if (table === 'team_set_my_name') {
      name = request.postDataJSON().new_name;
      data = null;
    }
    if (table === 'customers') data = customers;
    if (table === 'loan_quotes')
      data = quotes.filter((item) => `eq.${item.customer_id}` === url.searchParams.get('customer_id'));
    if (table === 'user_settings') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        uiState = body.ui_state;
      }
      data = { ui_state: uiState };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${customers.length - 1}/${customers.length}` },
      body: JSON.stringify(data),
    });
  });
  await page.addInitScript(
    ({ id, email }) => {
      const user = {
        id,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id, email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-lv01-token',
          refresh_token: 'synthetic-lv01-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    },
    { id: USER, email: EMAIL },
  );
  await page.goto('/');
  await page.evaluate(
    async ({ userId, customers }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`crm_khach_hang__${userId}`, 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('queue'))
            db.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        for (const customer of customers) tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: '2026-11-12T03:00:00Z' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { userId: USER, customers },
  );
  return { writes };
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error('Không đo được ô');
  return value;
}
async function sameRow(a: Locator, b: Locator) {
  const first = await box(a);
  const second = await box(b);
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(2);
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`LV-01 ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      test.skip(page.viewportSize()?.width === 390, 'Nghiệm thu 360 và 1280px.');
      await prepare(page, theme);
    });

    test('bố cục, bậc lãi, bảng tổng/tất toán và biểu đồ', async ({ page }, testInfo) => {
      await page.goto('/tinh-vay');
      const field = (label: string) => page.getByLabel(label, { exact: true });
      await field('Ngày ký hợp đồng').fill('2026-10-05');
      await field('Ngày bàn giao').fill('2027-11-15');
      await expect(page.getByRole('heading', { level: 1, name: 'Tính khoản vay' })).toHaveCount(0);
      await expect(page.getByText('Khách hàng (không bắt buộc)', { exact: true })).toHaveCount(1);
      await expect(field('Tên tư vấn viên')).toHaveCount(0);
      await expect(field('Lãi thả nổi giả định')).toHaveCount(0);
      expect(await page.locator('main h2.text-title').allTextContents()).toEqual([
        'Phương án đã lưu',
        'Căn hộ và tiến độ',
        'Thông số vay',
        'Kết quả tạm tính',
      ]);
      expect((await box(field('Khách hàng (không bắt buộc)'))).y).toBeLessThan(
        (await box(page.getByRole('heading', { name: 'Phương án đã lưu', exact: true }))).y,
      );
      await page.getByRole('checkbox', { name: 'Ân hạn gốc', exact: true }).check();
      for (const [a, b] of [
        ['Tỷ lệ vay', 'Thời hạn vay'],
        ['Số tiền vay', 'Bắt đầu giải ngân từ đợt'],
        ['Bậc 1: số tháng', 'Bậc 1: lãi suất'],
        ['Bậc 2: còn lại', 'Bậc 2: thả nổi'],
        ['Ân hạn gốc', 'Tính ân hạn từ giải ngân'],
        ['Tính lãi', 'Tất toán sau'],
      ])
        await sameRow(a === 'Ân hạn gốc' ? page.getByRole('spinbutton', { name: a, exact: true }) : field(a), field(b));
      const order = [
        'Gói vay',
        'Tỷ lệ vay',
        'Số tiền vay',
        'Bậc 1: số tháng',
        'Bậc 2: còn lại',
        'Tính ân hạn từ giải ngân',
        'Tính lãi',
        'Phí tất toán theo năm vay',
      ];
      const positions = await Promise.all(order.map(async (label) => (await box(field(label))).y));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      await page.getByRole('checkbox', { name: 'Ân hạn gốc', exact: true }).uncheck();
      await expect(field('Bậc 2: còn lại')).toHaveValue('240 tháng');
      await expect(field('Bậc 2: còn lại')).toHaveAttribute('readonly', '');
      await page.getByRole('button', { name: 'Thêm bậc lãi', exact: true }).click();
      await field('Bậc 2: số tháng').fill('60');
      await field('Bậc 2: lãi suất').fill('7.5');
      await expect(field('Bậc 3: còn lại')).toHaveValue('180 tháng');
      await sameRow(field('Bậc 2: số tháng'), field('Bậc 2: lãi suất'));
      await sameRow(field('Bậc 3: còn lại'), field('Bậc 3: thả nổi'));
      const input = savedInputs();
      input.dates.handoverDate = '2027-11-15';
      input.loan.rateTiers = [
        { months: 60, rate: 6.5 },
        { months: 60, rate: 7.5 },
      ];
      const expected = compute({
        unit: input.unit,
        dates: input.dates,
        loan: input.loan,
        schedule: DEFAULT_SCHEDULE.map((milestone) =>
          milestone.role === 'title' ? { ...milestone, due: { type: 'afterHandoverMonths', value: 1.5 } } : milestone,
        ),
      });
      const totals = page.getByRole('table', { name: 'Tổng', exact: true });
      await expect(
        totals.getByRole('row', { name: `Tổng lãi ${money(expected.schedule?.totalInterest ?? 0)} đ` }),
      ).toBeVisible();
      const debt = page.getByRole('table', { name: 'Trả nợ theo năm', exact: true });
      const payoff = page.getByRole('table', { name: 'Tất toán sau 60 tháng', exact: true });
      expect((await box(totals)).y).toBeGreaterThan((await box(debt)).y + (await box(debt)).height);
      expect((await box(payoff)).y).toBeGreaterThan((await box(totals)).y);
      await expect(payoff).toContainText(money(expected.payoff?.totalToPay ?? 0));
      await expect(page.getByRole('img', { name: 'Trả nợ mỗi tháng' })).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Theo tháng', exact: true })).toHaveCount(1);
      await page.getByRole('button', { name: 'Xem biểu đồ', exact: true }).click();
      await expect(page.getByRole('img', { name: 'Trả nợ mỗi tháng', exact: true })).toBeVisible();
      const chart = page.getByRole('group', { name: 'Biểu đồ trả nợ', exact: true });
      await chart.getByRole('button', { name: 'Theo năm', exact: true }).click();
      await expect(page.getByRole('img', { name: 'Trả nợ trung bình tháng theo năm' })).toBeVisible();
      await chart.getByRole('button', { name: 'Theo tháng', exact: true }).click();
      await expect(page.getByRole('img', { name: 'Trả nợ mỗi tháng', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Thu gọn', exact: true }).click();
      await expect(chart).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'In / Lưu PDF A4', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Lưu phương án', exact: true })).toBeVisible();
      await field('Bậc 1: số tháng').fill('300');
      await expect(field('Bậc 3: còn lại')).toHaveValue('0 tháng');
      await expect(page.getByText('Các bậc cố định đã phủ hết thời hạn vay;', { exact: false })).toHaveClass(
        /text-hint/,
      );
      await expect(totals).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`lv01-${theme}.png`), fullPage: true });
    });

    test('phương án mới nhất tự mở, chạm để đổi, đổi khách và URL thắng; cache ngoại tuyến', async ({ page }) => {
      await installAccount(page);
      await page.goto('/tinh-vay?customerId=customer-one');
      const area = page.getByLabel('Diện tích', { exact: true });
      await expect(area).toHaveValue('75');
      const latest = page.getByRole('button', { name: /^PA-moi/ });
      await expect(latest).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: /^PA-cu/ }).click();
      await expect(area).toHaveValue('60');
      await expect(latest).toHaveAttribute('aria-pressed', 'false');
      await page.getByLabel('Khách hàng (không bắt buộc)', { exact: true }).selectOption('customer-two');
      await expect(area).toHaveValue('80');
      await expect(page.getByRole('button', { name: /^PA-khach-hai/ })).toHaveAttribute('aria-pressed', 'true');
      await page.goto('/tinh-vay?customerId=customer-one&code=CAN-URL&area=90');
      await expect(latest).toBeVisible();
      await expect(area).toHaveValue('90');
      await expect(page.getByLabel('Mã căn', { exact: true })).toHaveValue('CAN-URL');
      await expect(latest).toHaveAttribute('aria-pressed', 'false');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        window.dispatchEvent(new Event('offline'));
      });
      // Điều hướng nội bộ để dùng đúng bản cache khi trình duyệt đã ngoại tuyến.
      await page.getByLabel('Khách hàng (không bắt buộc)', { exact: true }).selectOption('customer-two');
      await expect(area).toHaveValue('90'); // URL vẫn ưu tiên, kể cả khi đổi khách.
    });

    test('thiếu tên dùng email, thiếu SĐT chỉ in tên', async ({ page, context }) => {
      await installAccount(page, '');
      await context.addInitScript(() => {
        window.print = () => {};
      });
      await page.goto('/tinh-vay?customerId=customer-one');
      await expect(page.getByLabel('Diện tích', { exact: true })).toHaveValue('75');
      const popupPromise = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'In / Lưu PDF A4', exact: true }).click();
      const popup = await popupPromise;
      const consultant = popup.locator('p').filter({ hasText: 'Tư vấn viên:' });
      await expect(consultant).toHaveText(`Tư vấn viên: ${EMAIL}`);
    });

    test('lưu tên/SĐT ở Nhóm → phiếu in; giữ khoá lạ và dùng lại ngoại tuyến', async ({ page, context }) => {
      const { writes } = await installAccount(page);
      await context.addInitScript(() => {
        window.print = () => {};
      });
      await page.goto('/dong-nghiep');
      await expect(page.getByRole('button', { name: 'Lưu tên', exact: true })).toBeEnabled();
      await page.getByLabel('Tên hiển thị', { exact: true }).fill(NAME);
      await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
      await expect(page.getByText(`${NAME} · Bạn`, { exact: true })).toBeVisible();
      const phone = page.getByLabel('Số điện thoại của bạn', { exact: true });
      expect((await box(phone)).y).toBeGreaterThan((await box(page.getByLabel('Tên hiển thị', { exact: true }))).y);
      await phone.fill(PHONE);
      await page.getByRole('button', { name: 'Lưu số điện thoại', exact: true }).click();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0]).toMatchObject({
        ui_state: { profile: { phone: PHONE, extra: 'giữ nguyên' }, retarget: { keep: true } },
      });
      await page.goto('/tinh-vay?customerId=customer-one');
      await expect(page.getByLabel('Diện tích', { exact: true })).toHaveValue('75');
      await expect
        .poll(() =>
          page.evaluate((id) => JSON.parse(localStorage.getItem(`crm_profile:${id}`) || '{}').profile?.phone, USER),
        )
        .toBe(PHONE);
      // Bản đã lưu có consultant cũ vẫn mở được, phiếu lấy hồ sơ hiện tại.
      const popupPromise = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'In / Lưu PDF A4', exact: true }).click();
      const popup = await popupPromise;
      await expect(popup.locator('body')).toContainText(`Tư vấn viên: ${NAME} · ${PHONE}`);
      await popup.close();
      await page.goto('/dong-nghiep');
      await expect(phone).toHaveValue(PHONE);
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        window.dispatchEvent(new Event('offline'));
      });
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Tính khoản vay', exact: true }).click();
      await page.getByLabel('Khách hàng (không bắt buộc)', { exact: true }).selectOption('customer-one');
      await expect(page.getByLabel('Diện tích', { exact: true })).toHaveValue('75');
      const offlinePopupPromise = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'In / Lưu PDF A4', exact: true }).click();
      const offlinePopup = await offlinePopupPromise;
      await expect(offlinePopup.locator('body')).toContainText(`Tư vấn viên: ${NAME} · ${PHONE}`);
    });
  });
}
