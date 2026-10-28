import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('R5-05 không còn dùng component UI cũ trong hai feature', async () => {
  for (const file of ['src/features/catalog/route.tsx', 'src/features/loan/LoanCalculator.tsx']) {
    const source = await readFile(file, 'utf8');
    expect(source, file).not.toContain("from '@/ui'");
  }
  expect(await readFile('src/features/catalog/route.tsx', 'utf8')).toContain('TextField');
  expect(await readFile('src/features/loan/LoanCalculator.tsx', 'utf8')).toContain('KitDataTable');
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [360, 1280]) {
    test(`R5-05 Tính vay dùng bảng kit, không tràn ngang (${width}px, ${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/tinh-vay?code=R5-05&netOverride=1000000000');
      await expect(page.getByRole('heading', { name: 'Tính khoản vay' })).toBeVisible();
      await page.getByLabel('Ngày ký hợp đồng').fill('2026-10-05');
      await page.getByLabel('Ngày bàn giao').fill('2027-11-15');
      const debtTable = page.getByRole('table', { name: 'Trả nợ theo năm' });
      await expect(debtTable).toBeVisible();
      await expect(page.locator('[data-slot="loan-table-scroll"]').filter({ has: debtTable })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
