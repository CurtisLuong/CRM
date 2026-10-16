import { expect, test } from '@playwright/test';

test('nhập Excel/CSV tạo khách mới local và bỏ qua số điện thoại trùng', async ({ page }, testInfo) => {
  const userId = `t311-${testInfo.project.name}`;
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'utilities@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-token',
        refresh_token: 'synthetic-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/nhap-xuat');
  await expect(page.getByRole('heading', { name: 'Nhập / Xuất dữ liệu' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'khach.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFFHọ tên,Số điện thoại\nMai,0901234567\nLan,0901234567', 'utf-8'),
  });
  await expect(page.getByText(/khach\.csv · 3 dòng/)).toBeVisible();
  await expect(page.getByLabel('Ghép cột 1')).toHaveValue('full_name');
  await expect(page.getByLabel('Ghép cột 2')).toHaveValue('phone');
  await page.getByRole('button', { name: 'Nhập khách' }).click();
  await expect(page.getByRole('status')).toContainText('thêm 1, trùng bỏ qua 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
