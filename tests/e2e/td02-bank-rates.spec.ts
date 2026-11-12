import { expect, type Page, test } from '@playwright/test';
import { BANKS } from '../../src/config/banks';

const uid = 'td02-e2e';
const now = new Date('2026-11-12T09:30:00+07:00');
const iso = (day: number, hour = 9) =>
  new Date(`2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+07:00`).toISOString();
const rates = [
  {
    bank_code: 'bidv',
    kind: 'deposit',
    deposit_rate: 5,
    published_on: null,
    fetched_at: '2026-11-10T18:00:00Z',
    source_kind: 'news',
    source_url: 'https://example.test/bidv-deposit',
  },
  {
    bank_code: 'bidv',
    promo_rate: 6,
    promo_months: 12,
    floating_rate: 10,
    published_on: '2026-11-03',
    fetched_at: iso(12, 7),
    source_kind: 'bank',
    source_url: 'https://example.test/bidv-loan',
  },
  {
    bank_code: 'vietcombank',
    kind: 'loan',
    promo_rate: 7,
    promo_months: 24,
    floating_rate: 12,
    published_on: '2026-11-08',
    fetched_at: iso(12, 8),
    source_kind: 'bank',
    source_url: 'https://example.test/vcb-loan',
  },
  {
    bank_code: 'vietcombank',
    kind: 'deposit',
    deposit_rate: 7,
    published_on: '2026-11-10',
    fetched_at: iso(12, 8),
    source_kind: 'bank',
    source_url: 'https://example.test/vcb-deposit',
  },
  {
    bank_code: 'mb',
    kind: 'loan',
    promo_rate: 5,
    promo_months: 6,
    floating_rate: 11,
    published_on: '2026-11-04',
    fetched_at: iso(11, 7),
    source_kind: 'news',
    source_url: 'https://example.test/mb-loan',
  },
  {
    bank_code: 'mb',
    kind: 'deposit',
    deposit_rate: 9,
    published_on: '2026-11-12',
    fetched_at: iso(12, 8),
    source_kind: 'bank',
    source_url: 'https://example.test/mb-deposit',
  },
  {
    bank_code: 'acb',
    kind: 'deposit',
    deposit_rate: 6,
    published_on: '2026-11-07',
    fetched_at: iso(12, 8),
    source_kind: 'bank',
    source_url: 'https://example.test/acb-deposit',
  },
];

