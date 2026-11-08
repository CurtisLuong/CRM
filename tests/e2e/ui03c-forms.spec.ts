import { expect, type Locator, type Page, type TestInfo, test } from '@playwright/test';

const USER = 'ui03c-layout-user';
const PROJECT = 'Dự án Hải Phòng';
const tables: Record<string, Record<string, unknown>[]> = {
  projects: [{ id: 'p1', name: PROJECT, typical_price_per_m2: 25_000_000, vat_rate: 5, kpbt_rate: 2 }],
  buildings: [{ id: 'b1', project_id: 'p1', code: 'A' }],
  project_apt_types: [{ id: 'pt1', project_id: 'p1', apt_type: '2N', typical_area_m2: 60 }],
  building_apt_types: [{ id: 'bt1', project_id: 'p1', building_id: 'b1', apt_type: '2N', area_m2: 62 }],
  units: [{ id: 'u1', project_id: 'p1', building_id: 'b1', code: 'A-1201', apt_type: '2N', status: 'available' }],
  team_list: [
    { user_id: USER, full_name: 'Tư vấn viên thử', email: 'ui03c@example.test', is_admin: true, is_me: true },
  ],
  lead_campaign_projects: [{ campaign: 'Chiến dịch thử', project: PROJECT, archived_at: null }],
};

