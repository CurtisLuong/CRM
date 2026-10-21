import { expect, type Page, test } from '@playwright/test';

// PF-02 — Dòng thời gian phân cấp theo bậc, mỗi hành động có icon.
// Dữ liệu giả + Supabase giả 127.0.0.1, cùng cách seed với m4-profile.spec.ts.
const userId = 'pf02-e2e-user';
const NOW = new Date(2026, 9, 19, 9, 30);

// Số chuẩn luật 3 (giờ ICT = UTC+7): A 10:00 ngày 1, B 10:00 ngày 3; gọi 09:00 ngày 1,
// ghi chú 10:00 ngày 1, Zalo 15:00 ngày 2, gọi 11:00 ngày 3.
const stageA = '2026-10-01T03:00:00.000Z';
const stageB = '2026-10-03T03:00:00.000Z';
const callBeforeStage = '2026-10-01T02:00:00.000Z';
const noteSameTimeA = '2026-10-01T03:00:00.000Z';
const zaloInA = '2026-10-02T08:00:00.000Z';
const callInB = '2026-10-03T04:00:00.000Z';

const customer = {
  id: 'pf02-c1',
  owner_id: userId,
  full_name: 'Phạm Văn Tiến',
  phone: '0911222333',
  care_stage: 'Xem dự án',
  care_stage_updated_at: stageB,
  sla_anchor_at: stageB,
  qualified_at: stageA,
  source: 'facebook_ads',
  intake_method: 'manual',
  registered_at: '2026-09-30T02:00:00.000Z',
  created_at: '2026-09-30T02:00:00.000Z',
  updated_at: callInB,
  call_attempts: [
    { at: callBeforeStage, result: 'no_answer', note: null, duration: 0 },
    { at: callInB, result: 'talked', note: 'Chốt lịch xem căn mẫu', duration: 120 },
  ],
  notes_manual: [{ at: noteSameTimeA, text: 'Ghi chú trong bậc A' }],
  interactions: [{ at: zaloInA, channel: 'zalo', kind: 'sent', template: 'Bảng giá', by: userId, origin: 'v2' }],
  care_stage_history: [
    { at: stageA, stage: 'Đang chăm sóc', note: 'Ghi chú mốc A' },
    { at: stageB, stage: 'Xem dự án', note: '' },
  ],
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
      email: 'pf02@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pf02-token',
        refresh_token: 'synthetic-pf02-refresh',
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
  await page.goto('/ho-so/pf02-c1');
  await expect(page.getByRole('heading', { level: 1, name: 'Phạm Văn Tiến' })).toBeVisible();
  await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
}

test('PF-02: mốc bậc là đầu nhóm, mục trong bậc thụt phải hơn và có icon riêng', async ({ page }) => {
  await open(page);
  const panel = page.getByRole('tabpanel', { name: /Dòng thời gian/ });
  const groups = panel.locator('[data-timeline-group]');
  await expect(groups).toHaveCount(3);

  // Nhóm mới nhất trước; trong nhóm, mục con mới nhất trước.
  await expect(groups.nth(0)).toContainText('Bậc: Xem dự án');
  await expect(groups.nth(0)).toContainText('Nói chuyện được');
  await expect(groups.nth(0)).not.toContainText('Đã gửi Zalo');
  await expect(groups.nth(1)).toContainText('Bậc: Đang chăm sóc');
  await expect(groups.nth(1)).toContainText('Đã gửi Zalo');
  await expect(groups.nth(1)).toContainText('Ghi chú trong bậc A');
  await expect(groups.nth(1)).toContainText('Ghi chú mốc A');
  await expect(groups.nth(2)).toContainText('Trước khi có mốc bậc');
  await expect(groups.nth(2)).toContainText('Không nghe máy');

  // Mục con nằm lệch phải hơn đầu nhóm (thụt vào sau đường dọc).
  const headerBox = await groups.nth(1).locator('[data-timeline-header]').boundingBox();
  const rowBox = await groups.nth(1).locator('[data-timeline-entry]').first().boundingBox();
  expect(headerBox?.x).not.toBeUndefined();
  expect(rowBox && headerBox && rowBox.x).toBeGreaterThan(headerBox?.x ?? Number.POSITIVE_INFINITY);

  // Mỗi dòng (đầu nhóm + mục con) có đúng một icon.
  const rows = panel.locator('[data-timeline-entry]');
  await expect(rows).toHaveCount(4);
  for (let index = 0; index < 4; index++) await expect(rows.nth(index).locator('svg')).toHaveCount(1);
  for (let index = 0; index < 3; index++)
    await expect(groups.nth(index).locator('[data-timeline-header]').locator('svg')).toHaveCount(1);

  // Không cuộn ngang (dự án phone-360 đo đúng 360px).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('PF-02: lọc "Cuộc gọi" chỉ giữ nhóm có cuộc gọi và ẩn ghi chú mốc bậc', async ({ page }) => {
  await open(page);
  const panel = page.getByRole('tabpanel', { name: /Dòng thời gian/ });
  await panel.getByRole('button', { name: /^Cuộc gọi/ }).click();
  const groups = panel.locator('[data-timeline-group]');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText('Bậc: Xem dự án');
  await expect(groups.nth(1)).toContainText('Trước khi có mốc bậc');
  await expect(panel).not.toContainText('Ghi chú mốc A');
  await expect(panel).not.toContainText('Ghi chú trong bậc A');
  await expect(panel).not.toContainText('Đã gửi Zalo');
  await expect(panel).toContainText('Nói chuyện được');
  await expect(panel).toContainText('Không nghe máy');
});
