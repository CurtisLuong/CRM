import { expect, type Page, test } from '@playwright/test';

const API = 'http://127.0.0.1:54321';
const USER = 'gh03-catalog-user';
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
          { id: 'p-archived', name: 'Dự án đã lưu trữ', archived_at: '2026-11-01T00:00:00Z' },
        ],
    buildings: empty
      ? []
      : [
          { id: 'b1', project_id: 'p1', code: 'A' },
          { id: 'b2', project_id: 'p1', code: 'A2' },
          { id: 'b3', project_id: 'p2', code: 'B' },
          { id: 'b4', project_id: 'p1', code: 'Toà đã lưu trữ', archived_at: '2026-11-01T00:00:00Z' },
          { id: 'b5', project_id: 'p-archived', code: 'Toà của dự án ẩn' },
        ],
    project_apt_types: empty
      ? []
      : [{ id: 'pt1', project_id: 'p1', apt_type: '2N', typical_area_m2: 60, custom_field: 'Giữ thuộc tính lạ' }],
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
            floor: 12,
          },
          { id: 'u3', project_id: 'p1', building_id: 'b2', code: 'A2-101', status: 'holding' },
          { id: 'u4', project_id: 'p2', building_id: 'b3', code: 'B-101', status: 'sold' },
          {
            id: 'u5',
            project_id: 'p1',
            building_id: 'b1',
            code: 'Căn đã lưu trữ',
            archived_at: '2026-11-01T00:00:00Z',
          },
          { id: 'u6', project_id: 'p1', building_id: 'b4', code: 'Căn của toà ẩn' },
        ],
  };
  const writes: { table: string; body: Row }[] = [];
  const failure = { table: '', typeName: '', reads: false, failReloadAfterWrite: false };
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
    if (failure.reads && table === failure.table && request.method() === 'GET')
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Lỗi đọc giả lập' }),
      });
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
    if (
      !failure.reads &&
      failure.table === table &&
      (!failure.typeName || request.postDataJSON()?.apt_type === failure.typeName)
    )
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
    if (failure.failReloadAfterWrite && table === 'project_apt_types') {
      failure.table = table;
      failure.reads = true;
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
        email: 'gh03@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('sk-theme', theme);
      localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-gh03-token',
          refresh_token: 'synthetic-gh03-refresh',
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

async function chooseProject(page: Page, name = PROJECT) {
  await page.getByRole('button', { name: /^Chọn dự án:/ }).click();
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function editProject(page: Page) {
  await page.getByRole('button', { name: /^Chọn dự án:/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: `Sửa dự án ${PROJECT}`, exact: true })
    .click();
}

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .getByRole('dialog')
      .evaluateAll((dialogs) => dialogs.every((dialog) => dialog.scrollWidth <= dialog.clientWidth)),
  ).toBe(true);
  expect(
    await page
      .locator('button:visible')
      .evaluateAll((buttons) =>
        buttons.filter((button) => button.getBoundingClientRect().height < 44).map((button) => button.textContent),
      ),
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`GH-03 ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      test.skip(page.viewportSize()?.width === 390, 'Kiểm theo yêu cầu 360px và 1280px.');
    });

    test('cha bao phủ con, nhóm toà, bộ lọc ẩn và bố cục', async ({ page }) => {
      const { writes } = await install(page, theme);
      const dialog = page.getByRole('dialog');
      const projects = page.getByRole('region', { name: 'Dự án', exact: true });
      const buildings = page.getByRole('region', { name: 'Toà', exact: true });
      const units = page.getByRole('region', { name: 'Căn', exact: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(projects.getByText('3 toà · 4 căn', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tìm căn và khách phù hợp' })).toBeHidden();
      await expect(page.getByRole('button', { name: 'Tìm căn', exact: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      await expect(page.getByText('Giá hiệu lực', { exact: false })).toBeHidden();
      await expect(page.getByText('Loại căn của dự án', { exact: true })).toBeHidden();
      await expect(units.getByText('2N', { exact: true })).toBeHidden();
      await expect(page.getByRole('table', { name: 'Danh sách toà' })).toBeHidden();
      await checkLayout(page);
      if ((page.viewportSize()?.width || 0) >= 1024) {
        const p = await projects.boundingBox();
        const b = await buildings.boundingBox();
        expect(p?.y).toBe(b?.y);
        expect(b?.x).toBeGreaterThan(p?.x || 0);
      }

      await chooseProject(page);
      await expect(projects.getByText('2 toà · 3 căn', { exact: true })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: '3 căn phù hợp' })).toBeVisible();
      await expect(units.getByText('B-101', { exact: false })).toBeHidden();
      await page.getByRole('button', { name: /^Chọn toà:/ }).click();
      await expect(dialog.getByRole('button', { name: 'Chọn toà A', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Chọn toà B', exact: true })).toBeHidden();
      await dialog.getByLabel('Tìm mã toà', { exact: true }).fill('A2');
      await expect(dialog.getByRole('button', { name: 'Chọn toà A', exact: true })).toBeHidden();
      await dialog.getByRole('button', { name: 'Chọn toà A2', exact: true }).click();
      await expect(buildings.getByText('1 căn', { exact: true })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: '1 căn phù hợp' })).toBeVisible();
      await chooseProject(page, 'Dự án Hưng Yên');
      await expect(page.getByRole('button', { name: 'Chọn toà: Tất cả toà', exact: true })).toBeVisible();
      await expect(units.getByText('B-101', { exact: false }).filter({ visible: true }).first()).toBeVisible();

      await chooseProject(page, 'Tất cả dự án');
      await page.getByRole('button', { name: /^Chọn toà:/ }).click();
      await expect(dialog.getByRole('heading', { name: PROJECT, exact: true })).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Dự án Hưng Yên', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Chọn toà A', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Chọn toà B', exact: true })).toBeVisible();
      await expect(dialog.getByText('Toà đã lưu trữ', { exact: true })).toBeHidden();
      await checkLayout(page);
      await dialog.getByRole('button', { name: 'Chọn toà B', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Chọn dự án: Dự án Hưng Yên', exact: true })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: '1 căn phù hợp' })).toBeVisible();
      await expect(units.getByText('A-1201', { exact: false })).toBeHidden();

      await page.getByRole('button', { name: 'Tìm căn', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Tìm căn và khách phù hợp' })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Dự án', exact: true })).toBeHidden();
      await page.getByRole('combobox', { name: 'Tình trạng', exact: true }).selectOption('sold');
      await expect(page.getByRole('button', { name: 'Tìm căn (1)', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const type = await page.getByLabel('Loại căn', { exact: true }).boundingBox();
      const direction = await page.getByRole('combobox', { name: 'Hướng', exact: true }).boundingBox();
      expect(type?.y).toBe(direction?.y);
      await checkLayout(page);
      await page.getByRole('button', { name: 'Thu gọn', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tìm căn (1)', exact: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      await page.getByRole('button', { name: 'Tìm căn (1)', exact: true }).click();
      await page.getByRole('button', { name: 'Xoá lọc', exact: true }).click();
      await expect(page.getByRole('combobox', { name: 'Tình trạng', exact: true })).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Tìm căn', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Chọn toà: B', exact: true })).toBeVisible();
      expect(writes).toEqual([]);
    });

    test('một Lưu dự án ghi giá, loại mới, diện tích cũ và giữ thuộc tính lạ', async ({ page }) => {
      const { tables, writes } = await install(page, theme);
      await editProject(page);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Loại căn của dự án' })).toBeVisible();
      expect(writes).toEqual([]);
      await dialog.getByLabel('Giá dự án', { exact: true }).fill('28,5');
      await dialog.getByLabel('Diện tích điển hình 1', { exact: true }).fill('66,5');
      await dialog.getByRole('button', { name: '+ Thêm loại', exact: true }).click();
      await dialog.getByLabel('Tên loại căn 2', { exact: true }).fill('3N');
      await dialog.getByLabel('Diện tích điển hình 2', { exact: true }).fill('85');
      expect(writes).toEqual([]);
      await checkLayout(page);
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(tables.projects.find((row) => row.id === 'p1')?.typical_price_per_m2).toBe(28_500_000);
      expect(tables.project_apt_types.find((row) => row.id === 'pt1')).toMatchObject({
        typical_area_m2: 66.5,
        custom_field: 'Giữ thuộc tính lạ',
      });
      expect(tables.project_apt_types.filter((row) => row.apt_type === '3N')).toEqual([
        expect.objectContaining({ project_id: 'p1', typical_area_m2: 85 }),
      ]);
      expect(writes.filter((row) => row.table === 'projects')).toHaveLength(1);
      await editProject(page);
      await expect(dialog.getByLabel('Giá dự án', { exact: true })).toHaveValue('28,5');
      await expect(dialog.getByLabel('Diện tích điển hình 1', { exact: true })).toHaveValue('66.5');
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await expect(page.getByText('Loại căn của dự án', { exact: true })).toBeHidden();
    });

    test('lỗi lưu giữa chừng giữ bản nháp, thử lại không thêm trùng', async ({ page }) => {
      const { tables, writes, failure } = await install(page, theme);
      const dialog = page.getByRole('dialog');
      await editProject(page);
      await dialog.getByLabel('Giá dự án', { exact: true }).fill('30');
      await dialog.getByRole('button', { name: '+ Thêm loại', exact: true }).click();
      await dialog.getByLabel('Tên loại căn 2', { exact: true }).fill('3N');
      await dialog.getByLabel('Diện tích điển hình 2', { exact: true }).fill('80');
      await dialog.getByRole('button', { name: '+ Thêm loại', exact: true }).click();
      await dialog.getByLabel('Tên loại căn 3', { exact: true }).fill('4N');
      await dialog.getByLabel('Diện tích điển hình 3', { exact: true }).fill('100');
      failure.table = 'project_apt_types';
      failure.typeName = '4N';
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Chưa lưu xong dự án');
      await expect(dialog.getByLabel('Giá dự án', { exact: true })).toHaveValue('30');
      await expect(dialog.getByLabel('Tên loại căn 3', { exact: true })).toHaveValue('4N');
      expect(tables.projects.find((row) => row.id === 'p1')?.typical_price_per_m2).toBe(30_000_000);
      expect(tables.project_apt_types.filter((row) => row.apt_type === '3N')).toHaveLength(1);
      failure.table = '';
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(tables.project_apt_types.filter((row) => row.apt_type === '3N')).toHaveLength(1);
      expect(tables.project_apt_types.filter((row) => row.apt_type === '4N')).toHaveLength(1);
      expect(writes.filter((row) => row.table === 'project_apt_types' && row.body.apt_type === '3N')).toHaveLength(1);
    });

    test('ghi loại mới xong nhưng đọc lại lỗi vẫn giữ tấm và thử lại không trùng', async ({ page }) => {
      const { tables, failure } = await install(page, theme);
      await editProject(page);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: '+ Thêm loại', exact: true }).click();
      await dialog.getByLabel('Tên loại căn 2', { exact: true }).fill('3N');
      await dialog.getByLabel('Diện tích điển hình 2', { exact: true }).fill('82');
      failure.failReloadAfterWrite = true;
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('chưa tải lại');
      await expect(dialog.getByLabel('Diện tích điển hình 2', { exact: true })).toHaveValue('82');
      expect(tables.project_apt_types.filter((row) => row.apt_type === '3N')).toHaveLength(1);
      failure.table = '';
      failure.reads = false;
      failure.failReloadAfterWrite = false;
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(tables.project_apt_types.filter((row) => row.apt_type === '3N')).toHaveLength(1);
    });

    test('Sửa toà gộp loại căn, thêm căn chọn toà bắt buộc theo dự án', async ({ page }) => {
      const { tables, writes } = await install(page, theme);
      const dialog = page.getByRole('dialog');
      await chooseProject(page);
      await page.getByRole('button', { name: /^Chọn toà:/ }).click();
      await dialog.getByRole('button', { name: 'Sửa toà A', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Loại căn được dùng ở toà' })).toBeVisible();
      await expect(dialog.getByLabel('Diện tích riêng 2N', { exact: true })).toHaveValue('62');
      expect(writes).toEqual([]);
      await dialog.getByLabel('Giá duyệt toà', { exact: true }).fill('27');
      await dialog.getByLabel('Diện tích riêng 2N', { exact: true }).fill('64');
      await checkLayout(page);
      await dialog.getByRole('button', { name: 'Lưu toà', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(tables.buildings.find((row) => row.id === 'b1')?.approved_price_per_m2).toBe(27_000_000);
      expect(tables.building_apt_types.find((row) => row.id === 'bt1')?.area_m2).toBe(64);
      await page.getByRole('button', { name: 'Sửa', exact: true }).filter({ visible: true }).first().click();
      await expect(
        dialog.getByText('Giá dự kiến: 1.848.960.000 ₫ gồm VAT + KPBT + phí', { exact: true }),
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await expect(page.getByText('Giá dự kiến:', { exact: false })).toBeHidden();
      await page.getByRole('button', { name: 'Thêm căn', exact: true }).click();
      await expect(dialog.getByLabel('Toà của căn', { exact: true })).toBeHidden();
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await page.getByRole('button', { name: /^Chọn toà:/ }).click();
      await dialog.getByRole('button', { name: 'Tất cả toà', exact: true }).click();
      await page.getByRole('button', { name: 'Thêm căn', exact: true }).click();
      const choice = dialog.getByLabel('Toà của căn', { exact: true });
      await expect(choice).toHaveAttribute('required', '');
      expect(await choice.locator('option').allTextContents()).toEqual(['Chọn toà', 'A', 'A2']);
      await dialog.getByLabel('Mã căn', { exact: true }).fill('A2-102');
      const before = writes.length;
      await dialog.getByRole('button', { name: 'Lưu căn', exact: true }).click();
      await expect(dialog).toBeVisible();
      expect(writes).toHaveLength(before);
      await choice.selectOption('b2');
      await dialog.getByRole('button', { name: 'Lưu căn', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(tables.units).toContainEqual(
        expect.objectContaining({ project_id: 'p1', building_id: 'b2', code: 'A2-102' }),
      );
      expect(tables.units.find((row) => row.id === 'u1')?.note).toBe('Giữ ghi chú cũ');
    });

    test('thêm dự án cùng form, huỷ bản nháp và lưu trữ mềm', async ({ page }) => {
      const { tables, writes } = await install(page, theme);
      const dialog = page.getByRole('dialog');
      await page.getByRole('button', { name: 'Thêm dự án', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Thêm dự án', exact: true })).toBeVisible();
      await dialog.getByLabel('Tên dự án', { exact: true }).fill('Dự án mới');
      await dialog.getByRole('button', { name: '+ Thêm loại', exact: true }).click();
      await dialog.getByLabel('Tên loại căn 1', { exact: true }).fill('1N');
      await dialog.getByLabel('Diện tích điển hình 1', { exact: true }).fill('45');
      await dialog.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
      await expect(dialog).toBeHidden();
      const added = tables.projects.find((row) => row.name === 'Dự án mới');
      expect(tables.project_apt_types).toContainEqual(
        expect.objectContaining({ project_id: added?.id, apt_type: '1N', typical_area_m2: 45 }),
      );
      await editProject(page);
      await dialog.getByLabel('Giá dự án', { exact: true }).fill('99');
      page.once('dialog', (confirm) => confirm.accept());
      await dialog.getByRole('button', { name: 'Lưu trữ', exact: true }).click();
      const before = writes.length;
      await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
      expect(writes).toHaveLength(before);
      expect(tables.project_apt_types.find((row) => row.id === 'pt1')?.archived_at).toBeUndefined();
      await chooseProject(page);
      await page.getByRole('button', { name: /^Chọn toà:/ }).click();
      page.once('dialog', (confirm) => confirm.accept());
      await dialog.getByRole('button', { name: 'Lưu trữ toà A', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Chọn toà A', exact: true })).toBeHidden();
      expect(tables.buildings.find((row) => row.id === 'b1')?.archived_at).toBeTruthy();
      expect(tables.units.find((row) => row.id === 'u1')).toBeDefined();
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(
        page.getByRole('region', { name: 'Dự án', exact: true }).getByText('1 toà · 1 căn', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: /^Chọn dự án:/ }).click();
      page.once('dialog', (confirm) => confirm.accept());
      await dialog.getByRole('button', { name: 'Lưu trữ dự án Dự án Hưng Yên', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Dự án Hưng Yên', exact: true })).toBeHidden();
      expect(tables.projects.find((row) => row.id === 'p2')?.archived_at).toBeTruthy();
      expect(tables.buildings.find((row) => row.id === 'b3')).toBeDefined();
    });
  });
}