async function install(page: Page, theme: 'light' | 'dark') {
  await page.clock.install({ time: new Date('2026-11-08T10:00:00+07:00') });
  // Chặn toàn bộ dịch vụ thật; mọi phản hồi dữ liệu bên dưới đều là fixture.
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  await page.route('http://127.0.0.1:54321/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    const data =
      table === 'user_settings'
        ? { zalo_templates: [{ id: 'layout-template', name: 'Mẫu kiểm thử', text: 'Chào anh/chị.' }] }
        : tables[table] || [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.addInitScript(
    ({ userId, tables, theme }) => {
      const user = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'ui03c@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('sk-theme', theme);
      localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-ui03c-token',
          refresh_token: 'synthetic-ui03c-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      localStorage.setItem(
        `crm_catalog_v2:${userId}`,
        JSON.stringify({
          projects: tables.projects,
          buildings: tables.buildings,
          units: tables.units,
          projectTypes: tables.project_apt_types,
          buildingTypes: tables.building_apt_types,
        }),
      );
      localStorage.setItem(`crm_team:${userId}`, JSON.stringify(tables.team_list));
      localStorage.setItem(
        `crm_zalo_templates:${userId}`,
        JSON.stringify([{ id: 'layout-template', name: 'Mẫu kiểm thử', text: 'Chào anh/chị.' }]),
      );
    },
    { userId: USER, tables, theme },
  );
  await page.goto('/');
  await page.evaluate(async (userId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
      request.onupgradeneeded = () => {
        const current = request.result;
        if (!current.objectStoreNames.contains('customers')) current.createObjectStore('customers', { keyPath: 'id' });
        if (!current.objectStoreNames.contains('queue'))
          current.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        if (!current.objectStoreNames.contains('meta')) current.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      const customer = {
        id: 'layout-customer',
        owner_id: userId,
        full_name: 'Khách kiểm thử',
        phone: '0901111111',
        campaign: 'Chiến dịch thử',
        source: ['facebook_ads'],
        projects: ['Dự án Hải Phòng'],
        apt_type: '2N',
        qualified_at: '2026-11-08T03:00:00Z',
        care_stage: 'Đang chăm sóc',
        registered_at: '2026-11-08T03:00:00Z',
        created_at: '2026-11-08T03:00:00Z',
        updated_at: '2026-11-08T03:00:00Z',
        next_tasks: [],
        call_attempts: [],
        interactions: [],
      };
      tx.objectStore('customers').put(customer);
      tx.objectStore('customers').put({
        ...customer,
        id: 'archived-customer',
        full_name: 'Khách đã lưu',
        archived_at: '2026-11-08T03:00:00Z',
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, USER);
}

async function sameRow(first: Locator, second: Locator) {
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  // Ngăn kéo còn đang trượt vào thì boundingBox có thể rỗng → chờ đo được cả hai.
  await expect.poll(async () => !!(await first.boundingBox()) && !!(await second.boundingBox())).toBe(true);
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  if (!a || !b) throw new Error('Không đo được ô nhập');
  expect(Math.abs(a.y - b.y), 'Cặp ô ngắn lệch y ≤ 2px').toBeLessThanOrEqual(2);
  expect(b.x, 'Hai ô ở hai cột khác nhau').toBeGreaterThanOrEqual(a.x + a.width);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  const scope = page.getByRole('dialog').filter({ visible: true });
  const form = (await scope.count()) ? scope : page.locator('#main');
  expect(await form.locator('[data-form-card]').count(), `${name}: có thẻ chứa ô`).toBeGreaterThan(0);
  const overflow = await form
    .locator('[data-form-card], [data-form-subsection]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.textContent?.slice(0, 80)),
    );
  expect(overflow, `${name}: nội dung thẻ không tràn ngang`).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`UI-03c ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      test.skip(page.viewportSize()?.width === 390, 'Đo tại hai kích thước nghiệm thu 360/1280.');
      await install(page, theme);
    });

    test('Cài đặt, Mẫu Zalo, Nhóm, Retarget, Nhập/Xuất và bộ lọc Khách', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.goto('/cai-dat');
      await expect(page.getByLabel('Dự án cho chiến dịch Chiến dịch thử')).toBeVisible();
      await sameRow(page.getByLabel('Từ ngày', { exact: true }), page.getByLabel('Đến ngày', { exact: true }));
      await capture(page, testInfo, `settings-${theme}`);

      await page.goto('/mau-zalo');
      // Mẫu mặc định hiện trước, rồi mới thay bằng mẫu đã lưu của tài khoản → chờ còn đúng 1 mẫu.
      await expect(page.getByLabel('Tên mẫu', { exact: true })).toHaveCount(1);
      await expect(page.getByLabel('Tên mẫu', { exact: true })).toHaveValue('Mẫu kiểm thử');
      const content = page.getByLabel('Nội dung — Mẫu kiểm thử');
      await expect(content).toBeVisible();
      const widths = await content.evaluate((element) => ({
        field: element.clientWidth,
        card: element.closest('[data-form-card]')?.clientWidth || 0,
      }));
      expect(widths.field).toBeGreaterThan(widths.card * 0.8);
      await capture(page, testInfo, `zalo-${theme}`);

      await page.goto('/dong-nghiep');
      await expect(page.getByLabel('Email đồng nghiệp')).toBeVisible();
      await capture(page, testInfo, `team-${theme}`);

      await page.goto('/khach-hang/retarget');
      await sameRow(
        page.getByLabel('Loại căn', { exact: true }),
        page.getByLabel('Dự án đã quan tâm', { exact: true }),
      );
      await sameRow(page.getByLabel('Loại căn cần xác minh'), page.getByLabel('Ngày theo dõi sau khi gửi'));
      await capture(page, testInfo, `retarget-${theme}`);

      await page.goto('/nhap-xuat');
      await page.locator('input[type=file]').setInputFiles({
        name: 'layout.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('\uFEFFHọ tên,Số điện thoại\nMai,0901234567', 'utf8'),
      });
      await sameRow(page.getByLabel('Ghép cột 1'), page.getByLabel('Ghép cột 2'));
      await capture(page, testInfo, `import-export-${theme}`);

      await page.goto('/khach-hang');
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
      await sameRow(page.getByLabel('Lọc trạng thái'), page.getByLabel('Lọc bậc chăm sóc'));
      await capture(page, testInfo, `customers-filter-${theme}`);
      await page.getByLabel('Lọc ngày đăng ký').selectOption('custom');
      await expect(page.getByRole('button', { name: 'Tháng trước' })).toBeVisible();
      await capture(page, testInfo, `customers-calendar-${theme}`);
    });

    test('Tài liệu thêm/sửa: các ô dài và tệp nằm trong khu riêng', async ({ page }, testInfo) => {
      await page.goto('/tai-lieu');
      // Danh sách trống có 2 nút "Thêm tài liệu" (đầu trang + ô trống).
      await page.getByRole('button', { name: 'Thêm tài liệu', exact: true }).first().click();
      await page.getByLabel('Tiêu đề', { exact: true }).fill('Tài liệu kiểm thử');
      await page.getByLabel('Nội dung chữ').fill('Nội dung có dấu để kiểm tra bố cục.');
      await capture(page, testInfo, `document-add-${theme}`);
      await page.getByRole('button', { name: 'Lưu tài liệu', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await page.getByRole('button', { name: 'Sửa', exact: true }).click();
      await expect(page.getByLabel('Tiêu đề', { exact: true })).toHaveValue('Tài liệu kiểm thử');
      await capture(page, testInfo, `document-edit-${theme}`);
    });

    test('Giỏ hàng: bộ lọc và từng ngăn kéo', async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.goto('/gio-hang');
      await sameRow(page.getByLabel('Tầng từ', { exact: true }), page.getByLabel('Tầng đến', { exact: true }));
      await capture(page, testInfo, `catalog-filter-${theme}`);
      await page.getByRole('button', { name: /^Chọn dự án/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: PROJECT, exact: true }).click();
      await page.getByRole('combobox', { name: 'Chọn toà', exact: true }).selectOption('b1');
      const dialog = page.getByRole('dialog');
      const cases = [
        { button: '+ Thêm', first: 'Giá dự án', second: 'Phí mỗi căn', name: 'project' },
        { button: '+ Thêm loại', first: 'Tên loại căn', second: 'Diện tích điển hình', name: 'type' },
        { button: 'Thêm toà', first: 'Mã toà', second: 'Giá duyệt toà', name: 'building' },
        { button: 'Thêm căn', first: 'Mã căn', second: 'Loại căn', name: 'unit' },
      ];
      for (const item of cases) {
        await page.getByRole('button', { name: item.button, exact: true }).click();
        await sameRow(dialog.getByLabel(item.first, { exact: true }), dialog.getByLabel(item.second, { exact: true }));
        await capture(page, testInfo, `catalog-${item.name}-${theme}`);
        await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Tuỳ chỉnh', exact: true }).click();
      await sameRow(
        dialog.getByRole('checkbox').locator('..'),
        dialog.getByLabel('Diện tích riêng 2N', { exact: true }).locator('../..'),
      );
      await capture(page, testInfo, `catalog-building-types-${theme}`);
    });

    test('Tính vay: ô ngắn ghép hàng, thông số lãi thụt một bậc', async ({ page }, testInfo) => {
      await page.goto('/tinh-vay?area=60&pricePerM2=25000000');
      await sameRow(
        page.getByLabel('Tên tư vấn viên', { exact: true }),
        page.getByLabel('Số điện thoại tư vấn viên', { exact: true }),
      );
      await sameRow(page.getByLabel('Toà', { exact: true }), page.getByLabel('Mã căn', { exact: true }));
      await sameRow(
        page.getByLabel('Ngày ký hợp đồng', { exact: true }),
        page.getByLabel('Ngày bàn giao', { exact: true }),
      );
      await expect(page.locator('[data-form-subsection]').filter({ hasText: 'Bậc lãi suất ưu đãi' })).toHaveCount(1);
      await capture(page, testInfo, `loan-${theme}`);
    });
  });
}
