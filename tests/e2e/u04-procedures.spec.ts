import { expect, test } from '@playwright/test';

test('U-04 Thủ tục: menu, đối tượng, chép nội dung và hiển thị responsive', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).first().click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('button', { name: 'Thủ tục', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Thủ tục', exact: true }).click();
  await expect(page).toHaveURL('/thu-tuc');
  await expect(page.locator('#main').getByRole('heading', { name: 'Thủ tục', exact: true })).toBeVisible();
  for (const title of [
    'A. Ba điều kiện chính mua NOXH Hải Phòng',
    'B. Hồ sơ theo đối tượng',
    'C. Danh sách đối tượng',
    'D. Điều kiện nhà ở',
    'E. Mức thu nhập yêu cầu',
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  const selector = page.getByRole('combobox', { name: 'Đối tượng' });
  await expect(selector).toContainText('K6');
  await expect(page.getByText('Mẫu số 01 – Đơn đăng kí mua: 03 bản gốc')).toBeVisible();
  await selector.click();
  await page.getByRole('option', { name: /K8 · Cán bộ, công chức, viên chức/ }).click();
  await expect(page.getByText('Chưa có danh sách hồ sơ cho đối tượng này.')).toBeVisible();
  await page.getByRole('button', { name: 'Chép mục A' }).click();
  await expect(page.getByText('Đã chép')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('29 triệu');

  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 780 });
    await expect(page.getByRole('heading', { name: 'E. Mức thu nhập yêu cầu' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
