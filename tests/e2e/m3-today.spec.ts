import { expect, type Page, test } from '@playwright/test';

// M3 — Hôm nay v3 (DESIGN_SYSTEM v4, D-023; UX_GUIDELINES §4). Lead viết TRƯỚC khi giao worker; trượt trên bố cục cũ.
// Giờ máy cố định 09:30 19/10/2026 (Asia/Ho_Chi_Minh theo playwright.config).

const userId = 'm3-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

const customers = [
  {
    // Quá giờ hẹn gọi (S02 'due'): khung 07:00–08:00, giờ 09:30 → quá hạn (D-010).
    id: 'm3-due',
    owner_id: userId,
    full_name: 'Khách Quá Hẹn',
    phone: '0912000001',
    care_stage: 'Đang chăm sóc',
    care_stage_updated_at: iso(17, 9),
    sla_anchor_at: iso(17, 9),
    qualified_at: iso(10, 9),
    interest_level: 40,
    source: 'facebook_ads',
    registered_at: iso(5, 9),
    created_at: iso(5, 9),
    updated_at: iso(18, 15),
    next_call_at: iso(19, 7),
    next_call_end: iso(19, 8),
    call_attempts: [
      { at: iso(16, 10), result: 'talked', note: 'Hỏi giá căn 2PN' },
      { at: iso(17, 10), result: 'busy', note: null },
      { at: iso(18, 15), result: 'no_answer', note: null },
    ],
    next_tasks: [],
  },
  {
    // Khách mới chưa gọi (S01 'new').
    id: 'm3-new',
    owner_id: userId,
    full_name: 'Khách Mới Toanh',
    phone: '0912000002',
    care_stage: 'Đăng kí mới',
    interest_level: 20,
    source: 'facebook_ads',
    notes: 'Quan tâm căn 2PN',
    registered_at: iso(19, 8),
    created_at: iso(19, 8),
    updated_at: iso(19, 8),
    call_attempts: [],
  },
  {
    // Khách nóng lâu chưa liên hệ (S08 'hot') → nhóm thu gọn.
    id: 'm3-hot',
    owner_id: userId,
    full_name: 'Khách Nóng Nguội',
    phone: '0912000003',
    care_stage: 'Đang chăm sóc',
    care_stage_updated_at: iso(1, 9),
    sla_anchor_at: iso(1, 9),
    qualified_at: iso(1, 9),
    interest_level: 85,
    source: 'referral',
    registered_at: iso(1, 9),
    created_at: iso(1, 9),
    updated_at: iso(8, 9),
    call_attempts: [{ at: iso(8, 9), result: 'talked', note: 'Đang cân nhắc' }],
    next_tasks: [{ at: iso(8, 9), text: 'Gửi bảng giá mới', due: iso(30, 9) }],
  },
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
      email: 'm3@example.test',
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
    { uid: userId, rows: customers },
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Đến giờ / quá giờ hẹn gọi', exact: true })).toBeVisible();
}

const card = (page: Page, name: string) => page.locator('[data-card]').filter({ hasText: name });

test('Hôm nay v3: nhóm theo tín hiệu, không còn tab lọc và nhãn P0', async ({ page }) => {
  await open(page);
  const main = page.locator('main');
  await expect(main.getByText(/^P[012]$/)).toHaveCount(0);
  for (const tab of ['Ưu tiên', 'Lời hứa', 'Cơ hội'])
    await expect(main.getByRole('button', { name: tab })).toHaveCount(0);
  // Không lặp tiêu đề màn trong nội dung (tiêu đề ở thanh trên).
  await expect(main.getByRole('heading', { level: 1, name: 'Hôm nay' })).toHaveCount(0);
  // Thứ tự nhóm: quá giờ hẹn trước khách mới.
  const titles = await main
    .locator('section[aria-label]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(titles.indexOf('Đến giờ / quá giờ hẹn gọi')).toBeLessThan(titles.indexOf('Khách mới chưa gọi'));
  // Tóm tắt 1 dòng.
  await expect(main.getByText(/\d+ việc · ~\d+ phút/)).toBeVisible();
});

test('Thẻ đầy đủ: cấp 1 tên + nút Gọi; cấp 2 lần gọi gần nhất, số lần; cấp 3 ghi chú, SLA', async ({ page }) => {
  await open(page);
  const due = card(page, 'Khách Quá Hẹn');
  await expect(due).toHaveAttribute('data-tone', 'over');
  await expect(due.getByText(/^Quá .* · hạn 07:00$/)).toBeVisible();
  await expect(due.getByText('Gọi gần nhất')).toBeVisible();
  await expect(due.getByText('Hôm qua 15:00 · Không nghe máy')).toBeVisible();
  await expect(due.getByText('3 lần')).toBeVisible();
  await expect(due.getByText('“Hỏi giá căn 2PN”')).toBeVisible();
  await expect(due.getByText(/^(còn|quá) /)).toBeVisible();
  // Đúng 1 hành động + nút mở thẻ (D-023 L2).
  await expect(due.getByRole('button')).toHaveCount(2);
  await expect(due.getByRole('button', { name: 'Gọi Khách Quá Hẹn' })).toBeVisible();

  const fresh = card(page, 'Khách Mới Toanh');
  await expect(fresh.getByText('Facebook Ads')).toBeVisible();
  await expect(fresh.getByText('Chưa', { exact: true })).toBeVisible();
  await expect(fresh.getByText('“Quan tâm căn 2PN”')).toBeVisible();
});

test('Nút Gọi trên thẻ mở luồng gọi có sẵn; chạm tên mở hồ sơ', async ({ page }) => {
  await open(page);
  await card(page, 'Khách Quá Hẹn').getByRole('button', { name: 'Gọi Khách Quá Hẹn' }).click();
  await page.waitForFunction(() => (window as Window & { __dialCalls?: number }).__dialCalls === 1);
  await page.goto('/');
  await card(page, 'Khách Quá Hẹn').getByRole('button', { name: 'Mở Khách Quá Hẹn' }).click();
  await expect(page).toHaveURL(/\/ho-so\/m3-due$/);
});

test('Phiên gọi: dải "Gọi lần lượt N khách" ở đầu màn, bấm Bắt đầu vào phiên', async ({ page }) => {
  await open(page);
  const bar = page.getByText(/^Gọi lần lượt \d+ khách$/);
  await expect(bar).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page.getByRole('button', { name: 'Dừng phiên' })).toBeVisible();
  await expect(page.getByText(/^1\/\d+/)).toBeVisible();
});

test('Nhóm ít gấp thu gọn, chạm để mở', async ({ page }) => {
  await open(page);
  const toggle = page.getByRole('button', { name: /Khách nóng đang nguội|Chưa có việc tiếp theo|Khách đang chăm lâu/ });
  await expect(toggle.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(card(page, 'Khách Nóng Nguội')).toHaveCount(0);
  await toggle.first().click();
  await expect(toggle.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page, 'Khách Nóng Nguội')).toBeVisible();
});

test('Màn đầu điện thoại 360×780 thấy trọn ≥ 2 thẻ (D-023 L1)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-360', 'Ngân sách màn đầu đo ở 360×780');
  await open(page);
  const full = await page.locator('[data-card]').evaluateAll(
    (els) =>
      els.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight - 64;
      }).length,
  );
  expect(full).toBeGreaterThanOrEqual(2);
  const w = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.vw);
});
