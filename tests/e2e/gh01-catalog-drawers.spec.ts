import { expect, type Page, test } from '@playwright/test';

const API = 'http://127.0.0.1:54321';
const USER = 'gh01-catalog-user';
const PROJECT = 'Dự án Hải Phòng';
type Row = Record<string, unknown>;

async function install(page: Page, theme: 'light' | 'dark', empty = false) {
  const tables: Record<string, Row[]> = {
    projects: empty
      ? []
      : [
          {
            id: 'p1',
            name: PROJECT,
            typical_price_per_m2: 25_000_000,
            vat_rate: 5,
            kpbt_rate: 2,
            handover_date: '2027-06-01',
          },
          { id: 'p2', name: 'Dự án Hưng Yên' },
        ],
    buildings: empty ? [] : [{ id: 'b1', project_id: 'p1', code: 'A' }],
    project_apt_types: empty ? [] : [{ id: 'pt1', project_id: 'p1', apt_type: '2N', typical_area_m2: 60 }],
    building_apt_types: empty ? [] : [{ id: 'bt1', project_id: 'p1', building_id: 'b1', apt_type: '2N', area_m2: 62 }],
    units: empty
      ? []
      : [
          {
            id: 'u1',
            project_id: 'p1',
            building_id: 'b1',
            code: 'A-1201',
            apt_type: '2N',
            status: 'available',
            note: 'Giữ ghi chú cũ',
          },
          {
            id: 'u2',
            project_id: 'p1',
            building_id: 'b1',
            code: 'A-1202',
            apt_type: '2N',
            status: 'available',
            price_per_m2_override: 27_000_000,
          },
        ],
  };
  const writes: { table: string; body: Row }[] = [];
  const failure = { table: '' };
  let nextId = 0;
  await page.clock.install({ time: new Date('2026-11-03T10:00:00+07:00') });
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1) || '';
    if (!tables[table]) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const matches = (row: Row) =>
      [...url.searchParams].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3));
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      const rows = tables[table].filter(matches).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
          'access-control-expose-headers': 'content-range',
        },
        body: JSON.stringify(rows),
      });
    }
    if (failure.table === table)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Không lưu được dữ liệu thử nghiệm', code: 'XX000' }),
      });
    const raw = request.postDataJSON() as Row | Row[];
    const bodies = Array.isArray(raw) ? raw : [raw];
    const result: Row[] = [];
    for (const body of bodies) {
      writes.push({ table, body });
      if (request.method() === 'PATCH') {
        for (const row of tables[table].filter(matches)) {
          Object.assign(row, body);
          result.push(row);
        }
      } else {
        const row = { id: `new-${++nextId}`, ...body };
        tables[table].push(row);
        result.push(row);
      }
    }
    const single = request.headers().accept?.includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(single ? result[0] : result),
    });
  });
  await page.addInitScript(
    ({ userId, tables, theme }) => {
      const user = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'gh01@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('sk-theme', theme);
      localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-gh01-token',
          refresh_token: 'synthetic-gh01-refresh',
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
    },
    { userId: USER, tables, theme },
  );
  await page.goto('/');
  await page.evaluate(async (userId) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('queue'))
        db.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, USER);
  await page.goto('/gio-hang');
  await expect(page.getByRole('heading', { name: 'Giỏ hàng', exact: true })).toBeVisible();
  return { tables, writes, failure };
}

async function chooseProject(page: Page) {
  await page.getByRole('button', { name: /^Chọn dự án/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: PROJECT, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: `Chọn dự án: ${PROJECT}`, exact: true })).toBeVisible();
}

function unitRow(page: Page, width: number, code: string) {
  return width < 1024
    ? page.locator('article').filter({ hasText: code })
    : page.getByRole('table', { name: 'Danh sách căn' }).getByRole('row').filter({ hasText: code });
}

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .locator('button:visible')
      .evaluateAll((buttons) =>
        buttons.filter((button) => button.getBoundingClientRect().height < 44).map((button) => button.textContent),
      ),
  ).toEqual([]);
}

