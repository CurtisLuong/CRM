import { expect, type Page, test } from '@playwright/test';

// M5 — Danh sách khách v3 (DESIGN_SYSTEM v4 D-023 §4; bản mẫu docs/v3/mockups/danh-sach.html). Lead viết TRƯỚC khi giao worker.
const userId = 'm5c-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

const people = Array.from({ length: 12 }, (_, i) => ({
  id: `m5c-${i}`,
  owner_id: userId,
  full_name: `Khách Danh Sách ${String(i).padStart(2, '0')}`,
  phone: `09130000${String(i).padStart(2, '0')}`,
  care_stage: i % 2 ? 'Xem dự án' : 'Đang chăm sóc',
  qualified_at: iso(1, 9),
  created_at: iso(1, 9),
  registered_at: iso(1, 9),
  updated_at: iso(18 - (i % 5), 9),
  projects: ['NOXH Tràng Duệ'],
  call_attempts: [{ at: iso(18 - (i % 5), 10), result: 'talked' }],
  ...(i === 0 ? { next_call_at: iso(19, 7), next_call_end: iso(19, 8) } : {}),
}));
const leads = Array.from({ length: 3 }, (_, i) => ({
  id: `m5l-${i}`,
  owner_id: userId,
  full_name: `Khách Mới Đăng Ký ${i}`,
  phone: `09140000${i}0`,
  care_stage: 'Đăng kí mới',
  created_at: iso(19, 8),
  registered_at: iso(19, 8),
  updated_at: iso(19, 8),
}));

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
      email: 'm5c@example.test',
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
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        CallLog: {
          dial: async () => {
            const w = window as Window & { __dialCalls?: number };
            w.__dialCalls = (w.__dialCalls ?? 0) + 1;
            return {};
          },
        },
      },
    };
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, rows }) => {
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
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, rows: [...people, ...leads] },
  );
  await page.goto('/khach-hang');
  await expect(page.getByRole('textbox', { name: 'Tìm khách' })).toBeVisible();
}

const card = (page: Page, name: string) => page.locator('[data-card]').filter({ hasText: name });

test('Danh sách v3: ô tìm + chip nhóm/tệp; bộ lọc trong sheet; không còn khối nút đầu trang', async ({ page }) => {
  await open(page);
  const main = page.locator('main');
  await expect(main.getByText('KHÁCH HÀNG', { exact: true })).toHaveCount(0);
  await expect(main.getByRole('heading', { name: 'Danh sách khách' })).toHaveCount(0);
  for (const name of ['Tệp & Retarget', 'Đồng nghiệp', 'Xem thẻ'])
    await expect(main.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByLabel('Lọc trạng thái')).toHaveCount(0);
  const potential = main.getByRole('button', { name: /^Tiềm năng/ });
  await expect(potential).toHaveAttribute('aria-pressed', 'true');
  await expect(main.getByText('12 khách', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: /^Khách mới/ }).click();
  await expect(main.getByRole('button', { name: /^Khách mới/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'Khách Mới Đăng Ký 0')).toBeVisible();
  await main.getByRole('button', { name: /^Lọc/ }).click();
  const sheet = page.getByRole('dialog', { name: /Lọc/ });
  await expect(sheet.getByLabel('Lọc trạng thái')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Xem \d+ khách$/ })).toBeVisible();
});

test('Mỗi khách một thẻ gọn: hạn đứng đầu dòng phụ, đúng 1 nút Gọi đi luồng gọi chuẩn', async ({ page }) => {
  await open(page);
  const late = card(page, 'Khách Danh Sách 00');
  await expect(late).toHaveAttribute('data-tone', 'over');
  await expect(late.getByText(/^Quên gọi 07:00/)).toBeVisible();
  await expect(late).toContainText('NOXH Tràng Duệ');
  await expect(late.getByRole('button')).toHaveCount(2);
  await late.getByRole('button', { name: 'Gọi Khách Danh Sách 00' }).click();
  await page.waitForFunction(() => (window as Window & { __dialCalls?: number }).__dialCalls === 1);
  await expect(card(page, 'Khách Danh Sách 01')).toContainText(/ngày trước|Hôm qua|Hôm nay|tuần trước/);
});

test('Chạm tên khách mở thông tin khách', async ({ page }) => {
  await open(page);
  await card(page, 'Khách Danh Sách 03').getByRole('button', { name: 'Mở Khách Danh Sách 03' }).click();
  await expect(page).toHaveURL(/\/khach-hang\/m5c-3$|\/ho-so\/m5c-3$/);
});

test('Menu ⋯: Tệp & Retarget, Đồng nghiệp, Xuất, Khách đã lưu trữ', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Thêm thao tác' }).click();
  const menu = page.getByRole('dialog', { name: /Thêm/ });
  await expect(menu.getByRole('button', { name: 'Tệp & Retarget' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Đồng nghiệp' })).toBeVisible();
  await expect(menu.getByRole('button', { name: /^Xuất \d+ khách/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Khách đã lưu trữ', exact: true })).toBeVisible();
});

test('Màn đầu 360×780 thấy trọn ≥ 7 thẻ khách (D-023 L1)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-360', 'Đo ở 360×780');
  await open(page);
  const full = await page.locator('[data-card]').evaluateAll(
    (els) =>
      els.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight - 64;
      }).length,
  );
  expect(full).toBeGreaterThanOrEqual(7);
  const w = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.vw);
});
