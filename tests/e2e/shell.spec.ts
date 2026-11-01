import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// T2.C3: khung app — 4 tab + deep link, Cmd/Ctrl+K, ＋ Ghi nhanh, Back Android (window.CRMBack), sáng/tối.
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const nav = (page: Page) =>
  page.getByRole('navigation', { name: 'Điều hướng chính' }).filter({ visible: true }).first();
const back = (page: Page) => page.evaluate(() => (window as Window & { CRMBack?: () => boolean }).CRMBack?.() ?? null);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`khung app ${scheme === 'light' ? 'sáng' : 'tối'}`, () => {
    test.use({ colorScheme: scheme });

    test('4 tab điều hướng; tab đang chọn đánh dấu; tiêu đề đổi; không cuộn ngang; axe sạch', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('header h1')).toHaveText('Hôm nay');
      for (const [label, path] of [
        ['Khách hàng', '/khach-hang'],
        ['Công việc', '/cong-viec'],
        ['Hiệu quả', '/hieu-qua'],
        ['Hôm nay', '/'],
      ] as const) {
        await nav(page).getByRole('button', { name: label }).click();
        await expect(page).toHaveURL(path);
        await expect(nav(page).getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('header h1')).toHaveText(label);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      // Chỉ kiểm khung; nội dung #main thuộc từng tính năng (trang chủ tạm T1.1 còn màu cố định).
      const axe = await new AxeBuilder({ page }).exclude('#main').analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    });

    test('Bảng lệnh mở bằng Ctrl+K, axe sạch, chọn màn bằng phím', async ({ page }) => {
      await page.goto('/');
      await page.keyboard.press('ControlOrMeta+k');
      const box = page.getByRole('combobox', { name: 'Tìm khách, lệnh, màn' });
      await expect(box).toBeFocused();
      const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      await box.fill('hieu qua');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL('/hieu-qua');
      await expect(page.getByRole('dialog')).toBeHidden();
    });
  });
}

test('deep link /khach-hang/123 → tab Khách hàng đang chọn', async ({ page }) => {
  await page.goto('/khach-hang/123');
  await expect(nav(page).getByRole('button', { name: 'Khách hàng' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('header h1')).toHaveText('Khách hàng');
});

test('ô tìm ở header mở Bảng lệnh; Esc đóng', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Tìm khách, lệnh/ }).click();
  await expect(page.getByRole('combobox', { name: 'Tìm khách, lệnh, màn' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Back Android: đóng sheet ＋ trước → lùi màn → về Hôm nay → hết (false)', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Công việc' }).click();
  await expect(page).toHaveURL('/cong-viec');
  await page.getByRole('button', { name: 'Ghi nhanh' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Ghi nhanh' })).toBeVisible();

  expect(await back(page)).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL('/cong-viec');

  expect(await back(page)).toBe(true);
  await expect(page).toHaveURL('/');

  expect(await back(page)).toBe(false);
});

test('Back Android: deep link không có lịch sử → về Hôm nay; Bảng lệnh đang mở được đóng trước', async ({ page }) => {
  await page.goto('/hieu-qua');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL('/hieu-qua');
  expect(await back(page)).toBe(true);
  await expect(page).toHaveURL('/');
});

// Curtis 2026-10-21 (PF-04): menu "Menu" kiểu nhóm; Giao diện = một hàng chọn Sáng/Tối/Tự động.
test('Menu: đổi giao diện sang Tối', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('radiogroup', { name: 'Giao diện' }).getByRole('radio', { name: 'Tối' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
});

test('desktop: rail thay bottom nav, mở rộng/thu gọn và nhớ lựa chọn', async ({ page }) => {
  test.skip(!isDesktop(page), 'chỉ desktop ≥1024px');
  await page.goto('/');
  // D-028 (docs/DESIGN.md §5): menu trái thu gọn 64px, mở rộng 232px; mặc định thu gọn, nhớ lựa chọn sau tải lại.
  const width = async () => Math.round((await nav(page).boundingBox())?.width ?? 0);
  await expect.poll(width).toBe(64);
  await nav(page).getByRole('button', { name: 'Mở rộng thanh bên' }).click();
  await expect.poll(width).toBe(232);
  await page.reload();
  await expect.poll(width).toBe(232);
});