for (const width of [360, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`GH-01 chọn dự án, các form drawer và kế thừa ${width}px ${theme}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      const { tables, writes } = await install(page, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByLabel('Tên dự án', { exact: true })).toBeHidden();
      await expect(page.getByLabel('Giá dự án', { exact: true })).toBeHidden();
      await expect(page.getByRole('button', { name: PROJECT, exact: true })).toBeHidden();
      await checkLayout(page);
      await chooseProject(page);
      const dialog = page.getByRole('dialog');

      await page.getByRole('button', { name: 'Thêm toà', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Thêm toà' })).toBeVisible();
      await expect(dialog.getByText('Theo dự án: 25 triệu/m²', { exact: true })).toBeVisible();
      await expect(dialog.getByText('Theo dự án: 01/06/2027', { exact: true })).toBeVisible();
      await dialog.getByLabel('Mã toà', { exact: true }).fill('B');
      await dialog.getByRole('button', { name: 'Lưu toà', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(writes.find((write) => write.table === 'buildings')?.body).toMatchObject({
        code: 'B',
        approved_price_per_m2: null,
        handover_date: null,
      });
      await expect(page.getByText('Đã thêm toà', { exact: true })).toBeVisible();
      // GH-03 (09/11): chọn toà qua tấm "Chọn toà"; loại căn sửa trong tấm Sửa dự án / Sửa toà.
      await page.getByRole('button', { name: /^Chọn toà:/ }).click();
      await dialog.getByRole('button', { name: 'Chọn toà A', exact: true }).click();
      await expect(dialog).toBeHidden();

      await unitRow(page, width, 'A-1201').getByRole('button', { name: 'Sửa', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Sửa căn A-1201' })).toBeVisible();
      await expect(dialog.getByLabel('Diện tích', { exact: true })).toHaveValue('');
      await expect(dialog.getByText('Theo toà: 62 m²', { exact: true })).toBeVisible();
      await expect(dialog.getByText('Theo dự án: 25 triệu/m²', { exact: true })).toBeVisible();
      await dialog.getByLabel('Diện tích', { exact: true }).fill('65');
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      expect(tables.units.find((row) => row.id === 'u1')?.area_m2).toBeUndefined();

      await unitRow(page, width, 'A-1202').getByRole('button', { name: 'Sửa', exact: true }).click();
      await expect(dialog.getByLabel('Giá riêng', { exact: true })).toHaveValue('27');
      await dialog.getByLabel('Giá riêng', { exact: true }).fill('');
      await expect(dialog.getByText('Theo dự án: 25 triệu/m²', { exact: true })).toBeVisible();
      await expect(dialog.getByText('Theo toà: 62 m²', { exact: true })).toBeVisible();
      await checkLayout(page);
      await dialog.getByRole('button', { name: 'Lưu căn', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(writes.find((write) => write.table === 'units')?.body).toMatchObject({
        price_per_m2_override: null,
        area_m2: null,
      });
      await unitRow(page, width, 'A-1202').getByRole('button', { name: 'Sửa', exact: true }).click();
      await expect(dialog.getByText('Theo dự án: 25 triệu/m²', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();

      await page.getByRole('button', { name: 'Thêm dự án', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Thêm dự án', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await page.getByRole('button', { name: /^Chọn dự án/ }).click();
      await dialog.getByRole('button', { name: `Sửa dự án ${PROJECT}`, exact: true }).click();
      await expect(dialog.getByLabel('Giá dự án', { exact: true })).toHaveValue('25');
      await checkLayout(page);
      await dialog.getByRole('button', { name: '+ Thêm loại', exact: true }).click();
      await dialog.getByLabel('Tên loại căn 2', { exact: true }).fill('3N');
      await dialog.getByLabel('Diện tích điển hình 2', { exact: true }).fill('80');
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(tables.project_apt_types).toContainEqual(expect.objectContaining({ apt_type: '3N', typical_area_m2: 80 }));
      await page.getByRole('button', { name: /^Chọn dự án/ }).click();
      await dialog.getByRole('button', { name: `Sửa dự án ${PROJECT}`, exact: true }).click();
      await expect(dialog.getByLabel('Tên loại căn 2', { exact: true })).toHaveValue('3N');
      await expect(dialog.getByLabel('Diện tích điển hình 2', { exact: true })).toHaveValue('80');
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();

      await page.getByRole('button', { name: /^Chọn toà:/ }).click();
      await dialog.getByRole('button', { name: 'Sửa toà A', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Sửa toà A', exact: true })).toBeVisible();
      await expect(dialog.getByLabel('Diện tích riêng 2N', { exact: true })).toHaveValue('62');
      await dialog.getByLabel('Diện tích riêng 2N', { exact: true }).fill('');
      await expect(dialog.getByText('Theo dự án: 60 m²', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Lưu toà', exact: true }).click();
      await expect(dialog).toBeHidden();
      await unitRow(page, width, 'A-1201').getByRole('button', { name: 'Sửa', exact: true }).click();
      await expect(dialog.getByText('Theo dự án: 60 m²', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();

      await page.getByRole('button', { name: 'Thêm căn', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Thêm căn', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await checkLayout(page);
      await page.getByRole('button', { name: 'Thêm dự án', exact: true }).click();
      await dialog.getByLabel('Tên dự án', { exact: true }).fill('Dự án mới đang chọn');
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('button', { name: 'Chọn toà: Tất cả toà', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Thêm căn', exact: true })).toBeDisabled();
    });
  }

  test(`GH-01 lỗi lưu giữ drawer và chữ đã nhập ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { failure, tables } = await install(page, 'light');
    await chooseProject(page);
    await page.getByRole('button', { name: 'Thêm toà', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mã toà', { exact: true }).fill('Toà đang nhập');
    failure.table = 'buildings';
    await dialog.getByRole('button', { name: 'Lưu toà', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('Mã toà', { exact: true })).toHaveValue('Toà đang nhập');
    expect(tables.buildings).toHaveLength(1);
    failure.table = '';
    await dialog.getByRole('button', { name: 'Lưu toà', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(tables.buildings).toHaveLength(2);
    expect(tables.units[0].note).toBe('Giữ ghi chú cũ');
  });
}

test('GH-01 chưa có dự án: chỉ mở form khi bấm Thêm dự án', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await install(page, 'dark', true);
  await expect(page.getByRole('button', { name: 'Chọn dự án: Chưa có dự án', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tên dự án', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Thêm dự án', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên dự án', { exact: true }).fill('Dự án mới');
  await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Chọn dự án: Dự án mới', exact: true })).toBeVisible();
  await checkLayout(page);
});
