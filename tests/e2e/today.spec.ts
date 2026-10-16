import { expect, test } from '@playwright/test';

test('app opens Today and exposes the first-step queue or a clear sign-in state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header h1')).toHaveText('Hôm nay');
  await expect(page.getByRole('heading', { name: 'Sổ Khách v2' })).toBeVisible();
  await expect(
    page.getByText(/Đăng nhập để mở hàng đợi khách của bạn|Chưa cấu hình kết nối|Next Best Action/),
  ).toBeVisible();
  const metrics = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth }));
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.width);
});
