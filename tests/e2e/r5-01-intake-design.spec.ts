import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('R5-01: form dùng component kit và không import UI cũ', async ({ page }) => {
  const route = readFileSync('src/features/intake/route.tsx', 'utf8');
  const more = readFileSync('src/features/intake/more.tsx', 'utf8');
  expect(`${route}\n${more}`).not.toMatch(/from\s+['"]@\/ui['"]/);

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/intake');
  await expect(page.getByLabel('Họ tên *')).toBeVisible();
  await expect(page.getByLabel('Số điện thoại *')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Kênh' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});
