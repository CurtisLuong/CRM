import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:54321';
const USER = 'r505b-catalog-ui';

async function seedCatalog(page: import('@playwright/test').Page) {
  await page.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r505b@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-r505b-token',
        refresh_token: 'synthetic-r505b-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
    localStorage.setItem(
      `crm_catalog_v2:${userId}`,
      JSON.stringify({
        projects: [
          {
            id: 'r505b-project',
            name: 'Dự án Thử Nghiệm',
            typical_price_per_m2: 20_000_000,
            vat_rate: 5,
            kpbt_rate: 2,
            sort_order: 1,
            created_at: '2026-10-01T00:00:00.000Z',
          },
        ],
        buildings: [
          {
            id: 'r505b-building',
            project_id: 'r505b-project',
            code: 'T1',
            sort_order: 1,
            created_at: '2026-10-01T00:00:00.000Z',
          },
        ],
        units: [
          {
            id: 'r505b-unit',
            project_id: 'r505b-project',
            building_id: 'r505b-building',
            code: 'T1-1201',
            area_m2: 53.6,
            floor: 12,
            apt_type: '2N-2WC',
            direction: 'Đông Nam',
            status: 'available',
          },
        ],
        projectTypes: [],
        buildingTypes: [],
      }),
    );
  }, USER);
}

for (const width of [360, 1280]) {
  test(`Giỏ hàng bản mới hiển thị đúng ở ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedCatalog(page);
    await page.goto('/gio-hang');
    await expect(page.getByRole('heading', { name: 'Giỏ hàng' })).toBeVisible();
    await page.getByLabel('Chọn dự án').selectOption('r505b-project');
    if (width >= 1024) {
      const table = page.getByRole('table', { name: 'Danh sách căn' });
      await expect(table).toBeVisible();
      await expect(table.getByText('T1-1201')).toBeVisible();
      await expect(page.getByRole('table', { name: 'Danh sách toà' }).getByText('T1')).toBeVisible();
    } else {
      await expect(page.getByRole('table', { name: 'Danh sách căn' })).toBeHidden();
      const card = page.locator('article').filter({ hasText: 'T1-1201' });
      await expect(card).toBeVisible();
      await expect(page.locator('article').filter({ hasText: 'Toà T1' })).toBeVisible();
    }

    await expect(page.getByLabel('Giá dự án')).toBeVisible();
    await expect(page.getByText('triệu/m²').first()).toBeVisible();
    const horizontalOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
      elements: [...document.querySelectorAll<HTMLElement>('*')]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          text: element.textContent?.trim().slice(0, 50),
        })),
    }));
    expect(horizontalOverflow.scrollWidth <= horizontalOverflow.width, JSON.stringify(horizontalOverflow)).toBe(true);
    const shortButtons = await page
      .locator('button:visible')
      .evaluateAll((buttons) =>
        buttons
          .filter((button) => button.getBoundingClientRect().height < 44)
          .map((button) => button.textContent?.trim()),
      );
    expect(shortButtons).toEqual([]);
  });
}
