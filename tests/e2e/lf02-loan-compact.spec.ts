import { expect, test } from '@playwright/test';

// Curtis 06/11: trang tính vay gọn — ô ngắn 2 ô/hàng, đơn giá tr/m², phí tr/căn,
// tư vấn viên lên đầu, lịch trả theo năm / theo tháng là 2 tab.
for (const theme of ['light', 'dark'] as const) {
  test(`tính vay gọn: 2 ô/hàng, đơn vị triệu, tư vấn viên đầu form, 2 tab lịch trả (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/tinh-vay?code=R30413&area=53.6&pricePerM2=19911530');
    await page.getByLabel('Ngày ký hợp đồng', { exact: true }).fill('2026-10-05');
    await page.getByLabel('Ngày bàn giao', { exact: true }).fill('2027-11-15');

    // Đơn giá hiện theo triệu/m², nhập 25 → 25.000.000 đ/m².
    const unitPrice = page.getByLabel('Đơn giá', { exact: true });
    await expect(unitPrice).toHaveValue('19.91153');
    await unitPrice.fill('25');
    await expect(page.getByRole('table', { name: 'Phiếu giá', exact: true })).toContainText('1.340.000.000');

    // Tư vấn viên là nhóm đầu tiên của form.
    const heads = await page.locator('h2.text-section-head').allTextContents();
    expect(heads[0]).toBe('Tư vấn viên trên phiếu');

    // Ô ngắn cùng hàng: Toà | Mã căn, Loại căn | Diện tích, Đơn giá | Phí, Ngày ký | Ngày bàn giao.
    for (const [a, b] of [
      ['Toà', 'Mã căn'],
      ['Loại căn', 'Diện tích'],
      ['Đơn giá', 'Phí'],
      ['Ngày ký hợp đồng', 'Ngày bàn giao'],
      ['Tỷ lệ vay', 'Thời hạn vay'],
    ]) {
      const boxA = await page.getByLabel(a, { exact: true }).boundingBox();
      const boxB = await page.getByLabel(b, { exact: true }).boundingBox();
      expect(Math.abs((boxA?.y ?? 0) - (boxB?.y ?? 999)), `${a} | ${b}`).toBeLessThanOrEqual(2);
    }

    // 2 tab lịch trả: mặc định Theo năm; chọn Theo tháng thì bảng năm thu gọn và ngược lại.
    const yearly = page.getByRole('table', { name: 'Trả nợ theo năm', exact: true });
    const monthly = page.getByRole('table', { name: 'Trả nợ từng tháng', exact: true });
    await expect(yearly).toBeVisible();
    await expect(monthly).toHaveCount(0);
    await page.getByRole('tab', { name: 'Theo tháng' }).click();
    await expect(monthly).toBeVisible();
    await expect(yearly).toHaveCount(0);
    await page.getByRole('tab', { name: 'Theo năm' }).click();
    await expect(yearly).toBeVisible();
    await expect(monthly).toHaveCount(0);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
