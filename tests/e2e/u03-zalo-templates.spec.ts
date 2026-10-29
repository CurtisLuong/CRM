import { expect, test } from '@playwright/test';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`U-03 Mẫu tin Zalo ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('mở từ Tiện ích, giữ dữ liệu cũ và lưu mẫu mới không cuộn ngang', async ({ page }) => {
      await page.addInitScript(() => {
        const userId = 'u03-e2e-user';
        const user = {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'u03@example.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: '2026-10-01T00:00:00.000Z',
        };
        localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
        localStorage.setItem(
          'crm_zalo_templates:u03-e2e-user',
          JSON.stringify([
            { id: 'old-template', name: 'Mẫu lưu trước', text: 'Nội dung cũ đã lưu nguyên vẹn.', legacy: 'giữ lại' },
          ]),
        );
        localStorage.setItem(
          'sb-127-auth-token',
          JSON.stringify({
            access_token: 'synthetic-e2e-token',
            refresh_token: 'synthetic-e2e-refresh',
            expires_at: 4102444800,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          }),
        );
      });
      // Supabase giả không chạy: chặn mạng tới máy chủ để trang đi đường lưu trên thiết bị.
      await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
      await page.goto('/');
      await page.getByRole('button', { name: 'Menu' }).click();
      const menu = page.getByRole('dialog', { name: 'Menu' });
      const zaloMenuItem = menu.getByRole('button', { name: 'Mẫu tin Zalo' });
      await expect(zaloMenuItem).toBeVisible();
      const order = await menu.locator('button').allTextContents();
      expect(order.indexOf('Tài liệu')).toBeLessThan(order.indexOf('Thủ tục'));
      expect(order.indexOf('Thủ tục')).toBeLessThan(order.indexOf('Mẫu tin Zalo'));
      await zaloMenuItem.click();

      await expect(page).toHaveURL(/\/mau-zalo$/);
      await expect(page.locator('#main').getByRole('heading', { name: 'Mẫu tin Zalo', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Tên mẫu' }).first()).toHaveValue('Mẫu lưu trước');
      await expect(page.getByRole('textbox', { name: 'Nội dung — Mẫu lưu trước' })).toHaveValue(
        'Nội dung cũ đã lưu nguyên vẹn.',
      );
      await page.getByRole('textbox', { name: 'Tên mẫu' }).first().fill('Mẫu đã sửa');
      await page.getByRole('textbox', { name: 'Nội dung — Mẫu lưu trước' }).fill('Nội dung đã cập nhật.');
      await page.getByRole('button', { name: 'Thêm mẫu' }).click();
      await page.getByRole('textbox', { name: 'Tên mẫu' }).last().fill('Mẫu mới');
      await page.getByRole('textbox', { name: 'Nội dung mẫu mới' }).fill('Xin chào anh/chị.');
      await page.getByRole('button', { name: 'Lưu mẫu tin' }).click();
      await expect(page.getByRole('status')).toContainText('Đã lưu trên thiết bị');
      await page.reload();
      await expect(page.getByRole('textbox', { name: 'Tên mẫu' }).first()).toHaveValue('Mẫu đã sửa');
      await expect(page.getByRole('textbox', { name: 'Tên mẫu' }).last()).toHaveValue('Mẫu mới');
      const stored = await page.evaluate(() => localStorage.getItem('crm_zalo_templates:u03-e2e-user'));
      expect(JSON.parse(stored || '[]')).toMatchObject([
        { id: 'old-template', name: 'Mẫu đã sửa', text: 'Nội dung đã cập nhật.', legacy: 'giữ lại' },
        { name: 'Mẫu mới', text: 'Xin chào anh/chị.' },
      ]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('Cài đặt vẫn có giao diện và cập nhật nhưng không còn mẫu Zalo', async ({ page }) => {
      await page.goto('/cai-dat');
      await expect(page.locator('#main').getByRole('heading', { name: 'Cài đặt', exact: true })).toBeVisible();
      await expect(page.locator('#main').getByRole('heading', { name: 'Mẫu tin Zalo', exact: true })).toHaveCount(0);
      await expect(page.locator('#main').getByRole('heading', { name: 'Giao diện', exact: true })).toBeVisible();
      await expect(page.locator('#main').getByRole('heading', { name: 'Cập nhật ứng dụng Android' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}
