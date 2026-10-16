import { expect, test } from '@playwright/test';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`quick actions ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('deep link is account-gated and fits the viewport', async ({ page }) => {
      await page.goto('/thao-tac-nhanh');
      await expect(page.locator('main h1')).toHaveText('Thao tác nhanh');
      await expect(page.getByText(/Đăng nhập để mở dữ liệu của bạn|Chưa cấu hình kết nối staging/)).toBeVisible();

      const metrics = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        mainWidth: document.querySelector('main')?.getBoundingClientRect().width ?? 0,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.width);
      expect(metrics.mainWidth).toBeGreaterThan(0);
      expect(await page.getByRole('button', { name: 'Đăng xuất' }).count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Gọi' }).count()).toBe(0);
    });
  });
}
