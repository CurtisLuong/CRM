import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// T2.C2: gallery /dev/ui chạy sáng/tối ở 360/390/1280, axe không lỗi nghiêm trọng, không cuộn ngang.
const SECTIONS = ['button', 'status', 'nav', 'rows', 'cards', 'profile', 'pickers', 'metrics', 'feedback'];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`gallery ${scheme === 'light' ? 'sáng' : 'tối'}`, () => {
    test.use({ colorScheme: scheme });

    test('đủ mục, đúng theme, không cuộn ngang', async ({ page }) => {
      await page.goto('/dev/ui');
      await expect(page.getByRole('heading', { name: 'Component src/ui', level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(scheme);
      for (const id of SECTIONS) await expect(page.locator(`section#${id}`)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });

    test('axe: không lỗi serious/critical', async ({ page }) => {
      await page.goto('/dev/ui');
      await page.evaluate(() => document.fonts.ready);
      const result = await new AxeBuilder({ page }).analyze();
      const bad = result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(bad).toEqual([]);
    });
  });
}

test('Sheet: mở, bảo vệ bản nháp khi Esc, Bỏ nháp mới đóng; axe trong sheet', async ({ page }) => {
  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Mở sheet Ghi chú' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ghi chú cho chị Lan' });
  await expect(dialog).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

  await dialog.getByRole('textbox').fill('Khách hẹn thứ Bảy xem nhà mẫu');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Bỏ nội dung đang nhập?')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục nhập' }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue('Khách hẹn thứ Bảy xem nhà mẫu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bỏ nháp' }).click();
  await expect(dialog).toBeHidden();
});

test('Toast có Hoàn tác; Toast lỗi có Thử lại', async ({ page }) => {
  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Toast Hoàn tác' }).click();
  await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toast lỗi' }).click();
  await expect(page.locator('[data-radix-toast-announce-alt="Thử lại"]')).toBeVisible();
});

test('vùng chạm nút icon ≥ 44×44', async ({ page }) => {
  await page.goto('/dev/ui');
  const sizes = await page
    .locator('section#button button[aria-label], section#rows button[aria-label]')
    .evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
  expect(sizes.length).toBeGreaterThan(0);
  for (const [w, h] of sizes) {
    expect(w).toBeGreaterThanOrEqual(44);
    expect(h).toBeGreaterThanOrEqual(44);
  }
});
