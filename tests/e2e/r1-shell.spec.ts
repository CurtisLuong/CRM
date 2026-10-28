import { expect, type Page, test } from '@playwright/test';

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' }).filter({ visible: true });
const areas = ['Hôm nay', 'Khách hàng', 'Công việc', 'Hiệu quả'];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`R1 AppShell ${scheme === 'light' ? 'sáng' : 'tối'}`, () => {
    test.use({ colorScheme: scheme });

    test('360×780 dùng BottomNav 4 tab, không có Sidebar hoặc cuộn ngang', async ({ page }, info) => {
      test.skip(info.project.name !== 'phone-360', 'kiểm khung điện thoại 360×780');
      await page.goto('/');

      const nav = mainNav(page);
      await expect(nav).toHaveCount(1);
      for (const label of areas) await expect(nav.getByRole('button', { name: label })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Ghi nhanh' })).toBeVisible();
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('header h1')).toHaveText('Hôm nay');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(
        await page
          .locator('header')
          .first()
          .evaluate((el) => Math.round(el.getBoundingClientRect().height)),
      ).toBe(56);
    });

    test('1280×900 dùng Sidebar 4 mục, co lại còn 64px và nhớ 232px', async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-1280', 'kiểm khung desktop 1280×900');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/');

      const nav = mainNav(page);
      await expect(nav).toHaveCount(1);
      for (const label of areas) await expect(nav.getByRole('button', { name: label })).toBeVisible();
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

      const width = async () => Math.round((await nav.boundingBox())?.width ?? 0);
      await expect.poll(width).toBe(64);
      await nav.getByRole('button', { name: 'Mở rộng thanh bên' }).click();
      await expect.poll(width).toBe(232);
      await page.reload();
      await expect.poll(width).toBe(232);

      await expect(page.locator('header h1')).toHaveText('Hôm nay');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}
