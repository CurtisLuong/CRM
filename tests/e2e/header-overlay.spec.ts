import { expect, test } from '@playwright/test';

// Curtis 29/10 (Android): thanh đầu bị nút gọi của dòng khách đè lên khi cuộn, và bị đẩy lên status bar.
// Không giả lập được safe-area trên Chromium; kiểm phần đo được: cao 56px khi không có status bar, nằm trên mọi dòng danh sách.
// Curtis 11/11 đổi từ "ẩn khi cuộn" (30/10) sang thanh luôn hiện, nền kính mờ (kiểu màn Calls Android).
test('thanh đầu cao 56px, luôn hiện khi cuộn, nền kính mờ, nằm trên dòng khách (360px)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/today');
  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await page.getByText('Dữ liệu mẫu — không lưu lên máy chủ').waitFor();
  await page.goto('/khach-hang');
  await expect(page.getByRole('button', { name: /^Gọi / }).first()).toBeVisible();

  const header = page.getByRole('banner');
  expect((await header.boundingBox())?.height).toBe(56);

  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await page.waitForTimeout(300);
  expect((await header.boundingBox())?.y).toBe(0);
  const glass = await header.evaluate((el) => {
    const s = getComputedStyle(el);
    return { blur: s.backdropFilter, bg: s.backgroundColor };
  });
  expect(glass.blur).toContain('blur');
  // Nền không đặc hẳn (nội dung thấp thoáng) nhưng vẫn gần đặc để giữ tương phản chữ.
  expect(glass.bg).not.toMatch(/^rgb\(/);
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
