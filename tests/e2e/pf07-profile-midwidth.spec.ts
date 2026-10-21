import { expect, type Page, test } from '@playwright/test';

// PF-07 — bố cục hồ sơ ở khổ giữa (1024–1199 một cột, ≥1200 hai cột) và thứ tự đọc trên điện thoại.
// Bổ sung cho pf07-profile-desktop.spec.ts (Lead viết): khổ 1024–1199 không nằm trong bộ đo của Lead.
const userId = 'pf07-mid-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

const customer = {
  id: 'pf07-mid-c1',
  owner_id: userId,
  full_name: 'Nguyễn Văn Đức',
  phone: '0912345678',
  care_stage: 'Đang chăm sóc',
  care_stage_updated_at: iso(10, 9),
  sla_anchor_at: iso(10, 9),
  interest_level: 20,
  source: 'facebook_ads',
  campaign: 'NOXH Hưng Yên T10',
  intake_method: 'ocr',
  contact_status: 'talked',
  registered_at: iso(4, 9),
  created_at: iso(4, 9),
  updated_at: iso(18, 15),
  call_attempts: [
    { at: iso(15, 10), result: 'no_answer', note: null, duration: 0 },
    { at: iso(18, 15), result: 'talked', note: 'Hỏi kĩ thông tin dự án', duration: 185 },
  ],
  notes_manual: [{ at: iso(17, 9), text: 'Hỏi thủ tục xác nhận nhà ở xã hội' }],
  care_stage_history: [{ at: iso(10, 9), stage: 'Đang chăm sóc', note: '' }],
  next_tasks: [],
};

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
      email: 'pf07-mid@example.test',
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
    async ({ uid, row }) => {
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
        tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, row: customer },
  );
  await page.goto('/ho-so/pf07-mid-c1');
  await expect(page.getByRole('heading', { level: 1, name: 'Nguyễn Văn Đức' })).toBeVisible();
}

const y = async (page: Page, name: string) =>
  (await page.getByRole('region', { name, exact: true }).boundingBox())?.y ?? Number.POSITIVE_INFINITY;

test('Khổ 1024–1279: một cột, không tràn ngang, 4 nút liền hàng, tab hiện đủ', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'Đo khổ giữa trên màn desktop');
  await open(page);
  for (const width of [1024, 1100, 1279]) {
    await page.setViewportSize({ width, height: 800 });
    const view = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
    expect(view.sw, `${width}px`).toBeLessThanOrEqual(view.vw);

    const bar = page.getByRole('navigation', { name: 'Hành động nhanh' });
    const tops: number[] = [];
    for (const name of ['Gọi', 'Zalo', 'Ghi chú', 'Hẹn']) {
      const b = await bar.getByRole('button', { name, exact: true }).boundingBox();
      tops.push(b?.y ?? -999);
    }
    expect(Math.max(...tops) - Math.min(...tops), `${width}px: ${tops.join(', ')}`).toBeLessThanOrEqual(2);

    const list = page.getByRole('tablist', { name: 'Nội dung hồ sơ khách' });
    const fit = await list.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fit.sw, `${width}px tab phải vừa`).toBeLessThanOrEqual(fit.cw + 1);

    // Một cột: "Đã biết" nằm dưới "Lần trước" và trên hàng tab.
    const known = await y(page, 'Đã biết');
    const last = await y(page, 'Lần trước');
    const tabs = (await list.boundingBox())?.y ?? 0;
    expect(known, `${width}px`).toBeGreaterThan(last);
    expect(known, `${width}px`).toBeLessThan(tabs);
  }
});

test('Khổ 1280: hai cột bật đúng ngưỡng, cột phụ nằm phải và không tràn ngang', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'Đo khổ giữa trên màn desktop');
  await open(page);
  const main = await page.getByRole('region', { name: 'Việc tiếp theo', exact: true }).boundingBox();
  const known = await page.getByRole('region', { name: 'Đã biết', exact: true }).boundingBox();
  if (!main || !known) throw new Error('Thiếu cột hồ sơ');
  expect(known.x).toBeGreaterThanOrEqual(main.x + main.width + 16);
  expect(main.width).toBeGreaterThanOrEqual(600);
  const view = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(view.sw).toBeLessThanOrEqual(view.vw);
});

test('Điện thoại: thứ tự đọc giữ nguyên (Đã biết trước tab, Thông tin thêm sau tab)', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('phone-'), 'Chỉ đo điện thoại');
  await open(page);
  const known = await y(page, 'Đã biết');
  const tabs = (await page.getByRole('tablist', { name: 'Nội dung hồ sơ khách' }).boundingBox())?.y ?? 0;
  const extra = await y(page, 'Thông tin thêm');
  expect(known).toBeLessThan(tabs);
  expect(tabs).toBeLessThan(extra);
});
