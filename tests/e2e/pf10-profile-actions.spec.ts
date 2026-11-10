import { expect, type Page, test } from '@playwright/test';

// PF-10 (Curtis 08/11, mockup B): thẻ đầu hồ sơ — hàng quyết định (Chuyển tiềm năng 2 ô · Loại · Giao) có icon và
// cùng lưới 4 cột với Gọi · Zalo · Ghi chú · Hẹn trên máy tính; bỏ dòng "còn …" lặp dưới thanh SLA.
const USER = 'pf10-user';
const DB = `crm_khach_hang__${encodeURIComponent(USER)}`;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const lead = (id: string, name: string, calls: { at: string; result: string }[]) => ({
  id,
  owner_id: USER,
  full_name: name,
  phone: `09033${id.slice(-5).padStart(5, '0')}`,
  care_stage: 'Mới',
  registered_at: ago(3),
  created_at: ago(3),
  updated_at: ago(3),
  call_attempts: calls.map((c) => ({ ...c, origin: 'manual' })),
  next_tasks: [],
  contact_prefs: {},
});

async function seed(page: Page, rows: Record<string, unknown>[]) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'curtis@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pf10-token',
        refresh_token: 'synthetic-pf10-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, USER);
  await page.goto('/');
  await page.evaluate(
    async ({ name, rows }) => {
      const request = indexedDB.open(name, 2);
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
    { name: DB, rows },
  );
}

test('PF-10: hàng quyết định có icon, thẳng lưới với Gọi/Zalo/Ghi chú/Hẹn; không còn dòng "còn …" lặp', async ({
  page,
}) => {
  await seed(page, [lead('pf10-a', 'Phạm Huy Văn', [{ at: ago(1), result: 'talked' }])]);
  await page.goto('/ho-so/pf10-a');
  await expect(page.getByRole('heading', { level: 1, name: 'Phạm Huy Văn' })).toBeVisible();
  const card = page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name: 'Phạm Huy Văn' }) });
  // Desktop (10/11): cụm nút ở cột phụ, ngoài thẻ đầu hồ sơ → tìm trên cả trang (nút ẩn không được tính).
  const promote = page.getByRole('button', { name: 'Chuyển tiềm năng', exact: true });
  const drop = page.getByRole('button', { name: 'Loại', exact: true });
  await expect(promote).toBeEnabled();
  for (const button of [promote, drop]) await expect(button.locator('svg')).toHaveCount(1);
  // Dòng "còn 2n …" dưới thanh SLA đã bỏ; con số chỉ còn ở đầu thanh.
  await expect(card.getByText(/^còn \d/)).toHaveCount(0);

  const width = page.viewportSize()?.width ?? 0;
  const p = await promote.boundingBox();
  const d = await drop.boundingBox();
  if (!p || !d) throw new Error('thiếu nút');
  if (width < 1280) {
    expect(Math.abs(p.y - d.y)).toBeLessThanOrEqual(1);
    // Ô Chuyển tiềm năng = 2 ô lưới (+ 1 khe 8px).
    expect(Math.abs(p.width - (2 * d.width + 8))).toBeLessThanOrEqual(2);
  }
  // Chữ đang hiện: 360/390px gọn "Tiềm năng", màn rộng đủ "Chuyển tiềm năng".
  await expect(promote.locator('span').filter({ visible: true })).toHaveText(
    width < 640 ? 'Tiềm năng' : 'Chuyển tiềm năng',
  );
  if (width >= 1280) {
    const bar = page.getByRole('navigation', { name: 'Hành động nhanh' });
    const boxes = await Promise.all(
      ['Gọi', 'Zalo', 'Ghi chú', 'Hẹn'].map((name) => bar.getByRole('button', { name, exact: true }).boundingBox()),
    );
    const [call, , note] = boxes;
    if (!call || !note) throw new Error('thiếu nút');
    // Lưới 2×2 ở cột phụ: 4 ô bằng nhau, cao 44px; hàng quyết định nằm dưới, cùng mép trái.
    for (const box of boxes) {
      expect(Math.abs((box?.width ?? 0) - call.width)).toBeLessThanOrEqual(1);
      expect(Math.round(box?.height ?? 0)).toBe(44);
    }
    expect(Math.abs(call.x - p.x)).toBeLessThanOrEqual(1);
    expect(p.y).toBeGreaterThan(note.y);
    expect(d.y).toBeGreaterThanOrEqual(p.y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
