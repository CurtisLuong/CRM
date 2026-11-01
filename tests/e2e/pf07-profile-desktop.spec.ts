import { expect, type Page, test } from '@playwright/test';

// PF-07 — Hồ sơ khách trên desktop màn lớn: 2 cột có chủ đích (cột chính + cột phụ dính), không lưới hàng.
// Lead viết TRƯỚC khi giao worker. Ảnh điện thoại 360/390 chụp từ bản cũ → bố cục điện thoại phải giữ nguyên.
const userId = 'pf07-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

// Ca xấu nhất trong ảnh Curtis gửi: chưa có việc tiếp theo (thẻ trái ngắn), nhiều "Còn thiếu", "Thông tin thêm" dài.
const customer = {
  id: 'pf07-c1',
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
  contact_status: 'Phản hồi tốt',
  registered_at: iso(4, 9),
  created_at: iso(4, 9),
  updated_at: iso(18, 15),
  notes: 'Đăng ký qua form, hỏi căn 2PN',
  call_attempts: [
    { at: iso(11, 10), result: 'no_answer', note: null, duration: 0 },
    { at: iso(12, 10), result: 'busy', note: null, duration: 0 },
    { at: iso(13, 16), result: 'talked', note: 'Hỏi kĩ thông tin dự án', duration: 240 },
    { at: iso(15, 10), result: 'no_answer', note: null, duration: 0 },
    { at: iso(16, 11), result: 'talked', note: 'Muốn xem nhà mẫu cuối tuần', duration: 120 },
    { at: iso(18, 15), result: 'talked', note: 'Hỏi kĩ thông tin dự án', duration: 185 },
  ],
  notes_manual: [
    { at: iso(12, 9), text: 'Làm KCN Phố Nối, thu nhập hai vợ chồng khoảng 25 triệu' },
    { at: iso(14, 9), text: 'Đang thuê trọ, cần nhà trước Tết' },
    { at: iso(17, 9), text: 'Hỏi thủ tục xác nhận nhà ở xã hội' },
  ],
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
      email: 'pf07@example.test',
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
  await page.goto('/ho-so/pf07-c1');
  await expect(page.getByRole('heading', { level: 1, name: 'Nguyễn Văn Đức' })).toBeVisible();
}

type Box = { x: number; y: number; width: number; height: number };
async function box(page: Page, name: string): Promise<Box> {
  const b = await page.getByRole('region', { name, exact: true }).boundingBox();
  if (!b) throw new Error(`Không thấy vùng ${name}`);
  return b;
}
const bottom = (b: Box) => b.y + b.height;
const right = (b: Box) => b.x + b.width;
const profileHeader = (page: Page) => page.getByTestId('customer-profile').locator('header').first();
const tablist = (page: Page) => page.getByRole('tablist', { name: 'Nội dung hồ sơ khách' });

const DESKTOP = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const desktopOnly = (name: string) => test.skip(name !== 'desktop-1280', 'Bố cục desktop');

test('Không cuộn ngang (mọi khổ, cả 1440 và 1920)', async ({ page }, info) => {
  await open(page);
  const sizes = info.project.name === 'desktop-1280' ? DESKTOP : [null];
  for (const size of sizes) {
    if (size) await page.setViewportSize(size);
    const w = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
    expect(w.sw, `${w.vw}px`).toBeLessThanOrEqual(w.vw);
  }
});

test('Desktop: 4 nút Gọi · Zalo · Ghi chú · Hẹn cùng một hàng', async ({ page }, info) => {
  desktopOnly(info.project.name);
  await open(page);
  const bar = page.getByRole('navigation', { name: 'Hành động nhanh' });
  for (const size of DESKTOP) {
    await page.setViewportSize(size);
    const tops: number[] = [];
    for (const name of ['Gọi', 'Zalo', 'Ghi chú', 'Hẹn']) {
      const b = await bar.getByRole('button', { name, exact: true }).boundingBox();
      tops.push(b?.y ?? -999);
    }
    expect(Math.max(...tops) - Math.min(...tops), `${size.width}px: ${tops.join(', ')}`).toBeLessThanOrEqual(2);
  }
});

test('Desktop: cột chính xếp liền mạch đầu hồ sơ → Việc tiếp theo → Lần trước → tab', async ({ page }, info) => {
  desktopOnly(info.project.name);
  await open(page);
  for (const size of DESKTOP) {
    await page.setViewportSize(size);
    const head = await profileHeader(page).boundingBox();
    const tabs = await tablist(page).boundingBox();
    if (!head || !tabs) throw new Error('Thiếu đầu hồ sơ hoặc hàng tab');
    const column = [head, await box(page, 'Việc tiếp theo'), await box(page, 'Lần trước'), tabs];
    for (let i = 1; i < column.length; i += 1) {
      const gap = column[i].y - bottom(column[i - 1]);
      // Không có khoảng trắng lớn do thẻ bên cạnh cao hơn (lưới hàng cũ để lại hàng trăm px).
      expect(gap, `${size.width}px khối ${i}`).toBeGreaterThanOrEqual(0);
      expect(gap, `${size.width}px khối ${i}`).toBeLessThanOrEqual(32);
      expect(Math.abs(column[i].x - head.x), `${size.width}px khối ${i} lệch mép trái`).toBeLessThanOrEqual(2);
    }
  }
});

