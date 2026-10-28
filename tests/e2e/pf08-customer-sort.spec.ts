import { expect, type Page, test } from '@playwright/test';

// PF-08 — Sắp xếp 3 tầng + ghim khách cần gọi / quá SLA (Curtis duyệt 2026-10-22).
// 12 khách + 5 thứ tự chuẩn lấy đúng bảng trong task; giờ máy 22/10/2026 09:30.
const userId = 'pf08-e2e-user';
const NOW = new Date('2026-10-22T09:30:00+07:00');
const pad = (n: number) => String(n).padStart(2, '0');
const oct = (day: number, h: number, m = 0) => `2026-10-${pad(day)}T${pad(h)}:${pad(m)}:00+07:00`;
const sep = (day: number, h: number, m = 0) => `2026-09-${pad(day)}T${pad(h)}:${pad(m)}:00+07:00`;

type Seed = Record<string, unknown> & { id: string; full_name: string; phone: string };

// Số điện thoại khác nhau nhưng cùng đầu 0912 → gõ "0912" khớp cả 12 (dùng cho ca "đang tìm").
const person = (
  index: number,
  full_name: string,
  registered: string,
  enteredStage: string,
  called?: string,
  next?: { start: string; end: string },
): Seed => ({
  id: `pf08-${index}`,
  owner_id: userId,
  full_name,
  phone: `09120000${pad(index)}`,
  care_stage: 'Đang chăm sóc',
  qualified_at: registered,
  created_at: registered,
  registered_at: registered,
  care_stage_updated_at: enteredStage,
  call_attempts: called ? [{ at: called, result: 'talked' }] : [],
  ...(next ? { next_call_at: next.start, next_call_end: next.end } : {}),
});

const people: Seed[] = [
  person(1, 'Bình', oct(18, 9), oct(20, 9), oct(20, 9), { start: oct(21, 15), end: oct(21, 16) }),
  person(2, 'An', oct(17, 9), sep(22, 9, 30), sep(22, 9), { start: oct(22, 7), end: oct(22, 8) }),
  person(3, 'Cường', oct(16, 9), oct(20, 9), oct(20, 9), { start: oct(22, 9, 15), end: oct(22, 9, 45) }),
  person(4, 'Dũng', oct(14, 9), sep(27, 9, 30), sep(27, 9)),
  person(5, 'Em', oct(13, 9), sep(28, 9, 30), sep(28, 9)),
  person(6, 'Phúc', oct(15, 9), oct(7, 9, 30), oct(7, 9)),
  person(7, 'Giang', oct(20, 10), oct(20, 10)),
  person(8, 'Nam', oct(20, 12), oct(20, 12), oct(20, 14)),
  person(9, 'Hà', oct(20, 18), oct(20, 18), oct(21, 10)),
  person(10, 'Khoa', oct(20, 8), oct(20, 8), oct(21, 15)),
  person(11, 'Lan', oct(20, 19), oct(20, 19), oct(21, 9)),
  person(12, 'Mai', oct(19, 9), oct(19, 9), oct(20, 11)),
];

// Khách cũ (Nuôi dài hạn → ngoài phễu SLA) để danh sách đủ dài khi kiểm nhịp 72px.
const fillers: Seed[] = Array.from({ length: 60 }, (_, i) => {
  const registered = new Date(Date.parse('2024-01-01T02:00:00+07:00') + i * 86_400_000).toISOString();
  return {
    id: `pf08-cu-${i}`,
    owner_id: userId,
    full_name: `Khách Cũ ${String(i).padStart(3, '0')}`,
    phone: `0913000${String(i).padStart(3, '0')}`,
    care_stage: 'Nuôi dài hạn',
    qualified_at: registered,
    created_at: registered,
    registered_at: registered,
    care_stage_updated_at: '2024-03-01T02:00:00+07:00',
    call_attempts: [],
  };
});

const ORDER_DEFAULT = ['Bình', 'An', 'Cường', 'Dũng', 'Em', 'Giang', 'Nam', 'Hà', 'Khoa', 'Lan', 'Mai', 'Phúc'];
const ORDER_RECENT = ['Bình', 'An', 'Cường', 'Dũng', 'Em', 'Hà', 'Khoa', 'Lan', 'Nam', 'Giang', 'Mai', 'Phúc'];
const ORDER_SEARCH = ['Giang', 'Nam', 'Hà', 'Khoa', 'Lan', 'Mai', 'Bình', 'An', 'Cường', 'Phúc', 'Dũng', 'Em'];

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
      email: 'pf08@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pf08-token',
        refresh_token: 'synthetic-pf08-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
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
    { uid: userId, rows: [...people, ...fillers] },
  );
  await page.goto('/khach-hang');
  await expect(page.getByRole('textbox', { name: 'Tìm khách' })).toBeVisible();
}

/** Tên các thẻ theo đúng thứ tự trong DOM (chỉ thẻ đang được danh sách ảo dựng). */
const cardNames = (page: Page) =>
  page
    .locator('[data-card]')
    .evaluateAll((cards) =>
      cards.map((card) => card.querySelector('button[aria-label^="Mở "]')?.getAttribute('aria-label')?.slice(3) ?? ''),
    );

const card = (page: Page, name: string) => page.locator(`[data-card]:has(button[aria-label="Mở ${name}"])`);

const openFilters = async (page: Page) => {
  await page.getByRole('button', { name: /^Lọc/ }).click();
  return page.getByRole('dialog', { name: /Lọc/ });
};

const closeFilters = async (page: Page, count: number) => {
  await page.getByRole('button', { name: `Xem ${count} khách` }).click();
  await expect(page.getByRole('dialog', { name: /Lọc/ })).toBeHidden();
};

