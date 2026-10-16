import { expect, test } from '@playwright/test';

test('trang chủ v2 hiện "Sổ Khách v2", dấu tiếng Việt đúng', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sổ Khách v2' })).toBeVisible();
  await expect(page).toHaveTitle('Sổ Khách');
});

test('đường dẫn lạ vẫn trả app (SPA) và báo không tìm thấy', async ({ page }) => {
  await page.goto('/khong-co-trang-nay');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
});

test('không cuộn ngang', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
