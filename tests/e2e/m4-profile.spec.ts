import { expect, type Page, test } from '@playwright/test';

// M4 — Hồ sơ v3 (DESIGN_SYSTEM v4 D-023 §4; bản mẫu docs/v3/mockups/ho-so.html). Lead viết TRƯỚC khi giao worker.
const userId = 'm4-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

const customer = {
  id: 'm4-c1',
  owner_id: userId,
  full_name: 'Trần Thị Thu Hương',
  phone: '0911234567',
  care_stage: 'Xem dự án',
  care_stage_updated_at: iso(17, 9),
  sla_anchor_at: iso(17, 9),
  qualified_at: iso(10, 9),
  interest_level: 85,
  purpose: 'Ở',
  source: 'facebook_ads',
  intake_method: 'ocr',
  registered_at: iso(4, 9),
  created_at: iso(4, 9),
  updated_at: iso(18, 15),
  call_attempts: [
    { at: iso(15, 10), result: 'no_answer', note: null, duration: 0 },
    { at: iso(18, 15), result: 'talked', note: 'Hỏi giá căn 2PN, muốn vay 70%', duration: 185 },
  ],
  notes_manual: [{ at: iso(16, 9), text: 'Vợ chồng làm KCN, chưa có nhà' }],
  care_stage_history: [
    { at: iso(10, 9), stage: 'Đang chăm sóc', note: '' },
    { at: iso(17, 9), stage: 'Xem dự án', note: '' },
  ],
  next_tasks: [{ at: iso(18, 15), text: 'Gọi lại báo giá căn 2PN', kind: 'call', due: iso(19, 9, 15), side: 'me' }],
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
      email: 'm4@example.test',
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
  await page.goto('/ho-so/m4-c1');
  await expect(page.getByRole('heading', { level: 1, name: 'Trần Thị Thu Hương' })).toBeVisible();
}

test('Hồ sơ v3: không "Chưa biết", không Brief 20 giây, không ô chọn bậc gốc', async ({ page }) => {
  await open(page);
  const main = page.locator('main');
  await expect(main.getByText('Chưa biết')).toHaveCount(0);
  await expect(main.getByText(/Brief · 20 giây/)).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Đổi bậc khách' })).toHaveCount(0);
  await expect(main.getByText('0911 234 567').or(main.getByText('0911234567'))).toBeVisible();
  const w = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.vw);
});

test('Đầu hồ sơ: nút bậc mở sheet chọn bậc; có thanh SLA', async ({ page }) => {
  await open(page);
  const stage = page.getByRole('button', { name: /Đổi bậc/ });
  await expect(stage).toContainText('Xem dự án');
  await expect(page.getByText(/^(còn|quá) .+/).first()).toBeVisible();
  await stage.click();
  const sheet = page.getByRole('dialog', { name: /bậc/i });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: 'Đang chăm sóc' })).toBeVisible();
  await expect(sheet.getByRole('radio', { name: 'Xem dự án' })).toBeChecked();
});

test('Việc tiếp theo · Lần trước · Đã biết theo thứ tự, đúng nội dung', async ({ page }) => {
  await open(page);
  const next = page.getByRole('region', { name: 'Việc tiếp theo', exact: true });
  await expect(next).toContainText('Gọi lại báo giá căn 2PN');
  await expect(next).toHaveAttribute('data-tone', 'over');
  const last = page.getByRole('region', { name: 'Lần trước', exact: true });
  await expect(last).toContainText('Hôm qua 15:00');
  await expect(last).toContainText('Gọi 3 phút');
  await expect(last).toContainText('Nói chuyện được');
  await expect(last).toContainText('Hỏi giá căn 2PN, muốn vay 70%');
  const known = page.getByRole('region', { name: 'Đã biết', exact: true });
  await expect(known).toContainText('Mua để');
  await expect(known).toContainText('Còn thiếu');
  const chip = known.getByRole('button', { name: 'Người quyết định' });
  await chip.click();
  await expect(known.getByText(/Có thể hỏi:/)).toBeVisible();
  const y = async (name: string) =>
    (await page.getByRole('region', { name, exact: true }).boundingBox())?.y ?? Number.POSITIVE_INFINITY;
  expect(await y('Việc tiếp theo')).toBeLessThan(await y('Lần trước'));
});

test('Dòng thời gian lọc theo loại; nhãn tiếng Việt', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
  const panel = page.getByRole('tabpanel', { name: /Dòng thời gian/ });
  await expect(panel).toContainText('Vợ chồng làm KCN');
  await panel.getByRole('button', { name: /^Cuộc gọi/ }).click();
  await expect(panel.getByRole('button', { name: /^Cuộc gọi/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toContainText('Nói chuyện được');
  await expect(panel).toContainText('Không nghe máy');
  await expect(panel).not.toContainText('Vợ chồng làm KCN');
  await panel.getByRole('button', { name: /^Tất cả/ }).click();
  await expect(panel).toContainText('Vợ chồng làm KCN');
});

test('Thông tin thêm chỉ trường có giá trị', async ({ page }) => {
  await open(page);
  const extra = page.getByRole('region', { name: 'Thông tin thêm', exact: true });
  await extra.scrollIntoViewIfNeeded();
  await expect(extra).toContainText('Facebook Ads');
  await expect(extra).toContainText('Từ ảnh chụp');
  await expect(extra).toContainText('Rất nóng');
  await expect(extra).not.toContainText('Lý do loại');
  await expect(extra).not.toContainText('Điều kiện retarget');
});

test('Điện thoại: 4 nút liên hệ ở đáy thay thanh điều hướng; màn đầu thấy việc tiếp + lần trước', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone-360', 'Đo ở 360×780');
  await open(page);
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveCount(0);
  const bar = page.getByRole('navigation', { name: 'Hành động nhanh' });
  await expect(bar).toBeVisible();
  const barTop = (await bar.boundingBox())?.y ?? 0;
  for (const name of ['Việc tiếp theo', 'Lần trước']) {
    const box = await page.getByRole('region', { name, exact: true }).boundingBox();
    expect(box && box.y + box.height, name).toBeLessThanOrEqual(barTop);
  }
});

test('Desktop: 4 nút liên hệ nằm ngay dưới tên, không nổi giữa trang', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'Bố cục desktop');
  await open(page);
  const bar = page.getByRole('navigation', { name: 'Hành động nhanh' });
  const box = await bar.boundingBox();
  expect(box?.y ?? 9999).toBeLessThan(320);
  await expect(page.getByRole('region', { name: 'Đã biết', exact: true })).toBeVisible();
});
