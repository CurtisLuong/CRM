import { expect, type Locator, test } from '@playwright/test';
import { compute, DEFAULT_LOAN, DEFAULT_SCHEDULE } from '../../src/domain/loan';

const money = (value: number) => Math.round(value).toLocaleString('vi-VN');

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  if (!result) throw new Error('Không đo được ô');
  return result;
}

// Đo chữ thật để bắt cả khoảng trống bên trong nhãn bị ép cao.
async function labelGap(control: Locator) {
  return control.evaluate((input) => {
    const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    const text = label ?? input.closest('label')?.querySelector('span');
    if (!text) throw new Error('Thiếu nhãn');
    const range = document.createRange();
    range.selectNodeContents(text);
    return input.getBoundingClientRect().top - range.getBoundingClientRect().bottom;
  });
}

function border(control: Locator) {
  return control.locator('..');
}

for (const theme of ['light', 'dark'] as const) {
  test(`LV-02: khoảng cách, bậc lãi, ân hạn, tên đợt, tổng và chọn cột (${theme})`, async ({ page }, info) => {
    test.skip(page.viewportSize()?.width === 390, 'Nghiệm thu 360 và 1280px.');
    await page.clock.install({ time: new Date('2026-11-12T10:00:00+07:00') });
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
    });
    await page.addInitScript((value) => localStorage.setItem('sk-theme', value), theme);
    await page.goto('/tinh-vay');
    const field = (label: string) => page.getByLabel(label, { exact: true });
    await field('Ngày ký hợp đồng').fill('2026-10-05');
    await field('Ngày bàn giao').fill('2027-11-15');
    await page.evaluate(() => document.fonts.ready);
    const result = compute({
      unit: { area: 53.6, pricePerM2: 19911530 },
      dates: { contractDate: '2026-10-05', handoverDate: '2027-11-15' },
      loan: structuredClone(DEFAULT_LOAN),
      schedule: DEFAULT_SCHEDULE.map((milestone) =>
        milestone.role === 'title' ? { ...milestone, due: { type: 'afterHandoverMonths', value: 1.5 } } : milestone,
      ),
    });
    if (!result.schedule) throw new Error('Thiếu lịch');

    const standard = await labelGap(field('Phí tất toán theo năm vay'));
    for (const label of ['Tiền vay', 'Tỷ lệ vay', 'Tính lãi', 'Bậc 1: số tháng']) {
      expect(Math.abs((await labelGap(field(label))) - standard), label).toBeLessThanOrEqual(2);
    }
    const amountHint = page.locator(`[id="${await field('Tiền vay').getAttribute('aria-describedby')}"]`);
    // LV-03: ghi chú trong ngoặc "(max X tr)", triệu 1 chữ số thập phân, dấu phẩy.
    await expect(amountHint).toContainText(`max ${((result.price.gross * 0.8) / 1e6).toFixed(1).replace('.', ',')} tr`);
    await expect(amountHint).not.toContainText('Tối đa');
    await expect(amountHint).not.toContainText('Theo tỷ lệ vay');
    const amountBox = await box(border(field('Tiền vay')));
    const disbursementBox = await box(field('Bắt đầu giải ngân từ đợt'));
    const fixed = await box(border(field('Bậc 1: số tháng')));
    const floating = await box(border(field('Bậc 2: thả nổi')));
    expect(Math.abs(fixed.x - amountBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(fixed.x + fixed.width - amountBox.x - amountBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(floating.x - disbursementBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(floating.x + floating.width - disbursementBox.x - disbursementBox.width)).toBeLessThanOrEqual(1);
    const tierSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Bậc lãi suất', exact: true }) })
      .last();
    expect(Math.abs((await box(tierSection.getByRole('heading'))).x - amountBox.x)).toBeLessThanOrEqual(1);
    const grace = page.getByRole('checkbox', { name: 'Ân hạn gốc', exact: true });
    const graceBox = await box(grace.locator('..'));
    const addBox = await box(page.getByRole('button', { name: 'Thêm bậc lãi', exact: true }));
    expect(Math.abs(graceBox.y - addBox.y)).toBeLessThanOrEqual(2);
    expect(Math.abs((await box(grace)).y - addBox.y)).toBeLessThanOrEqual(2);
    expect(graceBox.height).toBe(addBox.height);
    await grace.check();
    await expect(page.getByRole('spinbutton', { name: 'Ân hạn gốc', exact: true })).toBeVisible();
    await expect(grace.locator('..')).toHaveClass(/border-ion/);
    await grace.uncheck();

    const progress = page.getByRole('table', { name: 'Tiến độ thanh toán', exact: true });
    await expect(progress).toContainText('Kí HĐMB (T)');
    await expect(progress).toContainText('Bàn giao + KPBT');
    await expect(field('Bắt đầu giải ngân từ đợt').locator('option').first()).toHaveText('Đợt 1 · Kí HĐMB (T)');
    if (page.viewportSize()?.width === 1280) {
      const widths = await progress.evaluate((table) => {
        const frame = table.parentElement;
        if (!frame) throw new Error('Thiếu khung');
        return { scroll: frame.scrollWidth, client: frame.clientWidth };
      });
      expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    }
    const total = page.getByRole('table', { name: 'Tổng', exact: true });
    expect(await total.locator('tr td:first-child').allTextContents()).toEqual([
      'Tổng vay',
      'Tổng lãi',
      'Tổng trả ngân hàng',
    ]);
    await expect(total.getByRole('row').first()).toContainText(`${money(result.loan.amount)} đ`);

    await page.getByRole('button', { name: 'Xem biểu đồ', exact: true }).click();
    const chart = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Biểu đồ trả nợ', exact: true }) })
      .last();
    const chartControls = page.getByRole('group', { name: 'Biểu đồ trả nợ', exact: true });
    await field('Tháng thứ').fill('61');
    const monthPayment = money(result.schedule.rows[60]?.payment ?? 0);
    await expect(chart).toContainText(`Trả ${monthPayment} đ/tháng vào tháng thứ 61`);
    await expect(chart.locator('.recharts-reference-line')).toHaveCount(1);
    await expect(chart.locator('.recharts-bar-rectangle path[stroke="var(--ink)"]')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Theo tháng', exact: true }).click();
    const monthRow = page.getByRole('table', { name: 'Trả nợ từng tháng', exact: true }).locator('tbody tr').nth(60);
    await expect(monthRow.locator('td').nth(5)).toHaveText(monthPayment);
    await chartControls.getByRole('button', { name: 'Theo năm', exact: true }).click();
    await expect(field('Năm thứ')).toHaveValue('');
    await field('Năm thứ').fill('6');
    const yearPayment = money(result.schedule.years[5]?.avgPayment ?? 0);
    await expect(chart).toContainText(`Trung bình trả ${yearPayment} đ/tháng năm thứ 6`);
    await expect(chart.locator('.recharts-reference-line')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Theo năm', exact: true }).click();
    await expect(
      page.getByRole('table', { name: 'Trả nợ theo năm', exact: true }).locator('tbody tr').nth(5).locator('td').nth(1),
    ).toHaveText(yearPayment);
    await field('Năm thứ').fill('');
    await expect(chart).toContainText(`Trả cao nhất ${money(result.maxPayment)} đ/tháng`);
    await expect(chart.locator('.recharts-reference-line')).toHaveCount(0);
    await field('Năm thứ').fill('99');
    await field('Năm thứ').press('Tab');
    await expect(field('Năm thứ')).toHaveValue(String(result.schedule.years.length));
    await chartControls.getByRole('button', { name: 'Theo tháng', exact: true }).click();
    await expect(field('Tháng thứ')).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`lv02-${theme}.png`), fullPage: true });
  });
}