test('PF-08: 3 tầng + ghim cần gọi/quá SLA, đổi chiều, tìm tắt ghim, nhớ sau khi tải lại', async ({ page }) => {
  await open(page);
  await expect(page.getByText('12 khách', { exact: true })).toBeVisible();

  // 1. Mặc định: khách cần gọi → quá SLA → 3 tầng.
  expect(await cardNames(page)).toEqual(ORDER_DEFAULT);

  // Thẻ ghi lý do (L3).
  await expect(card(page, 'Bình')).toContainText('Quên gọi 15:00');
  await expect(card(page, 'An')).toContainText('Quên gọi 07:00');
  await expect(card(page, 'An')).not.toContainText('Quá SLA');
  await expect(card(page, 'Cường')).toContainText('Đến giờ gọi');
  await expect(card(page, 'Dũng')).toHaveAttribute('data-tone', 'over');
  await expect(card(page, 'Dũng')).toContainText('Quá SLA 5 ngày');
  await expect(card(page, 'Em')).toContainText('Quá SLA 4 ngày');
  await expect(card(page, 'Phúc')).not.toContainText('Quá SLA');

  // 2. Đổi chiều tầng 2 → thứ tự 2; nút đổi chiều có vùng chạm ≥ 44px, đọc được trạng thái.
  let sheet = await openFilters(page);
  const touchToggle = sheet.getByRole('button', { name: 'Lần tương tác: Chưa tương tác trước' });
  await expect(touchToggle).toBeVisible();
  const box = await touchToggle.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await expect(touchToggle).toHaveAttribute('aria-pressed', 'true');
  await touchToggle.click();
  const recentToggle = sheet.getByRole('button', { name: 'Lần tương tác: Gần nhất trước' });
  await expect(recentToggle).toBeVisible();
  await expect(recentToggle).toHaveAttribute('aria-pressed', 'false');
  await closeFilters(page, 12);
  expect(await cardNames(page)).toEqual(ORDER_RECENT);

  // 3. Tải lại trang → lựa chọn chiều còn nhớ.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Tìm khách' })).toBeVisible();
  expect(await cardNames(page)).toEqual(ORDER_RECENT);

  // 4. Về mặc định rồi gõ tìm → ghim tắt.
  sheet = await openFilters(page);
  await sheet.getByRole('button', { name: 'Lần tương tác: Gần nhất trước' }).click();
  await closeFilters(page, 12);
  expect(await cardNames(page)).toEqual(ORDER_DEFAULT);
  await page.getByRole('textbox', { name: 'Tìm khách' }).fill('0912');
  await expect.poll(() => cardNames(page)).toEqual(ORDER_SEARCH);
  await page.getByRole('textbox', { name: 'Tìm khách' }).fill('');
  await expect.poll(() => cardNames(page)).toEqual(ORDER_DEFAULT);

  // 5. "Xoá lọc" đưa 3 tầng về mặc định (kể cả sau khi đã đổi chiều).
  sheet = await openFilters(page);
  await sheet.getByRole('button', { name: 'Tên: A–Z' }).click();
  await expect(sheet.getByRole('button', { name: 'Tên: Z–A' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Xoá lọc' }).click();
  await expect(sheet.getByRole('button', { name: 'Ngày đăng ký: Mới nhất' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Lần tương tác: Chưa tương tác trước' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Tên: A–Z' })).toBeVisible();
  await closeFilters(page, 12);
  expect(await cardNames(page)).toEqual(ORDER_DEFAULT);

  // Không cuộn ngang ở mọi khổ màn.
  const width = await page.evaluate(() => ({
    view: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.view);
});

test('PF-08: danh sách ảo giữ nhịp 72px khi cuộn danh sách dài', async ({ page }) => {
  await open(page);
  const sheet = await openFilters(page);
  await page.getByLabel('Lọc trạng thái').selectOption('all');
  await sheet.getByRole('button', { name: 'Xem 72 khách' }).click();
  await expect(page.getByText('72 khách', { exact: true })).toBeVisible();

  const list = page.getByRole('region', { name: 'Danh sách khách', exact: true });
  const items = list.getByRole('listitem');
  await expect(items.first()).toBeAttached();
  expect(await items.count()).toBeLessThan(25);

  for (let gesture = 0; gesture < 40; gesture++) {
    const atBottom = await page.evaluate(
      () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1,
    );
    if (atBottom) break;
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(180, 500);
    await page.mouse.wheel(0, 1600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
  }

  // Khách cũ đứng cuối (đăng ký 2024) — thẻ cuối vẫn dựng đúng khi ở đáy danh sách.
  await expect(list.getByText('Khách Cũ 000', { exact: true })).toBeInViewport();
  expect(await items.count()).toBeLessThan(25);

  // Nhịp thẻ vẫn đều sau khi cuộn (không nhảy): điện thoại 72px; desktop ≥ 1024px là bảng 40px (D-028, R2-01).
  const rowGap = (page.viewportSize()?.width ?? 0) >= 1024 ? 40 : 72;
  const tops = (await items.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))).sort(
    (a, b) => a - b,
  );
  const gaps = new Set(tops.slice(1).map((top, i) => top - tops[i]));
  expect([...gaps]).toEqual([rowGap]);

  // Cuộn về đầu: thẻ đầu vẫn là khách cần gọi, không lệch.
  for (let gesture = 0; gesture < 40; gesture++) {
    const atTop = await page.evaluate(() => window.scrollY <= 0);
    if (atTop) break;
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(180, 300);
    await page.mouse.wheel(0, -1600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
  }
  await expect(card(page, 'Bình')).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Tìm khách' })).toBeInViewport();
});
