import { expect, test } from '@playwright/test';

// Curtis 11/11 (Android): hàng nút thanh đầu trùng camera. Nguyên nhân: max-sm:py-3 đè pt-[env(safe-area-inset-top)]
// → trên điện thoại chỉ đệm 12px thay vì phần status bar. Chromium không giả lập được safe-area (= 0), nên kiểm:
// đệm trên = 0 (tức = safe-area) chứ không phải 12px, và hàng nút nằm giữa 56px của thanh.
for (const width of [360, 390]) {
  test(`${width}px: thanh đầu chỉ đệm đúng phần status bar, hàng nút giữa 56px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/today');
    await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
    await page.getByText('Dữ liệu mẫu — không lưu lên máy chủ').waitFor();
    const header = page.getByRole('banner');
    await expect(header).toBeVisible();
    const pad = await header.evaluate((el) => getComputedStyle(el).paddingTop);
    expect(pad).toBe('0px');
    const menu = await header.getByRole('button', { name: 'Menu', exact: true }).boundingBox();
    const box = await header.boundingBox();
    if (!menu || !box) throw new Error('Không đo được thanh đầu');
    expect(Math.abs(menu.y + menu.height / 2 - (box.y + box.height / 2))).toBeLessThanOrEqual(1);
  });
}
