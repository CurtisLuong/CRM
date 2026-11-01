import { expect, test } from '@playwright/test';

for (const viewport of [360, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`R5-07b kho tài liệu giữ dữ liệu tìm kiếm và form ở ${viewport}px ${theme}`, async ({ page }) => {
      test.skip(page.viewportSize()?.width !== viewport, 'Chỉ chạy trên viewport nghiệm thu 360 và 1280px.');
      await page.addInitScript((value) => localStorage.setItem('sk-theme', value), theme);
      await page.goto('/today');
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme);
      await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
      await page.goto('/tai-lieu');

      await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Thêm tài liệu' })).toBeVisible();
      const titleField = page.getByLabel('Tiêu đề');
      await titleField.fill(`Tài liệu ${theme} ${viewport}`);
      if (viewport === 1280) await page.mouse.click(20, 300);
      else await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Thêm tài liệu' })).toBeVisible();
      await expect(titleField).toHaveValue(`Tài liệu ${theme} ${viewport}`);
      await page.getByRole('button', { name: 'Huỷ' }).click();

      await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
      await page.getByLabel('Tiêu đề').fill(`Tài liệu ${theme} ${viewport}`);
      await page.getByRole('button', { name: 'Lưu tài liệu' }).click();
      await expect(page.getByRole('heading', { name: `Tài liệu ${theme} ${viewport}` })).toBeVisible();

      await page.getByLabel('Tìm tài liệu').fill('khong co ket qua');
      await expect(page.getByText('Không có tài liệu khớp')).toBeVisible();
      await page.getByRole('button', { name: 'Hiện lại danh sách' }).click();
      await expect(page.getByRole('heading', { name: `Tài liệu ${theme} ${viewport}` })).toBeVisible();

      await page.goto('/tai-lieu?customer=dm01-05');
      await page.getByLabel('Tìm tài liệu').fill('khong co ket qua');
      await expect(page.getByText('Không có tài liệu khớp')).toBeVisible();
      await page.getByRole('button', { name: 'Hiện lại danh sách' }).click();
      await expect(page.getByText(`Tài liệu ${theme} ${viewport}`, { exact: true })).toBeVisible();
    });
  }
}
