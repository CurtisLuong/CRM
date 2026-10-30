import { expect, test } from '@playwright/test';

// Curtis 30/10 (Android): nhật ký trong tab Dòng thời gian bị nhét vào cột 32px, chữ xuống dòng từng từ.
test('tab Dòng thời gian: mục nhật ký dùng hết bề ngang (360px)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/today');
  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await page.getByText('Dữ liệu mẫu — không lưu lên máy chủ').waitFor();
  await page.goto('/ho-so/dm01-01'); // An Nhiên: có cuộc gọi + mốc bậc
  await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
  const entries = page.locator('[data-timeline-group] ol ol > li');
  await expect(entries.first()).toBeVisible();
  for (const box of await entries.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width)))
    expect(box).toBeGreaterThan(240);
});
