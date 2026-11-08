import { expect, type Page, test } from '@playwright/test';

const UID = 'pr04-user';
const CID = 'pr04-customer';
const NOW = new Date('2026-11-08T02:00:00Z');
type Row = Record<string, unknown>;

async function openProfile(page: Page, theme: 'light' | 'dark', patch: Row = {}) {
  await page.clock.install({ time: NOW });
  await page.emulateMedia({ colorScheme: theme });
  const tables: Record<string, Row[]> = {
    projects: [
      { id: 'p1', name: 'Dự án A', typical_price_per_m2: 20_000_000 },
      { id: 'p2', name: 'Dự án B' },
    ],
    buildings: [
      { id: 'a1', project_id: 'p1', code: 'A1' },
      { id: 'a2', project_id: 'p1', code: 'A2' },
      { id: 'b1', project_id: 'p2', code: 'B1' },
    ],
    units: [
      {
        id: 'u1',
        project_id: 'p1',
        building_id: 'a1',
        code: '101',
        direction: 'đông nam',
        floor: 12,
        apt_type: '2N',
        area_m2: 60,
      },
      { id: 'u2', project_id: 'p1', building_id: 'a2', code: '201', direction: 'ĐN view hồ', floor: 2, area_m2: 45 },
    ],
    project_apt_types: [{ id: 't1', project_id: 'p1', apt_type: '2N', typical_area_m2: 60 }],
    building_apt_types: [],
  };
  const writes: Array<{ table: string; method: string; payload: Row }> = [];
  let denied = false;
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1) ?? '';
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 200, body: '' });
      return;
    }
    if (tables[table]) {
      if (method === 'GET' || method === 'HEAD') {
        const rows = tables[table];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Access-Control-Expose-Headers': 'Content-Range',
            'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
          },
          body: JSON.stringify(rows),
        });
        return;
      }
      const payload = request.postDataJSON() as Row;
      writes.push({ table, method, payload });
      if (denied && (table === 'buildings' || table === 'units')) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'Không có quyền sửa Giỏ hàng.' }),
        });
        return;
      }
      let row: Row;
      if (method === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        row = tables[table].find((item) => item.id === id) ?? {};
        Object.assign(row, payload);
      } else {
        row = { id: `${table}-${tables[table].length + 1}`, ...payload };
        tables[table].push(row);
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pr04@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pr04-token',
        refresh_token: 'synthetic-pr04-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, UID);
  await page.goto('/');
  const customer = {
    id: CID,
    owner_id: UID,
    full_name: 'Lan PR04',
    phone: '0900000000',
    projects: ['Dự án cũ', 'Dự án A', 'Dự án B'],
    building_code: 'A1',
    apt_code: 'mã cũ',
    apt_direction: 'đông nam',
    care_stage: 'Đang chăm sóc',
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    care_stage_updated_at: NOW.toISOString(),
    call_attempts: [],
    next_tasks: [],
    notes_manual: [],
    x_keep: { untouched: true },
    ...patch,
  };
  await page.evaluate(
    async ({ uid, row }) => {
      const request = indexedDB.open(`crm_khach_hang__${uid}`, 2);
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
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: row.updated_at });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: UID, row: customer },
  );
  await page.goto(`/ho-so/${CID}`);
  await expect(page.getByRole('heading', { name: 'Lan PR04', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return {
    customer,
    writes,
    deny: () => {
      denied = true;
    },
  };
}

async function readCustomer(page: Page): Promise<Row> {
  return page.evaluate(
    async ({ uid, id }) => {
      const request = indexedDB.open(`crm_khach_hang__${uid}`, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<Row>((resolve, reject) => {
          const get = db.transaction('customers', 'readonly').objectStore('customers').get(id);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        });
      } finally {
        db.close();
      }
    },
    { uid: UID, id: CID },
  );
}

async function navigate(page: Page, path: string) {
  await page.evaluate((next) => {
    history.pushState({}, '', next);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(
    page.getByRole('heading', { name: path === '/gio-hang' ? 'Giỏ hàng' : 'Lan PR04', exact: true }),
  ).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

for (const theme of ['light', 'dark'] as const) {
  test(`PR-04 ${theme}: mã cũ, lọc theo toà/dự án, chọn căn điền ô trống và đổi toà một lần`, async ({ page }) => {
    const { customer } = await openProfile(page, theme);
    await expect(page.getByLabel('Hướng', { exact: true })).toHaveValue('Đông Nam');
    expect(await readCustomer(page)).toEqual(customer);
    await page.getByLabel('Mã toà', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'A2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'B1', exact: true })).toHaveCount(0);
    const search = page.getByLabel('Tìm hoặc nhập mã toà');
    await search.fill('a2');
    await expect(page.getByRole('button', { name: 'A1', exact: true })).toHaveCount(0);
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await page.getByLabel('Mã căn', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'mã cũ', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '201', exact: true })).toHaveCount(0);
    // Popover còn đang phóng to khi mở → đo lại tới khi ổn định; 43,96px (làm tròn) vẫn là ô 44px.
    for (const button of await page.getByRole('dialog').getByRole('button').all()) {
      await expect.poll(async () => (await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }
    await page.getByRole('button', { name: '101', exact: true }).click();
    await expect.poll(async () => (await readCustomer(page)).apt_code).toBe('101');
    const row = await readCustomer(page);
    expect(row.apt_direction).toBe('đông nam');
    expect(row.apt_floor).toBe(12);
    expect(row.apt_type).toBe('2N');
    expect(row).not.toHaveProperty('apt_area');
    expect(row.x_keep).toEqual({ untouched: true });
    const more = page.getByRole('button', { name: /^Mở rộng \(/ });
    if (await more.count()) await more.click();
    await expect(page.getByLabel('Diện tích (m²)', { exact: true })).toHaveAttribute('placeholder', '60');
    await page.getByLabel('Mã toà', { exact: true }).click();
    await page.getByRole('button', { name: 'A2', exact: true }).click();
    await expect.poll(async () => (await readCustomer(page)).apt_code).toBeNull();
    await expect(page.getByLabel('Mã căn', { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.getByLabel('Hướng', { exact: true }).selectOption('');
    await expect.poll(async () => (await readCustomer(page)).apt_direction).toBeNull();
  });

  test(`PR-04 ${theme}: thêm từ hồ sơ hiện trong Giỏ hàng, sửa căn ở Giỏ hàng cập nhật danh sách hồ sơ`, async ({
    page,
  }) => {
    const { writes } = await openProfile(page, theme, {
      apt_code: null,
      apt_direction: 'Đông',
      apt_floor: 8,
      apt_type: '2N',
      apt_area: 60,
    });
    const origin = await page.evaluate(() => performance.timeOrigin);
    await page.getByLabel('Mã toà', { exact: true }).click();
    // Lead 08/11: nút thêm mang tên theo loại ("Thêm toà"/"Thêm căn") và luôn hiện.
    await page.getByLabel('Tìm hoặc nhập mã toà').fill('A9');
    await page.getByRole('button', { name: 'Thêm toà', exact: true }).click();
    await expect.poll(async () => (await readCustomer(page)).building_code).toBe('A9');
    const more = page.getByRole('button', { name: /^Mở rộng \(/ });
    if (await more.count()) await more.click();
    await page.getByLabel('Mã căn', { exact: true }).click();
    await expect(page.getByText('Chưa có', { exact: true })).toBeVisible();
    await page.getByLabel('Tìm hoặc nhập mã căn').fill('801');
    await page.getByRole('button', { name: 'Thêm căn', exact: true }).click();
    await expect.poll(async () => (await readCustomer(page)).apt_code).toBe('801');
    expect(writes.find((write) => write.table === 'units')?.payload).toMatchObject({
      code: '801',
      direction: 'Đông',
      floor: 8,
      apt_type: '2N',
      area_m2: 60,
    });
    await navigate(page, '/gio-hang');
    await page.getByRole('textbox', { name: /Tìm căn/ }).fill('801');
    await expect(page.getByRole('status').filter({ hasText: '1 căn phù hợp' })).toBeVisible();
    await page.getByRole('button', { name: 'Sửa', exact: true }).filter({ visible: true }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByLabel('Hướng', { exact: true })).toHaveValue('Đông');
    await drawer.getByLabel('Mã căn', { exact: true }).fill('802');
    await drawer.getByLabel('Hướng', { exact: true }).selectOption('Tây Nam');
    await drawer.getByRole('button', { name: 'Lưu căn' }).click();
    await expect(drawer).toHaveCount(0);
    await navigate(page, `/ho-so/${CID}`);
    await page.getByLabel('Mã căn', { exact: true }).click();
    await expect(page.getByRole('button', { name: '802', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '801', exact: true })).toBeVisible();
    expect((await readCustomer(page)).apt_code).toBe('801');
    await noOverflow(page);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  });
}

test('PR-04: mất mạng/lỗi quyền không tạo Giỏ hàng nhưng lưu mã vào khách', async ({ page, context }) => {
  const { writes, deny } = await openProfile(page, 'light', { apt_direction: 'ĐN view hồ' });
  const initialWrites = writes.length;
  await context.setOffline(true);
  await page.getByLabel('Mã căn', { exact: true }).click();
  await page.getByLabel('Tìm hoặc nhập mã căn').fill('offline');
  await page.getByRole('button', { name: 'Thêm căn', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Cần có mạng để sửa giỏ hàng.' })).toBeVisible();
  await expect.poll(async () => (await readCustomer(page)).apt_code).toBe('offline');
  expect(writes.length).toBe(initialWrites);
  expect((await readCustomer(page)).apt_direction).toBe('ĐN view hồ');
  await page.getByLabel('Mã căn', { exact: true }).click();
  await expect(page.getByLabel('Tìm hoặc nhập mã căn')).toHaveCount(0);
  await context.setOffline(false);
  deny();
  await page.getByLabel('Mã căn', { exact: true }).click();
  await page.getByLabel('Tìm hoặc nhập mã căn').fill('denied');
  await page.getByRole('button', { name: 'Thêm căn', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Không có quyền sửa Giỏ hàng.' })).toBeVisible();
  await expect.poll(async () => (await readCustomer(page)).apt_code).toBe('denied');
  await noOverflow(page);
});

test('PR-04: Giỏ hàng lọc hướng cũ và giữ hướng lạ khi sửa ô khác', async ({ page }) => {
  const { writes } = await openProfile(page, 'light');
  await navigate(page, '/gio-hang');
  const filter = page.getByRole('combobox', { name: 'Hướng', exact: true });
  await expect(filter.locator('option')).toHaveText([
    'Tất cả',
    'Đông',
    'Tây',
    'Nam',
    'Bắc',
    'Đông Bắc',
    'Đông Nam',
    'Tây Bắc',
    'Tây Nam',
    'ĐN view hồ',
  ]);
  await filter.selectOption('Đông Nam');
  await expect(page.getByRole('status').filter({ hasText: '1 căn phù hợp' })).toBeVisible();
  await filter.selectOption('ĐN view hồ');
  await expect(page.getByRole('status').filter({ hasText: '1 căn phù hợp' })).toBeVisible();
  await page.getByRole('button', { name: 'Sửa', exact: true }).filter({ visible: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByLabel('Hướng', { exact: true })).toHaveValue('ĐN view hồ');
  await drawer.getByLabel('Mã căn', { exact: true }).fill('202');
  await drawer.getByRole('button', { name: 'Lưu căn' }).click();
  await expect(drawer).toHaveCount(0);
  expect(writes.find((write) => write.table === 'units' && write.method === 'PATCH')?.payload.direction).toBe(
    'ĐN view hồ',
  );
});
