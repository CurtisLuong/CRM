import { expect, type Page, test } from '@playwright/test';

async function session(page: Page, uid: string, theme: 'light' | 'dark') {
  await page.clock.install({ time: new Date('2026-11-09T03:00:00.000Z') });
  await page.emulateMedia({ colorScheme: theme });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === '54321') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.addInitScript(
    ({ id, color }) => {
      const user = {
        id,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'mn01@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-11-01T00:00:00.000Z',
      };
      localStorage.setItem('sk-theme', color);
      localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-mn01-token',
          refresh_token: 'synthetic-mn01-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    },
    { id: uid, color: theme },
  );
  await page.goto('/');
}

async function seed(page: Page, uid: string) {
  await page.evaluate(async (userId) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('customers', { keyPath: 'id' });
      db.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      const base = {
        owner_id: userId,
        care_stage: 'Nuôi dài hạn',
        qualified_at: '2026-11-01T00:00:00Z',
        care_stage_updated_at: '2026-11-09T02:00:00Z',
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-09T02:00:00Z',
        next_tasks: [],
        call_attempts: [],
        notes_manual: [],
        projects: [],
        x_future: { keep: true },
      };
      tx.objectStore('customers').put({
        ...base,
        id: 'mn01-known',
        full_name: 'Khách Tiền',
        phone: '0901234567',
        income: '25tr',
        advanced: { capital: 1_250_000_000, asset_value: 2_058_000_000, x_keep: { keep: true } },
        interests: [{ id: 'i1', project: 'Đợt cũ', status: 'open', budget_max: 1_200_000_000, x_keep: 1 }],
        retarget_hint: { max_price: 1_200_000_000, note: 'Giữ điều kiện', x_keep: true },
      });
      tx.objectStore('customers').put({
        ...base,
        id: 'mn01-unknown',
        full_name: 'Khách Thu Nhập Cũ',
        phone: '0901234568',
        income: 'lương cứng + hoa hồng',
        advanced: { capital: 1_250_000_000, x_keep: { keep: true } },
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, uid);
}

async function local(page: Page, uid: string) {
  return page.evaluate(async (userId) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<{ customers: Record<string, unknown>[]; queue: unknown[] }>((resolve, reject) => {
      const tx = db.transaction(['customers', 'queue'], 'readonly');
      const customers = tx.objectStore('customers').getAll();
      const queue = tx.objectStore('queue').getAll();
      tx.oncomplete = () => resolve({ customers: customers.result, queue: queue.result });
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return result;
  }, uid);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

async function openAdvanced(page: Page) {
  const more = page.getByRole('button', { name: /^Mở rộng \(\d+\)$/ });
  if (await more.count()) await more.click();
  await page.getByRole('button', { name: 'Nâng cao', exact: true }).click();
}

for (const theme of ['light', 'dark'] as const) {
  test(`MN-01 hồ sơ: tiền, thu nhập cũ, ngân sách và patch (${theme})`, async ({ page }, info) => {
    const uid = `mn01-profile-${info.project.name}-${theme}`;
    await session(page, uid, theme);
    await seed(page, uid);
    await page.goto('/ho-so/mn01-known');
    await expect(page.getByRole('heading', { name: 'Khách Tiền', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByRole('tab', { name: 'Trí nhớ', exact: true }).click();
    const income = page.getByLabel('Thu nhập', { exact: true });
    await expect(income).toHaveValue('25');
    await expect(income.locator('..')).toContainText('triệu/tháng');
    await openAdvanced(page);
    const capital = page.getByLabel('Vốn hiện có', { exact: true });
    await expect(capital).toHaveValue('1,25');
    await expect(capital.locator('..')).toContainText('tỷ');
    const before = await local(page, uid);
    await capital.focus();
    await expect(capital).toHaveValue('1250');
    await expect(capital.locator('..')).toContainText('triệu');
    await capital.blur();
    expect(await local(page, uid)).toEqual(before);
    await capital.fill('500');
    await capital.blur();
    await expect(capital).toHaveValue('500');
    await expect(capital.locator('..')).toContainText('triệu');
    await expect
      .poll(async () => (await local(page, uid)).customers.find((row) => row.id === 'mn01-known')?.advanced)
      .toEqual({ capital: 500_000_000, asset_value: 2_058_000_000, x_keep: { keep: true } });
    await capital.fill('1250');
    await capital.blur();
    await expect(capital).toHaveValue('1,25');
    await expect(capital.locator('..')).toContainText('tỷ');
    await capital.focus();
    await expect(capital).toHaveValue('1250');
    await capital.blur();
    await expect
      .poll(async () => (await local(page, uid)).customers.find((row) => row.id === 'mn01-known')?.advanced)
      .toEqual({ capital: 1_250_000_000, asset_value: 2_058_000_000, x_keep: { keep: true } });
    await income.fill('30');
    await income.blur();
    await expect
      .poll(async () => (await local(page, uid)).customers.find((row) => row.id === 'mn01-known')?.income)
      .toBe('30 triệu/tháng');
    await noOverflow(page);

    await page.getByRole('tab', { name: 'Nhu cầu & căn', exact: true }).click();
    await openAdvanced(page);
    await expect(page.getByText('Ngân sách tối đa: 1,2 tỷ', { exact: true })).toBeVisible();
    await noOverflow(page);

    await page.goto('/ho-so/mn01-unknown');
    await page.getByRole('tab', { name: 'Trí nhớ', exact: true }).click();
    await expect(income).toHaveValue('lương cứng + hoa hồng');
    await expect(page.getByText('Chưa đọc được số — nhập lại theo triệu/tháng', { exact: true })).toBeVisible();
    const unchanged = await local(page, uid);
    await income.focus();
    await income.blur();
    expect(await local(page, uid)).toEqual(unchanged);
    expect(unchanged.customers.find((row) => row.id === 'mn01-unknown')?.income).toBe('lương cứng + hoa hồng');
    await openAdvanced(page);
    await expect(capital).toHaveValue('1,25');
    await noOverflow(page);
  });

  test(`MN-01 thêm khách: triệu lưu đồng, tháng và lỗi nhập (${theme})`, async ({ page }, info) => {
    const uid = `mn01-intake-${info.project.name}-${theme}`;
    await session(page, uid, theme);
    await page.goto('/intake');
    await page.getByLabel('Họ tên *').fill('Khách Mới Triệu');
    await page.getByLabel('Số điện thoại *').fill('0911222333');
    await page.getByRole('button', { name: 'Thêm thông tin', exact: true }).click();
    const price = page.getByLabel('Giá căn', { exact: true });
    await price.fill('2058');
    await price.blur();
    await expect(price).toHaveValue('2,058');
    await expect(price.locator('..')).toContainText('tỷ');
    await page.getByLabel('Vốn sẵn có', { exact: true }).fill('500');
    await page.getByLabel('Thu nhập', { exact: true }).fill('30');
    await page.getByText('Năng lực tài chính', { exact: true }).click();
    await page.getByLabel('Giá trị tài sản', { exact: true }).fill('1250');
    await page.getByLabel('Vốn', { exact: true }).fill('500');
    await page.getByLabel('Nhu cầu vay', { exact: true }).fill('750');
    const monthly = page.getByLabel('Khoản trả hàng tháng chấp nhận', { exact: true });
    await monthly.fill('12,5');
    await monthly.blur();
    await expect(monthly.locator('..')).toContainText('triệu/tháng');
    await noOverflow(page);
    await price.fill('abc');
    await price.blur();
    await page.getByRole('button', { name: 'Lưu khách', exact: true }).click();
    await expect(page.getByText('Kiểm tra lại các ô tiền được đánh dấu.', { exact: true })).toBeVisible();
    expect((await local(page, uid)).customers).toHaveLength(0);
    await price.fill('2058');
    await price.blur();
    await page.getByRole('button', { name: 'Lưu khách', exact: true }).click();
    await expect(page).toHaveURL(/\/khach-hang$/);
    await expect
      .poll(async () => (await local(page, uid)).customers.find((row) => row.phone === '0911222333'))
      .toMatchObject({
        apt_price: 2_058_000_000,
        finance: 500_000_000,
        income: '30 triệu/tháng',
        advanced: {
          asset_value: 1_250_000_000,
          capital: 500_000_000,
          loan_need: 750_000_000,
          monthly_payment: 12_500_000,
        },
      });
    await noOverflow(page);
  });
}
