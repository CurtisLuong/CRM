import { expect, test } from '@playwright/test';

// LF-01 (Curtis 06/11): phí mỗi căn — Giá dự kiến = thuần + phí + VAT + KPBT; phí đóng đợt 1, khách tự trả.
for (const theme of ['light', 'dark'] as const) {
  test(`máy tính vay: nhập phí → phiếu giá có dòng Phí, Giá dự kiến + đợt 1 cộng phí (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/tinh-vay?code=R30413&area=53.6&pricePerM2=19911530&netOverride=1067258010');
    await page.getByLabel('Ngày ký hợp đồng', { exact: true }).fill('2026-10-05');
    await page.getByLabel('Ngày bàn giao', { exact: true }).fill('2027-11-15');
    const quote = page.getByRole('table', { name: 'Phiếu giá', exact: true });
    // Chưa có phí: như trước, chỉ đổi tên dòng tổng.
    await expect(quote).toContainText('Giá dự kiến');
    await expect(quote).not.toContainText('Phí');
    await expect(quote).toContainText('1.141.966.071');

    await page.getByLabel('Phí (đ/căn)', { exact: true }).fill('50000000');
    await expect(quote).toContainText('Phí (đóng đợt 1)');
    await expect(quote).toContainText('50.000.000');
    await expect(quote).toContainText('1.191.966.071');
    const schedule = page.getByRole('table', { name: 'Tiến độ thanh toán', exact: true });
    await expect(schedule).toContainText('386.186.273');
    await expect(page.getByText('Giá dự kiến', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
