import { expect, type Page, test } from '@playwright/test';

const userId = 'tl01-e2e-user';
const NOW = new Date('2026-11-09T10:00:00+07:00');
const at = (day: string, time: string) => new Date(`2026-${day}T${time}:00+07:00`).toISOString();
const customer = {
  id: 'tl01-customer',
  owner_id: userId,
  full_name: 'Khách TL-01',
  phone: '0912345678',
  qualified_at: at('10-09', '22:29'),
  care_stage: 'Nuôi dài hạn',
  care_stage_updated_at: at('10-30', '10:53'),
  registered_at: at('10-09', '22:29'),
  created_at: at('10-09', '22:29'),
  updated_at: at('11-03', '15:33'),
  next_call_at: at('11-09', '08:00'),
  next_call_end: at('11-09', '09:00'),
  care_stage_history: [
    { stage: 'Đang chăm sóc', at: at('10-09', '22:29') },
    { stage: 'Đang chăm sóc', at: at('10-10', '21:11'), note: 'đã gọi 21:11, 10.10.2026' },
    { stage: 'Nuôi dài hạn', at: at('10-30', '10:53'), auto: 'sla', note: 'Tự động: quá 20 ngày…' },
    { stage: 'Nuôi dài hạn', at: at('11-03', '15:33'), note: 'd', extension: { keep: true } },
  ],
  call_attempts: [
    { at: at('10-09', '22:29'), result: 'talked' },
    { at: at('10-10', '21:11'), result: 'talked' },
  ],
  notes_manual: [{ at: at('10-09', '22:58'), text: 'Ghi chú 22:58' }],
  next_tasks: [{ at: at('11-03', '14:00'), text: 'Tham quan căn mẫu', kind: 'visit', done_at: at('11-03', '16:00') }],
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
  await page.goto(`/ho-so/${customer.id}`);
  await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`TL-01 · ${theme}`, () => {
    test.use({ colorScheme: theme });
    test('Dòng thời gian gộp bậc, sửa đúng ghi chú; Hành trình từ Hôm nay có hai bậc', async ({ page }) => {
      await open(page);
      const panel = page.getByRole('tabpanel', { name: /Dòng thời gian/ });
      await expect(panel.getByRole('heading', { name: /^Bậc:/ })).toHaveCount(2);
      const groups = panel.locator('[data-timeline-group]');
      await expect(groups).toHaveCount(2);
      await expect(groups.nth(0).getByRole('heading')).toHaveText('Bậc: Nuôi dài hạn');
      await expect(groups.nth(0).locator('[data-timeline-header] time')).toHaveAttribute(
        'dateTime',
        at('10-30', '10:53'),
      );
      await expect(groups.nth(0).getByText('Tự động · SLA', { exact: true })).toBeVisible();
      await expect(groups.nth(1).locator('[data-timeline-header] time')).toHaveAttribute(
        'dateTime',
        at('10-09', '22:29'),
      );
      await expect(panel.getByText('đã gọi 21:11, 10.10.2026', { exact: true })).toHaveCount(0);
      await expect(panel.getByText('Nói chuyện được', { exact: true })).toHaveCount(2);
      await expect(panel.getByRole('button', { name: 'Bậc 2', exact: true })).toBeVisible();
      const stageNote = groups.nth(0).locator('ol ol > li').filter({ hasText: 'Ghi chú bậc' });
      await expect(stageNote).toHaveCount(1);
      await expect(stageNote.getByText('d', { exact: true })).toBeVisible();
      await expect(stageNote.locator('time')).toHaveAttribute('dateTime', at('11-03', '15:33'));
      await expectNoOverflow(page);

      await stageNote.getByRole('button', { name: 'Sửa ghi chú lịch sử bậc' }).click();
      const edited = 'Đã xác nhận nhu cầu căn hai phòng ngủ, hẹn gửi bảng giá';
      await stageNote.getByRole('textbox', { name: 'Sửa ghi chú' }).fill(edited);
      await stageNote.getByRole('button', { name: 'Lưu ghi chú' }).click();
      await expect(stageNote.getByText(edited, { exact: true })).toBeVisible();
      const saved = await page.evaluate(async (uid) => {
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
        const db = await new Promise<IDBDatabase>((resolve) => {
          request.onsuccess = () => resolve(request.result);
        });
        const read = db.transaction('customers', 'readonly').objectStore('customers').get('tl01-customer');
        const row = await new Promise<{ care_stage_history: unknown[] }>((resolve) => {
          read.onsuccess = () => resolve(read.result);
        });
        db.close();
        return row.care_stage_history;
      }, userId);
      expect(saved).toHaveLength(4);
      expect(saved.slice(0, 3)).toEqual(customer.care_stage_history.slice(0, 3));
      expect(saved[3]).toMatchObject({ ...customer.care_stage_history[3], note: edited });
      await expectNoOverflow(page);

      await panel.getByRole('button', { name: 'Bậc 2', exact: true }).click();
      await expect(panel.getByRole('heading', { name: /^Bậc:/ })).toHaveCount(2);
      await expect(panel.locator('[data-timeline-entry]')).toHaveCount(0);
      await expect(panel.getByText('Ghi chú bậc', { exact: true })).toHaveCount(0);

      await page.goto('/today');
      await page.getByRole('button', { name: 'Mở Khách TL-01', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Khách TL-01', exact: true });
      await expect(sheet.getByRole('heading', { name: 'Hành trình · 5 việc' })).toBeVisible();
      const journey = sheet.getByRole('region', { name: 'Hành trình khách hàng' });
      const stages = journey.locator(':scope > ol > li');
      await expect(stages).toHaveCount(2);
      await expect(stages.nth(0).getByRole('button', { expanded: true })).toContainText('Nuôi dài hạn');
      await expect(stages.nth(0).getByText('Ghi chú bậc', { exact: true })).toBeVisible();
      await expect(stages.nth(0).getByText(edited, { exact: true })).toBeVisible();
      await stages.nth(1).getByRole('button', { expanded: false }).click();
      await expect(journey.getByText('Nói chuyện được', { exact: true })).toHaveCount(2);
      await expect(journey.getByText('đã gọi 21:11, 10.10.2026', { exact: true })).toHaveCount(0);
      await expectNoOverflow(page);
    });
  });
}
