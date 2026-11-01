import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('R3-01 thông báo dùng kit, không cuộn ngang ở mobile/desktop và sáng/tối', async ({ page }) => {
  const source = readFileSync('src/features/notifications/route.tsx', 'utf8');
  expect(source).not.toMatch(/from\s+['"]@\/ui(?:['"]|\/)/);

  for (const width of [360, 1280]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/thong-bao');
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect(page.locator('#main').getByRole('heading', { name: 'Thông báo', exact: true })).toBeVisible();
      await expect(page.locator('#main').getByRole('button', { name: 'Về Hôm nay' })).toBeVisible();
      expect(source).toContain("import { Button } from '@/components/ui/button'");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${width}px ${theme} theme should not scroll horizontally`,
      ).toBe(true);
    }
  }
});
