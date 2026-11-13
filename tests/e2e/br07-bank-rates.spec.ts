import { expect, type Page, test } from '@playwright/test';
import { BANKS } from '../../src/config/banks';

const uid = 'br07-synthetic';
const now = new Date('2026-11-30T09:00:00+07:00');
const complete = BANKS.flatMap(({ code }) => [
  { bank_code: code, kind: 'deposit', deposit_rate: 5, published_on: '2026-11-16' },
  { bank_code: code, kind: 'loan', promo_rate: 6, published_on: '2026-11-16' },
]);

async function openToday(page: Page, scheme: 'light' | 'dark', mode: 'warning' | 'fresh' | 'empty' | 'outside') {
  const rates =
    mode === 'empty'
      ? []
      : complete.map((rate) => {
          if (mode === 'warning') {
            if (rate.bank_code === 'bidv')
              return { ...rate, published_on: '2026-11-15', ...(rate.kind === 'loan' ? { floating_rate: 10 } : {}) };
            if (rate.bank_code === 'vietcombank') return { ...rate, deposit_rate: null, promo_rate: null };
            if (rate.bank_code === 'acb' && rate.kind === 'deposit') return { ...rate, deposit_rate: null };
          }
          if (mode === 'outside' && rate.bank_code === 'mb') return { ...rate, published_on: '2026-11-15' };
          return rate;
        });
  let overrides: Record<string, Record<string, number | string | null>> = mode === 'warning'
    ? {
        bidv: { promo_rate: 8, promo_months: null, floating_rate: null, note: '', at: '2026-11-29T02:00:00Z' },
        mb: {
          deposit_rate: 7,
          promo_rate: null,
          promo_months: null,
          floating_rate: null,
          note: '',
          at: '2026-11-14T17:00:00Z',
        },
      }
    : {};
  await page.clock.install({ time: now });
  await page.emulateMedia({ colorScheme: scheme });
  await page.route(/^https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/))/, (route) => route.abort());
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = route.request().url();
    let body: unknown = [];
    if (url.includes('bank_rates_latest')) body = rates;
    if (url.includes('user_settings')) {
      if (route.request().method() === 'POST') overrides = route.request().postDataJSON().ui_state.bank_rate_overrides;
      else body = { ui_state: { bank_rate_overrides: overrides } };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'br07@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-11-01T00:00:00Z',
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
  await page.goto('/today');
  await expect(page.getByRole('region', { name: 'Lãi suất ngân hàng', exact: true })).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const body = page.locator('[data-sheet-body]');
  if (await body.count()) expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`BR-07 luật 1–6: số cũ, thiếu, sửa mới và ảnh ${scheme}`, async ({ page }, info) => {
    test.skip(info.project.name === 'phone-390', 'Nghiệm thu 360px và 1280px');
    await openToday(page, scheme, 'warning');
    const card = page.getByRole('region', { name: 'Lãi suất ngân hàng', exact: true });
    const warning = card.getByText('Có số cũ / thiếu — xem 10 ngân hàng', { exact: true });
    await expect(warning).toBeVisible();
    await expect(card).toContainText('Cập nhật cuối: 29/11/2026');
    expect(
      await warning.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      }),
    ).toBe(1);
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`br07-card-${scheme}.png`), fullPage: true, animations: 'disabled' });
    await card.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lãi suất ngân hàng', exact: true });
    await expect(sheet.getByRole('status')).toHaveText(
      '2 ngân hàng có số cũ hơn 14 ngày · 2 ngân hàng còn thiếu số — nên kiểm lại trên internet và tự sửa.',
    );
    const bidv = sheet.getByRole('region', { name: 'BIDV', exact: true });
    await expect(bidv.getByText('Gửi 12T: 15/11 · 15 ngày trước', { exact: true })).toHaveClass(/text-soon-text/);
    await expect(bidv.getByText('Thả nổi: 15/11 · 15 ngày trước', { exact: true })).toBeVisible();
    await expect(bidv).not.toContainText('Vay ưu đãi:');
    await expect(bidv).toContainText('Vay ƯĐ 8,0%');
    await expect(bidv).toContainText('Gửi 12T 5,0%');
    const vcb = sheet.getByRole('region', { name: 'Vietcombank', exact: true });
    await expect(vcb).toContainText('Còn thiếu: Gửi 12T · Số vay');
    await expect(sheet.getByRole('region', { name: 'VietinBank', exact: true })).not.toContainText('ngày trước');
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`br07-drawer-${scheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    const mb = sheet.getByRole('region', { name: 'MB', exact: true });
    await mb.scrollIntoViewIfNeeded();
    await expect(mb.getByText('Gửi 12T: 15/11 · 15 ngày trước', { exact: true })).toBeVisible();
    await expect(mb).toContainText('Gửi 12T 7,0%');
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`br07-manual-${scheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await bidv.getByRole('button', { name: 'Tự sửa BIDV' }).click();
    await bidv.getByLabel('Gửi 12 tháng (%)', { exact: true }).fill('6');
    await bidv.getByLabel('Lãi thả nổi (%)', { exact: true }).fill('11');
    await bidv.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(bidv).not.toContainText('ngày trước');
    await expect(sheet.getByRole('status')).toContainText('1 ngân hàng có số cũ hơn 14 ngày');
    await vcb.getByRole('button', { name: 'Tự sửa Vietcombank' }).click();
    await vcb.getByLabel('Gửi 12 tháng (%)', { exact: true }).fill('5');
    await vcb.getByLabel('Lãi ưu đãi (%)', { exact: true }).fill('6');
    await vcb.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(vcb).not.toContainText('Còn thiếu');
    await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(warning).toHaveCount(0);
    await expect(card).toContainText('Cập nhật cuối: 30/11/2026');
  });
}

for (const mode of ['fresh', 'empty', 'outside'] as const) {
  test(`BR-07 luật 4–5: cảnh báo đúng phạm vi ${mode}`, async ({ page }) => {
    await openToday(page, 'light', mode);
    const card = page.getByRole('region', { name: 'Lãi suất ngân hàng', exact: true });
    await expect(card).not.toContainText('Có số cũ / thiếu');
    if (mode === 'empty') {
      await expect(card).toContainText('Chưa có số lãi suất');
      await expect(card).not.toContainText('Cập nhật cuối');
    } else await expect(card).toContainText('Cập nhật cuối: 16/11/2026');
    await card.getByRole('button', { name: 'Xem 10 ngân hàng ›' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lãi suất ngân hàng', exact: true });
    if (mode === 'outside') await expect(sheet.getByRole('status')).toContainText('1 ngân hàng có số cũ hơn 14 ngày');
    else await expect(sheet.getByRole('status')).toHaveCount(0);
    if (mode === 'empty') {
      await expect(sheet.getByText('Chưa có số', { exact: true })).toBeVisible();
      await expect(sheet).not.toContainText('Cập nhật cuối');
      await expect(sheet).not.toContainText('Còn thiếu:');
    }
    await noOverflow(page);
  });
}
