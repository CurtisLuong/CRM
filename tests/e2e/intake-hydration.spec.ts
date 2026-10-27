import { expect, test } from '@playwright/test';

test('intake giữ nháp khi phiên tài khoản được khôi phục sau lúc bắt đầu nhập', async ({ page }, testInfo) => {
  const userId = `intake-hydration-${testInfo.project.name}`;
  await page
    .context()
    .route('http://127.0.0.1:54321/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
  await page.goto('/intake');

  const fullName = page.getByLabel('Họ tên *');
  const phone = page.getByLabel('Số điện thoại *');
  await fullName.fill('Khách đang nhập');
  await phone.fill('0911555667');

  const token = JSON.stringify({
    access_token: 'synthetic-hydration-token',
    refresh_token: 'synthetic-hydration-refresh',
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'hydration@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    },
  });
  const customersRead = page.waitForResponse(
    (response) => response.url().includes('/rest/v1/customers') && response.request().method() === 'GET',
  );
  const authPage = await page.context().newPage();
  await authPage.addInitScript(
    ({ id, session }) => {
      localStorage.setItem('crm_last_user', JSON.stringify({ id, email: 'hydration@example.test' }));
      localStorage.setItem('sb-127-auth-token', session);
    },
    { id: userId, session: token },
  );
  await authPage.goto('/');
  await customersRead;

  await expect(fullName).toHaveValue('Khách đang nhập');
  await expect(phone).toHaveValue('0911555667');
  await authPage.close();
});
