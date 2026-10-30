import { expect, test } from '@playwright/test';

// Curtis 29/10 (Android): thanh đầu bị nút gọi của dòng khách đè lên khi cuộn, và bị đẩy lên status bar.
// Không giả lập được safe-area trên Chromium; kiểm phần đo được: cao 56px khi không có status bar, nằm trên mọi dòng danh sách.
test('thanh đầu cao 56px, ẩn khi vuốt lên, hiện khi vuốt xuống và nằm trên dòng khách (360px)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/today');
  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await page.getByText('Dữ liệu mẫu — không lưu lên máy chủ').waitFor();
  await page.goto('/khach-hang');
  await expect(page.getByRole('button', { name: /^Gọi / }).first()).toBeVisible();

  const header = page.getByRole('banner');
  expect((await header.boundingBox())?.height).toBe(56);

  // Vuốt lên xem thêm (cuộn xuống) → thanh đầu ẩn hẳn, nhường chỗ cho danh sách (Curtis 30/10, kiểu Facebook).
  await page.mouse.wheel(0, 700);
  await expect.poll(async () => (await header.boundingBox())?.y).toBe(-56);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-header-hidden'))).toBe(true);

  // Vuốt xuống (cuộn ngược lên) giữa danh sách → thanh đầu hiện lại ngay, chưa cần về đầu trang.
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const box = await header.boundingBox();
  if (!box) throw new Error('Không thấy thanh đầu');
  // Điểm giữa mép phải thanh đầu (chỗ nút gọi của dòng khách cuộn qua) phải thuộc thanh đầu.
  const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('header'), {
    x: box.x + box.width - 30,
    y: box.y + box.height / 2,
  });
  expect(onTop).toBe(true);
});

test('desktop: thanh đầu không ẩn khi cuộn', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto('/today');
  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await page.getByText('Dữ liệu mẫu — không lưu lên máy chủ').waitFor();
  await page.goto('/khach-hang');
  await expect(page.getByRole('button', { name: /^Gọi / }).first()).toBeVisible();
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect((await page.getByRole('banner').boundingBox())?.y).toBe(0);
});
