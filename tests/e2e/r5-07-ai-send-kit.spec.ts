import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

for (const viewport of [360, 1280]) {
  test(`R5-07 kho tài liệu dùng giao diện kit và không cuộn ngang ở ${viewport}px`, async ({ page }) => {
    test.skip(page.viewportSize()?.width !== viewport, 'Chỉ chạy trên viewport nghiệm thu 360 và 1280px.');
    await page.goto('/today');
    await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await page.goto('/tai-lieu');
      await expect(page.getByRole('heading', { name: 'Tài liệu gửi khách' })).toBeVisible();
      await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Thêm tài liệu' })).toBeVisible();
      await expect(page.getByLabel('Tiêu đề')).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
      await page.getByRole('button', { name: 'Đóng' }).click();
    }
  });
}

test('R5-07 không còn import UI cũ trong feature AI và kho tài liệu', () => {
  for (const directory of ['src/features/ai', 'src/features/send-kit']) {
    for (const name of readdirSync(directory).filter((file) => file.endsWith('.tsx'))) {
      const source = readFileSync(join(directory, name), 'utf8');
      expect(source, `${directory}/${name}`).not.toContain("from '@/ui'");
    }
  }
});
