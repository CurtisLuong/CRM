import { expect, test } from '@playwright/test';

test('màn thông báo đọc tín hiệu hiện có và có trạng thái rỗng', async ({ page }) => {
  await page.goto('/thong-bao');
  await expect(page.locator('#main').getByRole('heading', { name: 'Thông báo', exact: true })).toBeVisible();
  await expect(page.getByText('Tín hiệu được tính từ dữ liệu khách và cùng registry với Hôm nay.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Về Hôm nay' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
