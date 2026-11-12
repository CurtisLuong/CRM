import { expect, type Page, test } from '@playwright/test';
import { BANKS } from '../../src/config/banks';

const uid = 'td01-e2e';
const now = new Date(2026, 10, 12, 9, 30);
const iso = (day: number, hour = 9) => new Date(2026, 10, day, hour).toISOString();
const rates = [
  {
    bank_code: 'bidv',
    promo_rate: 6,
    promo_months: 12,
    floating_rate: 10,
    source_kind: 'bank',
    source_url: 'https://example.test/bidv',
    fetched_at: iso(12, 7),
  },
  {
    bank_code: 'vietcombank',
    promo_rate: 7,
    promo_months: 24,
    floating_rate: 12,
    source_kind: 'bank',
    source_url: 'https://example.test/vcb',
    fetched_at: iso(12, 8),
  },
  {
    bank_code: 'mb',
    promo_rate: 5,
    promo_months: 6,
    floating_rate: 11,
    source_kind: 'news',
    source_url: 'https://example.test/mb',
    fetched_at: iso(11, 7),
  },
];

async function openToday(page: Page, scheme: 'light' | 'dark', urgent = true, empty = false) {
  let state: Record<string, unknown> = { profile: { phone: '0901234567' }, retained_key: true };
  const remote = { readError: false, saveError: false, writes: [] as Record<string, unknown>[] };
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
async function blockY(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? -1;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`TD-01 ${scheme}`, () => {
    test('thứ tự khối, 10 ngân hàng, nguồn, tự sửa và xoá số tự sửa', async ({ page }, info) => {
      test.skip(info.project.name === 'phone-390', 'Nghiệm thu 360 và 1280px.');
      const remote = await openToday(page, scheme);
      const selectors = [
        'section[aria-label="Lời chào và ngày"]',
        'section[aria-label="Tổng quan mức gấp"]',
        'section[aria-label="Lãi vay mua nhà"]',
        'section[aria-label="Việc quan trọng"]',
        'section[aria-label="Việc đến hạn hôm nay"]',
      ];
      const positions = await Promise.all(selectors.map((selector) => blockY(page, selector)));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      await expect(page.getByText('Thứ Năm, 12/11/2026 · Mùng 4 tháng 10 Bính Ngọ')).toBeVisible();
      await expect(page.getByTestId('big4-promo')).toHaveText('6,5%');
      await expect(page.getByTestId('big4-floating')).toHaveText('≈ 11,0%');
      await expect(page.getByRole('region', { name: 'Việc quan trọng' })).toContainText('Hôm nay');
      await assertNoOverflow(page);
      await page.screenshot({ path: info.outputPath(`today-urgent-${scheme}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
      const sheet = page.getByRole('dialog', { name: 'Lãi vay mua nhà', exact: true });
      await expect(sheet).toBeVisible();
      expect(
        await sheet
          .locator('section[aria-label]')
          .evaluateAll((elements) => elements.map((el) => el.getAttribute('aria-label'))),
      ).toEqual(BANKS.map((bank) => bank.name));
      const mb = sheet.getByRole('region', { name: 'MB', exact: true });
      await expect(mb).toContainText('Chưa lấy được hôm nay · số 11/11');
      const vcb = sheet.getByRole('region', { name: 'Vietcombank', exact: true });
      await expect(vcb.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('href', 'https://example.test/vcb');
      await expect(vcb.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('target', '_blank');
      await expect(vcb.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('rel', /noopener/);
      await page.screenshot({ path: info.outputPath(`bank-rates-${scheme}.png`), fullPage: true });
      await vcb.getByRole('button', { name: 'Tự sửa Vietcombank' }).click();
      await vcb.getByLabel('Lãi ưu đãi (%)', { exact: true }).fill('9');
      await vcb.getByLabel('Ghi chú ngắn').fill('Hỏi CB tín dụng');
      await vcb.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(vcb.getByRole('img', { name: 'Anh tự sửa' })).toBeVisible();
      await expect(vcb).toContainText('24 tháng đầu');
      await expect(page.getByTestId('big4-promo')).toHaveText('7,5%');
      await expect(page.getByTestId('big4-floating')).toHaveText('≈ 11,0%');
      expect(remote.writes[0]?.ui_state).toMatchObject({ profile: { phone: '0901234567' }, retained_key: true });
      await assertNoOverflow(page);
      await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
      remote.readError = true;
      await page.reload();
      await expect(page.getByTestId('big4-promo')).toHaveText('7,5%');
      await page.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
      await sheet
        .getByRole('region', { name: 'Vietcombank', exact: true })
        .getByRole('button', { name: 'Tự sửa Vietcombank' })
        .click();
      remote.readError = false;
      await sheet.getByRole('button', { name: 'Xoá số tự sửa' }).click();
      await expect(page.getByTestId('big4-promo')).toHaveText('6,5%');
      await expect(vcb.getByRole('img', { name: 'Anh tự sửa' })).toHaveCount(0);
    });

    test('hết việc gấp, việc ngày mai và nhóm chăm khách, không có dữ liệu lãi', async ({ page }, info) => {
      test.skip(info.project.name === 'phone-390', 'Nghiệm thu 360 và 1280px.');
      await openToday(page, scheme, false, true);
      await expect(page.getByText('Chưa có số lãi suất', { exact: true })).toBeVisible();
      const positions = await Promise.all(
        [
          'section[aria-label="Lãi vay mua nhà"]',
          'section[aria-label="Không còn việc gấp"]',
          'section[aria-label="Việc quan trọng"]',
        ].map((selector) => blockY(page, selector)),
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      await expect(page.getByRole('heading', { name: 'Hôm nay không còn việc gấp' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Việc quan trọng' })).toContainText('Mai');
      await expect(page.getByRole('heading', { name: 'Rảnh thì chăm khách' })).toBeVisible();
      const careY = await page
        .getByRole('heading', { name: 'Rảnh thì chăm khách' })
        .evaluate((el) => el.getBoundingClientRect().y);
      expect(careY).toBeGreaterThan(positions[2] ?? 0);
      await expect(page.getByRole('button', { name: 'Xem tổng kết ngày' })).toBeVisible();
      await assertNoOverflow(page);
      await page.screenshot({ path: info.outputPath(`today-done-${scheme}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
      await expect(page.getByRole('dialog').getByText('Chưa có số', { exact: true })).toBeVisible();
    });
  });
}

test('TD-01 lỗi lưu và số ngoài khoảng giữ nguyên bản nháp', async ({ page }) => {
  const remote = await openToday(page, 'light');
  await page.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
  const vcb = page.getByRole('region', { name: 'Vietcombank', exact: true });
  await vcb.getByRole('button', { name: 'Tự sửa Vietcombank' }).click();
  const input = vcb.getByLabel('Lãi ưu đãi (%)', { exact: true });
  await input.fill('25');
  await vcb.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(vcb.getByRole('alert')).toContainText('từ 3 đến 20%');
  expect(remote.writes).toHaveLength(0);
  await input.fill('8,5');
  remote.saveError = true;
  await vcb.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(vcb.getByRole('alert')).toContainText('Chưa lưu được');
  await expect(input).toHaveValue('8,5');
  remote.saveError = false;
  await vcb.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByTestId('big4-promo')).toHaveText('7,3%');
});
