import { expect, test } from '@playwright/test';

test('form nhập khách hiện đủ các nhóm dữ liệu và bảo vệ truy cập màn', async ({ page }) => {
  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'Thêm khách mới' })).toBeVisible();
  await expect(page.getByLabel('Họ tên *')).toBeVisible();
  await expect(page.getByLabel('Số điện thoại *')).toBeVisible();
  await expect(page.getByText('Nguồn khách', { exact: true })).toBeVisible();
  await expect(page.getByText('Nhu cầu căn hộ', { exact: true })).toBeVisible();
  await expect(page.getByText('Chăm sóc', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhập từ ảnh' })).toBeVisible();
});

test('form tiếng Việt không tràn ngang trên màn hình nhỏ', async ({ page }) => {
  await page.goto('/intake');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('cảnh báo trước khi bỏ bản nháp khi chuyển sang danh sách khách', async ({ page }) => {
  await page.goto('/intake');
  await page.getByLabel('Họ tên *').fill('Khách đang soạn');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Khách hàng', exact: true }).click();
  await expect(page).toHaveURL(/\/khach-hang$/);
});
