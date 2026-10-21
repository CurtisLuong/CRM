import { expect, type Page, test } from '@playwright/test';

// PF-06: chuông Thông báo có số ở header + ô tìm toàn app (tìm khách theo nhóm).
// Test Lead viết cùng task; dữ liệu giả trong IndexedDB, không gọi mạng.

const userId = 'pf06-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const iso = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString();

const base = { owner_id: userId, created_at: iso(2), registered_at: iso(2), updated_at: iso(2) };

// Số chuẩn luật 8 + 7 khách tiềm năng để thử "Xem thêm".
const rows = [
  {
    ...base,
    id: 'pf06-tran',
    full_name: 'Trần Dũng',
    phone: '0915000001',
    care_stage: 'Đang chăm sóc',
    qualified_at: iso(2),
    updated_at: iso(18),
    interest_level: 80,
    call_attempts: [{ at: iso(18, 8), result: 'talked' }],
  },
  {
    ...base,
    id: 'pf06-le',
    full_name: 'Lê Dũng',
    phone: '0915000002',
    care_stage: 'Đăng kí mới',
    registered_at: iso(17),
    created_at: iso(17),
  },
  {
    ...base,
    id: 'pf06-pham',
    full_name: 'Phạm Dũng',
    phone: '0915000003',
    care_stage: 'Nuôi dài hạn',
    qualified_at: iso(3),
    updated_at: iso(10),
  },
  {
    ...base,
    id: 'pf06-vo',
    full_name: 'Võ Dũng',
    phone: '0915000004',
    care_stage: 'Đang chăm sóc',
    qualified_at: iso(4),
    archived_at: iso(15),
    updated_at: iso(15),
  },
  {
    ...base,
    id: 'pf06-ha',
    full_name: 'Hà Dũng',
    phone: '0915000005',
    care_stage: 'Đăng kí mới',
    disqualified_at: iso(12),
    updated_at: iso(12),
  },
  ...Array.from({ length: 7 }, (_, i) => ({
    ...base,
    id: `pf06-tiem-${i + 1}`,
    full_name: `Nguyễn Tiềm ${i + 1}`,
    phone: `091700000${i}`,
    care_stage: 'Đang chăm sóc',
    qualified_at: iso(2),
    updated_at: iso(1 + i),
  })),
];

async function open(page: Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pf06@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
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
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, data }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
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
        for (const row of data) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, data: rows },
  );
  await page.goto('/');
  await expect(page.locator('header h1')).toHaveText('Hôm nay');
}

const header = (page: Page) => page.locator('header');
const bell = (page: Page) => header(page).getByRole('button', { name: /^Thông báo/ });
const palette = (page: Page) => page.getByRole('dialog');
const combobox = (page: Page) => page.getByRole('combobox', { name: 'Tìm khách, lệnh, màn' });

test('360: cụm phải header đúng thứ tự Tìm · Thông báo · Đồng bộ · Menu, vùng chạm ≥44px', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-360', 'đo thứ tự ở 360×780');
  await open(page);

  const search = header(page).getByRole('button', { name: /Tìm khách, lệnh/ });
  const menu = header(page).getByRole('button', { name: 'Menu', exact: true });
  const sync = header(page).getByRole('button', { name: /Đồng bộ|Chờ \d+ thay đổi|Ngoại tuyến|Lỗi đồng bộ/ });
  await expect(search).toBeVisible();
  await expect(bell(page)).toBeVisible();
  await expect(menu).toBeVisible();

  const controls = (await sync.count()) ? [search, bell(page), sync.first(), menu] : [search, bell(page), menu];
  for (const name of ['Tìm khách, lệnh', 'Thông báo', 'Menu']) {
    const control = header(page)
      .getByRole('button', { name: new RegExp(name) })
      .first();
    const box = await control.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const xs: number[] = [];
  for (const control of controls) {
    const box = await control.first().boundingBox();
    expect(box).not.toBeNull();
    xs.push(box?.x ?? Number.NaN);
  }
  expect(xs).toEqual([...xs].sort((a, b) => a - b));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('chuông: số đỏ đúng bằng số thẻ màn Thông báo; bấm → /thong-bao', async ({ page }) => {
  await open(page);
  const counter = header(page).locator('[data-bell-count]');
  await expect(counter).toBeVisible();
  const shown = Number(await counter.textContent());
  expect(shown).toBeGreaterThan(0);
  await expect(bell(page)).toHaveAttribute('aria-label', `Thông báo, ${shown} mục`);

  await bell(page).click();
  await expect(page).toHaveURL('/thong-bao');
  const cards = page.locator('#main').getByRole('button', { name: 'Mở hồ sơ' });
  await expect(cards).toHaveCount(shown);
});

test('tìm toàn app: gõ "dũng" → 4 nhóm đúng thứ tự luật 8; chọn khách mở hồ sơ', async ({ page }) => {
  await open(page);
  await header(page)
    .getByRole('button', { name: /Tìm khách, lệnh/ })
    .click();
  await expect(combobox(page)).toBeFocused();
  await combobox(page).fill('dũng');

  const group = (name: string) => palette(page).getByRole('group', { name });
  await expect(group('Khách tiềm năng')).toContainText('Trần Dũng');
  await expect(group('Khách mới')).toContainText('Lê Dũng');
  await expect(group('Nuôi dài hạn & đã mua')).toContainText('Phạm Dũng');
  await expect(group('Đã lưu trữ / Đã loại')).toContainText('Võ Dũng');
  await expect(group('Đã lưu trữ / Đã loại')).toContainText('Hà Dũng');
  await expect(palette(page).getByRole('group')).toHaveCount(4);

  const labels = await palette(page)
    .getByRole('group')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
  expect(labels).toEqual(['Khách tiềm năng', 'Khách mới', 'Nuôi dài hạn & đã mua', 'Đã lưu trữ / Đã loại']);

  // Dòng phụ: bậc · SĐT; khách đã lưu trữ/đã loại ghi rõ.
  await expect(group('Đã lưu trữ / Đã loại').getByRole('option', { name: /Võ Dũng/ })).toContainText('Đã lưu trữ');
  await expect(group('Đã lưu trữ / Đã loại').getByRole('option', { name: /Hà Dũng/ })).toContainText('Đã loại');

  await group('Khách tiềm năng')
    .getByRole('option', { name: /Trần Dũng/ })
    .click();
  await expect(page).toHaveURL('/ho-so/pf06-tran');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('nhóm > 5 khách: "Xem thêm N khách" mở rộng ngay trong Bảng lệnh', async ({ page }) => {
  await open(page);
  await header(page)
    .getByRole('button', { name: /Tìm khách, lệnh/ })
    .click();
  await combobox(page).fill('tiem');

  const group = palette(page).getByRole('group', { name: 'Khách tiềm năng' });
  await expect(group.getByRole('option')).toHaveCount(6); // 5 khách + dòng Xem thêm
  const more = group.getByRole('option', { name: 'Xem thêm 2 khách' });
  await expect(more).toBeVisible();

  await more.click();
  await expect(group.getByRole('option')).toHaveCount(7);
  await expect(more).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test.describe('giao diện tối', () => {
  test.use({ colorScheme: 'dark' });

  test('Bảng lệnh mở rộng nhóm không cuộn ngang; chuông vẫn đọc được', async ({ page }) => {
    await open(page);
    await expect(bell(page)).toBeVisible();
    await header(page)
      .getByRole('button', { name: /Tìm khách, lệnh/ })
      .click();
    await combobox(page).fill('tiem');
    await expect(palette(page).getByRole('option', { name: 'Xem thêm 2 khách' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
