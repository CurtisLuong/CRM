import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// T2.C1: token sáng/tối, chọn Sáng/Tối/Tự động, font tự host, /dev/type hiển thị dấu tiếng Việt ở mọi cỡ.
const SAMPLE = 'Trường, Hưởng, Ngữ, Tự, Đường';
const ROLES = ['display', 'title', 'section', 'body-strong', 'body', 'small', 'label', 'mono-data'];
const BG = { light: 'rgb(242, 244, 247)', dark: 'rgb(10, 13, 18)' };

const themeAttr = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`hệ thống ${scheme === 'light' ? 'sáng' : 'tối'}`, () => {
    test.use({ colorScheme: scheme });

    test('Tự động theo hệ thống; /dev/type đủ cấp chữ, font Be Vietnam Pro, không cuộn ngang', async ({ page }) => {
      await page.goto('/dev/type');
      await expect(page.getByRole('heading', { name: 'Kiểu chữ & màu' })).toBeVisible();
      expect(await themeAttr(page)).toBe(scheme);
      expect(await bodyBg(page)).toBe(BG[scheme]);
      await expect(page.getByRole('radio', { name: 'Tự động' })).toBeChecked();

      for (const role of ROLES) await expect(page.locator(`[data-role="${role}"]`)).toContainText(SAMPLE);

      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([
          document.fonts.load('600 28px "Be Vietnam Pro"', 'Đường'),
          document.fonts.load('500 13px "JetBrains Mono"', 'Đ09'),
        ]);
        return {
          sans: document.fonts.check('600 28px "Be Vietnam Pro"', 'Trường Hưởng Ngữ Tự Đường'),
          mono: document.fonts.check('500 13px "JetBrains Mono"', '09:30'),
          family: getComputedStyle(document.body).fontFamily,
        };
      });
      expect(fonts.sans).toBe(true);
      expect(fonts.mono).toBe(true);
      expect(fonts.family).toContain('Be Vietnam Pro');

      // Dòng chữ mẫu không bị cắt (dấu chồng nằm trong hộp chữ).
      const clipped = await page
        .locator('[data-role] > span:last-child')
        .evaluateAll(
          (els) =>
            els.filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).length,
        );
      expect(clipped).toBe(0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });

    test('tương phản màu đạt WCAG AA (axe)', async ({ page }) => {
      await page.goto('/dev/type');
      await page.evaluate(() => document.fonts.ready);
      const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(result.violations.map((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);
    });
  });
}

test.describe('chọn giao diện', () => {
  test.use({ colorScheme: 'light' });

  test('chọn Tối → lưu lại sau khi tải lại; Tự động → về theo hệ thống', async ({ page }) => {
    await page.goto('/dev/type');
    await page.getByText('Tối', { exact: true }).click();
    expect(await themeAttr(page)).toBe('dark');
    expect(await bodyBg(page)).toBe(BG.dark);
    const meta = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(meta?.toLowerCase()).toBe('#0a0d12');

    await page.reload();
    expect(await themeAttr(page)).toBe('dark');
    await expect(page.getByRole('radio', { name: 'Tối' })).toBeChecked();

    await page.getByText('Tự động', { exact: true }).click();
    expect(await themeAttr(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => themeAttr(page)).toBe('dark');
  });

  test('chọn Sáng giữ sáng dù hệ thống tối', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/dev/type');
    await page.getByText('Sáng', { exact: true }).click();
    await page.reload();
    expect(await themeAttr(page)).toBe('light');
    expect(await bodyBg(page)).toBe(BG.light);
  });
});
