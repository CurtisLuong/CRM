import { expect, type Page, test } from '@playwright/test';

// PF-07 — Hồ sơ khách trên desktop màn lớn: 2 cột có chủ đích (cột chính + cột phụ dính), không lưới hàng.
// Lead viết TRƯỚC khi giao worker. Ảnh điện thoại 360/390 chụp từ bản cũ → bố cục điện thoại phải giữ nguyên.
const userId = 'hd01-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

// Ca xấu nhất trong ảnh Curtis gửi: chưa có việc tiếp theo (thẻ trái ngắn), nhiều "Còn thiếu", "Thông tin thêm" dài.
const customer = {
  id: 'hd01-c1',
  owner_id: userId,
  full_name: 'Nguyễn Văn Đức',
  phone: '0912345678',
  dob: '1991-01-02',
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
  await page.goto('/ho-so/hd01-c1');
  await expect(page.getByRole('heading', { level: 1, name: 'Nguyễn Văn Đức' })).toBeVisible();
}

const appHeader = (page: Page) =>
  page.locator('header').filter({ has: page.getByRole('button', { name: 'Menu', exact: true }) });

test('HD-01: ô tìm dài mở bảng tìm, Menu ba gạch; cụm phải vừa màn', async ({ page }) => {
  await open(page);
  const header = appHeader(page);
  const search = header.getByRole('button', { name: /Tìm khách, lệnh/ });
  const searchBox = await search.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  // Điện thoại (Curtis 11/11, phương án B): icon + "Tìm" vừa khít để tiêu đề hiện đủ; desktop ô dài.
  expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(width >= 1280 ? 280 : 44);
  if (width < 768) await expect(search).toContainText('Tìm');
  for (const button of [search, header.getByRole('button', { name: 'Menu', exact: true })]) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  }
  await expect(header.getByRole('button', { name: 'Menu', exact: true }).locator('svg.lucide-menu')).toHaveCount(1);
  await expect(header.locator('svg.lucide-ellipsis')).toHaveCount(0);
  await search.click({ position: { x: (searchBox?.width ?? 88) - 8, y: 22 } });
  await expect(page.getByRole('combobox', { name: 'Tìm khách, lệnh, màn' })).toBeFocused();
  await page.keyboard.press('Escape');
  const sync = header.locator('[data-state]').filter({ has: page.locator('svg.lucide-refresh-cw') });
  await expect(sync).toHaveCount(1);
  await expect(sync.locator('span.sr-only')).toHaveCount(1);
  await expect(sync.locator('span.sr-only')).toHaveCSS('clip-path', 'inset(50%)');
});

test('HD-01: tên khuất thì thanh đổi tên + tuổi, trở về đầu khôi phục; sáng/tối và mọi khổ', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'Chạy ma trận khổ trên một project');
  await open(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [360, 390, 1280, 1440]) {
      await page.setViewportSize({ width, height: 780 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const title = appHeader(page).locator('h1');
      await expect(title).toHaveText('Hồ sơ khách');
      const source = page.getByTestId('customer-profile').locator('h1').first();
      const sourceBox = await source.boundingBox();
      const headerBox = await appHeader(page).boundingBox();
      if (!sourceBox || !headerBox) throw new Error('Thiếu tiêu đề');
      const threshold = sourceBox.y + sourceBox.height - headerBox.height;
      await page.evaluate((top) => window.scrollTo(0, top), threshold - 2);
      await expect(title).toHaveText('Hồ sơ khách');
      await page.evaluate((top) => window.scrollTo(0, top), threshold + 2);
      if (width >= 1280) {
        await expect(title).toContainText('Nguyễn Văn Đức35 tuổi');
        await expect(title).toHaveAccessibleName('Hồ sơ khách');
        await expect(title.getByText('35 tuổi')).toHaveClass(/text-ink-muted/);
      } else {
        await expect(title).toHaveText('Hồ sơ khách');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(title).toHaveText('Hồ sơ khách');
      await page.clock.runFor(250);
      await page.screenshot({ path: info.outputPath(`header-${width}-${theme}.png`) });
    }
  }
  // Đổi khổ khi đang cuộn: desktop đổi tên, điện thoại giữ tiêu đề cũ.
  await page.evaluate(() => window.scrollTo(0, 180));
  await expect(appHeader(page).locator('h1')).toContainText('Nguyễn Văn Đức');
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(appHeader(page).locator('h1')).toHaveText('Hồ sơ khách');
  await page.setViewportSize({ width: 1280, height: 780 });
  await expect(appHeader(page).locator('h1')).toContainText('Nguyễn Văn Đức');
  // Rời hồ sơ: không giữ tên khách trên màn khác.
  await page.goto('/cong-viec');
  await expect(appHeader(page).locator('h1')).toHaveText('Công việc');
});

test('HD-01: icon đồng bộ dùng token alert/soon; giảm chuyển động dừng xoay', async ({ page }) => {
  await page.goto('/dev/ui-kit');
  const demo = page.locator('#header-controls');
  for (const [kind, label, tone] of [
    ['synced', 'Đã đồng bộ 09:30', 'text-ink-muted'],
    ['pending', 'Chờ 3 thay đổi', 'text-soon-text'],
    ['error', 'Lỗi đồng bộ', 'text-alert-text'],
    ['offline', 'Ngoại tuyến', 'opacity-50'],
  ]) {
    const button = demo.getByRole('button', { name: label });
    await expect(button).toHaveAttribute('data-state', kind);
    await expect(button).toHaveClass(new RegExp(tone));
    await expect(button.locator('svg.lucide-refresh-cw')).toHaveCount(1);
    await expect(button.locator('span.sr-only')).toHaveCSS('clip-path', 'inset(50%)');
  }
  const pendingIcon = demo.locator('[data-state=pending] svg');
  expect(await pendingIcon.evaluate((el) => getComputedStyle(el).animationDuration)).toBe('2s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await pendingIcon.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await demo.locator('[data-scroll-title]').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
