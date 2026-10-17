import { expect, test } from '@playwright/test';

test('Giỏ hàng có route tự đăng ký và trạng thái chưa đăng nhập dễ hiểu', async ({ page }) => {
  await page.goto('/gio-hang');
  await expect(page.getByRole('heading', { name: 'Giỏ hàng' })).toBeVisible();
  await expect(page.getByText('Đăng nhập để xem catalog của tài khoản.')).toBeVisible();
});

test('Bảng lệnh tự liệt kê tiện ích Giỏ hàng', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const box = page.getByRole('combobox', { name: 'Tìm khách, lệnh, màn' });
  await box.fill('giỏ hàng');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/gio-hang');
  await expect(page.getByRole('heading', { name: 'Giỏ hàng' })).toBeVisible();
});

for (const width of [360, 390, 1280]) {
  test(`Giỏ hàng không tràn ngang ở viewport ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/gio-hang');
    await expect(page.getByRole('heading', { name: 'Giỏ hàng' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
