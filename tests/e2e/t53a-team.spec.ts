import { expect, type Page, test } from '@playwright/test';

const RPC = 'http://127.0.0.1:54321/rest/v1/rpc/team_list';
const USER = 't53a-team-user';
const MEMBER = {
  user_id: USER,
  full_name: 'Nguyễn Ánh Hường',
  email: 't53a-team@example.test',
  is_admin: false,
  is_me: true,
};

async function installAccount(page: Page, cached = true) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(
    ({ userId, member, cached }) => {
      const user = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: member.email,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: user.id, email: user.email }));
      if (cached) localStorage.setItem(`crm_team:${user.id}`, JSON.stringify([member]));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-t53a-team-token',
          refresh_token: 'synthetic-t53a-team-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    },
    { userId: USER, member: MEMBER, cached },
  );
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`T5.3a Đồng nghiệp: nhóm rỗng có hướng dẫn đúng (${colorScheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await installAccount(page);
    await page.goto('/dong-nghiep');
    const main = page.locator('#main');
    await expect(main.getByText(/Nhóm chưa có thành viên/)).toBeVisible();
    await expect(main.getByText('0 người trong nhóm')).toBeVisible();
    await expect(main.getByText(/SQL\//)).toHaveCount(0);
    await expect(main.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`team-empty-${colorScheme}.png`), fullPage: true });
  });
}

test('T5.3a Đồng nghiệp: chưa đăng nhập không báo lỗi SQL', async ({ page }) => {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/dong-nghiep');
  const main = page.locator('#main');
  await expect(main.getByText(/Bạn chưa đăng nhập/)).toBeVisible();
  await expect(main.getByText(/SQL\//)).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Tải lại' })).toHaveCount(0);
});

test('T5.3a Đồng nghiệp: offline giữ cache và tải lại khi có mạng', async ({ page, context }) => {
  await installAccount(page);
  await page.route(RPC, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MEMBER]) }),
  );
  await page.goto('/dong-nghiep');
  const main = page.locator('#main');
  await expect(main.getByText('Nguyễn Ánh Hường · Bạn')).toBeVisible();
  await context.setOffline(true);
  await expect(main.getByText(/Ngoại tuyến\. Đang hiển thị danh sách đã lưu/)).toBeVisible();
  await expect(main.getByText('Nguyễn Ánh Hường · Bạn')).toBeVisible();
  await expect(main.getByText(/SQL\//)).toHaveCount(0);
  await context.setOffline(false);
  await expect(main.getByText(/Ngoại tuyến\. Đang hiển thị danh sách đã lưu/)).toHaveCount(0);
  await expect(main.getByText('Nguyễn Ánh Hường · Bạn')).toBeVisible();
});

test('T5.3a Đồng nghiệp: lý do máy chủ, thiếu RPC chính xác và thử lại', async ({ page }) => {
  await installAccount(page, false);
  let result: { code: string; message: string } | null = {
    code: '42501',
    message: 'Không có quyền xem nhóm',
  };
  await page.route(RPC, (route) =>
    route.fulfill({
      status: result ? 400 : 200,
      contentType: 'application/json',
      body: JSON.stringify(result || [MEMBER]),
    }),
  );
  await page.goto('/dong-nghiep');
  const main = page.locator('#main');
  await expect(main.getByRole('alert')).toContainText('Không có quyền xem nhóm');
  await expect(main.getByText(/SQL\//)).toHaveCount(0);
  result = { code: '42883', message: 'function public.unknown_helper does not exist' };
  await main.getByRole('button', { name: 'Tải lại' }).click();
  await expect(main.getByRole('alert')).toContainText('unknown_helper');
  await expect(main.getByText(/SQL\//)).toHaveCount(0);
  result = { code: 'PGRST202', message: 'Could not find the function public.team_list in the schema cache' };
  await main.getByRole('button', { name: 'Tải lại' }).click();
  await expect(main.getByRole('alert')).toContainText('SQL/add_team_assign.sql');
  result = null;
  await main.getByRole('button', { name: 'Tải lại' }).click();
  await expect(main.getByRole('alert')).toHaveCount(0);
  await expect(main.getByText('Nguyễn Ánh Hường · Bạn')).toBeVisible();
});
