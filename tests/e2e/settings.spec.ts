import { expect, test } from '@playwright/test';

test('cài đặt chọn giao diện và ẩn cấu hình AI khi Worker chưa bật', async ({ page }) => {
  await page.goto('/cai-dat');
  await expect(page.locator('#main').getByRole('heading', { name: 'Cài đặt', exact: true })).toBeVisible();
  await expect(page.getByText('Cài đặt AI đang ẩn khi Worker chưa cấu hình hoặc thiết bị ngoại tuyến.')).toBeVisible();
  await page.getByRole('button', { name: 'Tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // U-03: Mẫu tin Zalo chuyển sang trang riêng /mau-zalo trong menu Tiện ích.
  await expect(page.getByRole('heading', { name: 'Mẫu tin Zalo' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Chi phí campaign' })).toBeVisible();
  await expect(page.getByText('Đăng nhập để quản lý chi phí theo tài khoản.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
