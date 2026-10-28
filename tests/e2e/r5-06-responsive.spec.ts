import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const screens = [
  { path: '/khach-moi', title: 'Khách mới' },
  { path: '/khach-hang/luu-tru', title: 'Khách đã lưu trữ' },
  { path: '/khach-hang/retarget', title: 'Tệp & Retarget' },
  { path: '/dong-nghiep', title: 'Đồng nghiệp' },
];

test('R5-06 screens use the new UI kit without horizontal overflow', async ({ page }) => {
  for (const file of [
    'src/features/leads/route.tsx',
    'src/features/leads/meta-lead-ads-banner.tsx',
    'src/features/archived/route.tsx',
    'src/features/retarget/route.tsx',
    'src/features/team/route.tsx',
  ]) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(source, `${file} should not import the retired UI barrel`).not.toMatch(/from ['"]@\/ui['"]/);
    expect(source, `${file} should use a kit component`).toMatch(/@\/components\/(crm|ui)(\/|['"])/);
  }

  for (const width of [360, 1280]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      for (const screen of screens) {
        await page.goto(screen.path);
        if (screen.path === '/khach-hang/retarget') {
          await expect(page.getByText('Chưa có dữ liệu tài khoản')).toBeVisible();
        } else {
          await expect(page.locator('#main').getByRole('heading', { name: screen.title }).last()).toBeVisible();
        }
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
          .toBe(true);
      }
    }
  }
});