async function openToday(page: Page, scheme: 'light' | 'dark', urgent = true, empty = false) {
  let state: Record<string, unknown> = {
    profile: { phone: '0901234567' },
    retained_key: true,
    bank_rate_overrides: { other_bank: { retained_field: true } },
  };
  const remote = { readError: false, saveError: false, writes: [] as Record<string, unknown>[] };
  await page.route(/^https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/))/, (route) => route.abort());
  await page.emulateMedia({ colorScheme: scheme });
  await page.clock.install({ time: now });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = route.request().url();
    let body: unknown = [];
    if (url.includes('bank_rates_latest')) {
      if (remote.readError) return route.fulfill({ status: 503, body: '{}' });
      body = empty ? [] : rates;
    } else if (url.includes('user_settings')) {
      if (route.request().method() === 'POST') {
        if (remote.saveError) return route.fulfill({ status: 503, body: '{}' });
        const row = route.request().postDataJSON();
        state = row.ui_state;
        remote.writes.push(row);
      } else {
        if (remote.readError) return route.fulfill({ status: 503, body: '{}' });
        body = { ui_state: state };
      }
    } else if (url.includes('team_list')) {
      body = [{ user_id: uid, full_name: 'Curtis', is_me: true }];
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'td01@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
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
    localStorage.setItem('crm_theme', 'auto');
  }, uid);
  await page.goto('/');
  const customers = [
    {
      id: 'appointment',
      owner_id: uid,
      full_name: 'Chị Lan',
      phone: '0900000001',
      care_stage: 'Đang chăm sóc',
      qualified_at: iso(1),
      care_stage_updated_at: iso(12),
      sla_anchor_at: iso(12),
      created_at: iso(1),
      registered_at: iso(1),
      call_attempts: [{ at: iso(12), result: 'talked' }],
      next_tasks: [
        { at: 'visit-tomorrow', text: 'Tham quan căn mẫu', kind: 'visit', due: iso(13, 14) },
        ...(urgent ? [{ at: 'docs-today', text: 'Nhận hồ sơ mua nhà', kind: 'docs', due: iso(12, 8) }] : []),
      ],
    },
    ...(!urgent
      ? [
          {
            id: 'idle',
            owner_id: uid,
            full_name: 'Anh Minh',
            phone: '0900000002',
            care_stage: 'Đang chăm sóc',
            qualified_at: iso(1),
            care_stage_updated_at: iso(1),
            sla_anchor_at: iso(12),
            created_at: iso(1),
            registered_at: iso(1),
            interest_level: 90,
            call_attempts: [{ at: iso(1), result: 'talked' }],
            next_tasks: [{ at: 'later', text: 'Nhắc khách', kind: 'message', due: iso(20) }],
          },
        ]
      : []),
  ];
  await page.evaluate(
    async ({ id, rows }) => {
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
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: '2026-11-01T00:00:00Z' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: uid, rows: customers },
  );
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Chào buổi sáng, Curtis' })).toBeVisible();
  return remote;
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
}
for (const scheme of ['light', 'dark'] as const) {
  test(`TD-02 ba số, ngày, nguồn, tự sửa từng trường và ảnh ${scheme}`, async ({ page }, info) => {
    const remote = await openToday(page, scheme);
    const card = page.getByRole('region', { name: 'Lãi suất ngân hàng', exact: true });
    await expect(card).toContainText('Lãi suất ngân hàng · TB Big 4');
    await expect(card).toContainText('Gửi TB');
    await expect(card).toContainText('12 tháng');
    await expect(card.getByTestId('big4-deposit')).toHaveText('6,0%');
    await expect(card.getByTestId('big4-promo')).toHaveText('6,5%');
    await expect(card.getByTestId('big4-floating')).toHaveText('≈ 11,0%');
    await expect(card).toContainText('Cập nhật cuối: 11/11/2026');
    await expect(page.getByText(/≈ cập nhật/)).toHaveCount(0);
    await assertNoOverflow(page);
    await page.screenshot({
      path: info.outputPath(`td02-today-${scheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });

    await card.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lãi suất ngân hàng', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Cập nhật cuối: 12/11/2026');
    for (const heading of ['Gửi 12T', 'Vay ƯĐ', 'Thả nổi'])
      await expect(sheet.getByText(heading, { exact: true }).first()).toBeVisible();
    expect(
      await sheet
        .locator('section[aria-label]')
        .evaluateAll((elements) => elements.map((el) => el.getAttribute('aria-label'))),
    ).toEqual(BANKS.map((bank) => bank.name));
    const bidv = sheet.getByRole('region', { name: 'BIDV', exact: true });
    await expect(bidv).toContainText('12 tháng đầu');
    await expect(bidv).toContainText('03/11 ·');
    await expect(bidv).toContainText('Gửi 12T 5,0%');
    await expect(bidv).toContainText('Vay ƯĐ 6,0%');
    await expect(bidv.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('href', 'https://example.test/bidv-loan');
    await expect(bidv.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('target', '_blank');
    await expect(bidv.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('rel', /noopener/);
    await expect(bidv.getByRole('img', { name: 'Trang ngân hàng' })).toBeVisible();
    const mb = sheet.getByRole('region', { name: 'MB', exact: true });
    await expect(mb).toContainText('Chưa lấy được hôm nay');
    await expect(mb).toContainText('04/11 ·');
    await expect(mb.getByRole('img', { name: 'AI đọc báo' })).toHaveCount(1);
    const acb = sheet.getByRole('region', { name: 'ACB', exact: true });
    await expect(acb).not.toContainText('tháng đầu');
    await expect(acb).toContainText('07/11 ·');
    await expect(acb.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('href', 'https://example.test/acb-deposit');
    await assertNoOverflow(page);
    expect(await sheet.locator('[data-sheet-body]').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({
      path: info.outputPath(`td02-drawer-${scheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });

    await bidv.getByRole('button', { name: 'Tự sửa BIDV' }).click();
    await bidv.getByLabel('Gửi 12 tháng (%)', { exact: true }).fill('8');
    await bidv.getByLabel('Ghi chú ngắn').fill('Hỏi CB tín dụng');
    await bidv.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(bidv.getByRole('img', { name: 'Anh tự sửa' })).toBeVisible();
    await expect(bidv).toContainText('Anh sửa');
    await expect(bidv).not.toContainText('12 tháng đầu');
    await expect(bidv).toContainText('12/11 ·');
    await expect(bidv).toContainText('Hỏi CB tín dụng');
    await expect(bidv.getByRole('link', { name: 'Nguồn' })).toHaveCount(0);
    await expect(page.getByTestId('big4-deposit')).toHaveText('7,5%');
    await expect(page.getByTestId('big4-promo')).toHaveText('6,5%');
    await expect(page.getByTestId('big4-floating')).toHaveText('≈ 11,0%');
    expect(remote.writes[0]?.ui_state).toMatchObject({
      retained_key: true,
      bank_rate_overrides: {
        other_bank: { retained_field: true },
        bidv: { deposit_rate: 8, promo_rate: null, floating_rate: null },
      },
    });
    await assertNoOverflow(page);
    await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(card).toContainText('Cập nhật cuối: 12/11/2026');
    remote.readError = true;
    await page.reload();
    await expect(page.getByTestId('big4-deposit')).toHaveText('7,5%');
    await expect(card).toContainText('Cập nhật cuối: 12/11/2026');
    remote.readError = false;
    await card.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
    await bidv.getByRole('button', { name: 'Tự sửa BIDV' }).click();
    await bidv.getByRole('button', { name: 'Xoá số tự sửa' }).click();
    await expect(page.getByTestId('big4-deposit')).toHaveText('6,0%');
    await expect(bidv).toContainText('12 tháng đầu');
  });

  test(`TD-02 thẻ thu gọn và không có số bỏ ngày ${scheme}`, async ({ page }, info) => {
    await openToday(page, scheme, false, true);
    const card = page.getByRole('region', { name: 'Lãi suất ngân hàng', exact: true });
    await expect(card).toContainText('Lãi suất ngân hàng · TB Big 4');
    await expect(card).toContainText('Chưa có số lãi suất');
    await expect(card.getByTestId('big4-deposit')).toHaveText('—');
    await expect(card).not.toContainText('Cập nhật cuối');
    await assertNoOverflow(page);
    await page.screenshot({
      path: info.outputPath(`td02-compact-${scheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await card.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lãi suất ngân hàng', exact: true });
    await expect(sheet.getByText('Chưa có số', { exact: true })).toBeVisible();
    await expect(sheet).not.toContainText('Cập nhật cuối');
    await assertNoOverflow(page);
  });
}

test('TD-02 lãi gửi ngoài khoảng và lỗi lưu giữ bản nháp', async ({ page }) => {
  const remote = await openToday(page, 'light');
  await page.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
  const bidv = page.getByRole('region', { name: 'BIDV', exact: true });
  await bidv.getByRole('button', { name: 'Tự sửa BIDV' }).click();
  const input = bidv.getByLabel('Gửi 12 tháng (%)', { exact: true });
  await input.fill('12,1');
  await bidv.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(bidv.getByRole('alert')).toContainText('từ 1 đến 12%');
  expect(remote.writes).toHaveLength(0);
  await input.fill('6,5');
  remote.saveError = true;
  await bidv.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(bidv.getByRole('alert')).toContainText('Chưa lưu được');
  await expect(input).toHaveValue('6,5');
  await expect(page.getByTestId('big4-deposit')).toHaveText('6,0%');
  remote.saveError = false;
  await bidv.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByTestId('big4-deposit')).toHaveText('6,8%');
});
