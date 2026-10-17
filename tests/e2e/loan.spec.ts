import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`loan prefill/calculation/offline and responsive ${theme}`, async ({ page, context }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/tinh-vay?code=R30413&area=53.6&pricePerM2=19911530&netOverride=1067258010');
    await expect(page.getByRole('heading', { name: 'Tính khoản vay', exact: true })).toBeVisible();
    await expect(page.getByLabel('Mã căn', { exact: true })).toHaveValue('R30413');
    await page.getByLabel('Ngày ký hợp đồng', { exact: true }).fill('2026-10-05');
    await page.getByLabel('Ngày bàn giao', { exact: true }).fill('2027-11-15');
    await expect(page.getByRole('table', { name: 'Phiếu giá', exact: true })).toContainText('1.067.258.010');
    await expect(page.getByRole('table', { name: 'Tiến độ thanh toán', exact: true })).toContainText('336.186.273');
    await expect(page.getByRole('button', { name: 'Lưu phương án', exact: true })).toBeDisabled();
    await context.setOffline(true);
    await page.getByLabel('Tỷ lệ vay (% giá gồm VAT)', { exact: true }).fill('80');
    await expect(page.getByRole('table', { name: 'Trả nợ theo năm', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`loan-${theme}.png`), fullPage: true });
    if (testInfo.project.name === 'phone-390') {
      await page.setViewportSize({ width: 430, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`loan-${theme}-430.png`), fullPage: true });
    }
    await context.setOffline(false);
  });
}
test('loan browser print retains all report sections and emits A4 PDF', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'One desktop print proof is sufficient.');
  await context.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto('/tinh-vay?projectName=Tr%C3%A0ng%20C%C3%A1t&code=R30413&netOverride=1067258010');
  await page.getByLabel('Ngày ký hợp đồng', { exact: true }).fill('2026-10-05');
  await page.getByLabel('Ngày bàn giao', { exact: true }).fill('2027-11-15');
  await page.getByLabel('Tên tư vấn viên', { exact: true }).fill('Curtis');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'In / Lưu PDF A4', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Lịch trả nợ theo năm', exact: true })).toBeVisible();
  await expect(popup.locator('body')).toContainText('Tư vấn viên: Curtis');
  await expect(popup.locator('body')).toContainText('Phương án tất toán sớm');
  await popup.screenshot({ path: testInfo.outputPath('loan-print.png'), fullPage: true });
  await popup.pdf({
    path: testInfo.outputPath('loan-R30413.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
});
