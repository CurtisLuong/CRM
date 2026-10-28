import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const viewports = [360, 390, 1280];

test('R5-04 dùng kit trên Cài đặt và Nhập / Xuất, không tràn ngang ở sáng và tối', async ({ page }) => {
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/cai-dat');
    await expect(page.locator('#main').getByRole('heading', { name: 'Cài đặt', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu cài đặt' })).toBeVisible();
    for (const theme of ['Sáng', 'Tối']) {
      await page.getByRole('button', { name: theme }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'Tối' ? 'dark' : 'light');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.goto('/nhap-xuat');
    await expect(page.getByRole('heading', { name: 'Nhập / Xuất dữ liệu' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Xuất .* khách/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('R5-04 các màn trong phạm vi không import component cũ từ @/ui', () => {
  const files = [
    'src/features/settings/route.tsx',
    'src/features/settings/campaign-costs.tsx',
    'src/features/settings/campaign-projects.tsx',
    'src/features/settings/meta-lead-ads.tsx',
    'src/features/sync/SyncIssuesSheet.tsx',
    'src/features/import-export/route.tsx',
    'src/features/search/SearchBridge.tsx',
    'src/features/search/model.ts',
  ];
  for (const file of files) {
    expect(readFileSync(file, 'utf8'), file).not.toMatch(/from ['"]@\/ui(?:\/|['"])/);
  }
  expect(readFileSync('src/features/settings/route.tsx', 'utf8')).toContain('@/components/crm');
  expect(readFileSync('src/features/import-export/route.tsx', 'utf8')).toContain('Segmented');
  expect(readFileSync('src/features/sync/SyncIssuesSheet.tsx', 'utf8')).toContain('@/components/ui');
});