test('Desktop: cột phụ (Đã biết · Thông tin thêm · Brief AI) nằm bên phải, xếp liền', async ({ page }, info) => {
  desktopOnly(info.project.name);
  await open(page);
  for (const size of DESKTOP) {
    await page.setViewportSize(size);
    const main = await box(page, 'Việc tiếp theo');
    const side = [await box(page, 'Đã biết'), await box(page, 'Thông tin thêm')];
    // Brief AI chỉ hiện khi có máy chủ AI + mạng (e2e thường không có) → có thì cũng phải nằm liền trong cột phụ.
    if (await page.getByRole('region', { name: 'Brief AI', exact: true }).count())
      side.push(await box(page, 'Brief AI'));
    expect(side[0].x, `${size.width}px`).toBeGreaterThanOrEqual(right(main) + 16);
    // Cột phụ hẹp hơn cột chính; cột chính đủ rộng cho 4 nút liên hệ.
    expect(side[0].width, `${size.width}px`).toBeLessThan(main.width);
    expect(main.width, `${size.width}px`).toBeGreaterThanOrEqual(600);
    for (let i = 1; i < side.length; i += 1) {
      const gap = side[i].y - bottom(side[i - 1]);
      expect(gap, `${size.width}px thẻ phụ ${i}`).toBeGreaterThanOrEqual(0);
      expect(gap, `${size.width}px thẻ phụ ${i}`).toBeLessThanOrEqual(32);
      expect(Math.abs(side[i].x - side[0].x), `${size.width}px thẻ phụ ${i}`).toBeLessThanOrEqual(2);
    }
  }
});

test('Desktop 1920: nội dung dùng đủ bề ngang, không bị dồn hẹp giữa trang', async ({ page }, info) => {
  desktopOnly(info.project.name);
  await open(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const head = await profileHeader(page).boundingBox();
  const side = await box(page, 'Đã biết');
  if (!head) throw new Error('Thiếu đầu hồ sơ');
  expect(right(side) - head.x).toBeGreaterThanOrEqual(1100);
  // Không còn mép trái trống ~400px như bản cũ (rail 76px + lề).
  expect(head.x).toBeLessThanOrEqual(400);
});

test('Desktop: hàng tab hiện đủ, không cắt chữ, rộng bằng cột chính', async ({ page }, info) => {
  desktopOnly(info.project.name);
  await open(page);
  for (const size of DESKTOP) {
    await page.setViewportSize(size);
    const list = tablist(page);
    const lb = await list.boundingBox();
    const head = await profileHeader(page).boundingBox();
    if (!lb || !head) throw new Error('Thiếu hàng tab');
    const fit = await list.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sl: el.scrollLeft }));
    expect(fit.sw, `${size.width}px tab phải vừa, không cuộn`).toBeLessThanOrEqual(fit.cw + 1);
    expect(fit.sl).toBe(0);
    expect(Math.abs(lb.width - head.width), `${size.width}px`).toBeLessThanOrEqual(2);
    for (const tab of await list.getByRole('tab').all()) {
      const tb = await tab.boundingBox();
      if (!tb) throw new Error('Tab không hiện');
      expect(tb.x).toBeGreaterThanOrEqual(lb.x - 1);
      expect(right(tb)).toBeLessThanOrEqual(right(lb) + 1);
    }
  }
});

test('Desktop: khi cuộn, cột phụ và hàng tab dính dưới thanh tiêu đề, không bị che', async ({ page }, info) => {
  desktopOnly(info.project.name);
  await open(page);
  await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
  const appHeader = page.getByRole('banner').filter({ hasText: 'Hồ sơ khách' }).first();
  const hb = await appHeader.boundingBox();
  if (!hb) throw new Error('Thiếu thanh tiêu đề');
  const tabsTop = (await tablist(page).boundingBox())?.y ?? 0;
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(max, 'trang phải đủ dài để cuộn').toBeGreaterThan(200);
  for (const y of [Math.min(300, max), max]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const known = await box(page, 'Đã biết');
    // Cột phụ dính: "Đã biết" luôn thấy trọn đầu thẻ, nằm dưới thanh tiêu đề.
    expect(known.y, `cuộn ${y}px`).toBeGreaterThanOrEqual(bottom(hb) - 1);
    expect(known.y, `cuộn ${y}px`).toBeLessThan(400);
    if (y > tabsTop) {
      const tb = await tablist(page).boundingBox();
      expect(tb?.y ?? 0, `cuộn ${y}px: tab dính dưới tiêu đề`).toBeGreaterThanOrEqual(bottom(hb) - 1);
    }
  }
});

test('Ngày trong Thông tin thêm cùng một kiểu với Lần gọi cuối', async ({ page }) => {
  await open(page);
  const extra = page.getByRole('region', { name: 'Thông tin thêm', exact: true });
  await extra.scrollIntoViewIfNeeded();
  await expect(extra).toContainText('Hôm qua 15:00');
  await expect(extra).toContainText('CN 4/10 09:00');
  await expect(extra).not.toContainText('04/10/2026');
});

// Ảnh mẫu "màn đầu điện thoại giữ nguyên bản cũ" đã gỡ (28/10): R2 làm lại hồ sơ theo D-028.
// Màn đầu điện thoại do e2e R2 kiểm theo ngân sách L1 thay vì so ảnh.

// Ảnh trước/sau cho báo cáo: PF07_SHOTS=<thư mục> npx playwright test pf07 --project=desktop-1280 -g "Ảnh"
test('Ảnh bố cục desktop cho báo cáo', async ({ page }, info) => {
  const dir = process.env.PF07_SHOTS;
  test.skip(!dir || info.project.name !== 'desktop-1280', 'Chỉ chạy khi đặt PF07_SHOTS');
  await open(page);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    // Chờ hiệu ứng chuyển màu (transition-colors) xong, kẻo ảnh chụp giữa chừng.
    await page.waitForTimeout(600);
    for (const size of DESKTOP) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${dir}/${size.width}-${scheme}.png` });
    }
  }
});
