import { expect, test } from '@playwright/test';

// Curtis 29/10 (Android): thanh đầu bị nút gọi của dòng khách đè lên khi cuộn, và bị đẩy lên status bar.
// Không giả lập được safe-area trên Chromium; kiểm phần đo được: cao 56px khi không có status bar, nằm trên mọi dòng danh sách.
test('thanh đầu cao 56px và luôn nằm trên dòng khách khi cuộn (360px)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/today');
  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await page.getByText('Dữ liệu mẫu — không lưu lên máy chủ').waitFor();
  await page.goto('/khach-hang');
  await expect(page.getByRole('button', { name: /^Gọi / }).first()).toBeVisible();

  const header = page.getByRole('banner');
  expect((await header.boundingBox())?.height).toBe(56);

  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(300);
  const box = await header.boundingBox();
  if (!box) throw new Error('Không thấy thanh đầu');
  // Điểm giữa mép phải thanh đầu (chỗ nút gọi của dòng khách cuộn qua) phải thuộc thanh đầu.
  const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('header'), {
    x: box.x + box.width - 30,
    y: box.y + box.height / 2,
  });
  expect(onTop).toBe(true);
});
