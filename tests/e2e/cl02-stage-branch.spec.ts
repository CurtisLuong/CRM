import { expect, type Page, test } from '@playwright/test';

// CL-02 (Curtis 2026-10-22): Nuôi dài hạn là nhánh của Đang chăm sóc (L1/L2) và hồ sơ khách đồng
// nghiệp không hiện SLA (L3). Giờ cố định, dữ liệu giả, Supabase giả 127.0.0.1.
const userId = 'cl02-e2e-user';
const colleagueId = 'cl02-colleague';
const NOW = new Date(2026, 9, 19, 9, 30);
const DAY = 86_400_000;
const daysBeforeNow = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

// Đang chăm sóc, vào bậc 25 ngày trước → quá hạn mức 20 ngày (D-008): SLA "quá hạn", sức khoẻ "Nguy cơ".
const careRow = (id: string, owner: string, name: string) => ({
  id,
  owner_id: owner,
  full_name: name,
  phone: '0912345678',
  care_stage: 'Đang chăm sóc',
  qualified_at: daysBeforeNow(40),
  care_stage_updated_at: daysBeforeNow(25),
  care_stage_history: [{ at: daysBeforeNow(25), stage: 'Đang chăm sóc', note: '' }],
  interest_level: 60,
  source: 'facebook_ads',
  intake_method: 'ocr',
  registered_at: daysBeforeNow(45),
  created_at: daysBeforeNow(45),
  updated_at: daysBeforeNow(1),
  call_attempts: [{ at: daysBeforeNow(3), result: 'talked', note: 'Hỏi giá căn 2PN', duration: 120 }],
  next_tasks: [],
});

// Vào Nuôi dài hạn do app tự chuyển 2 ngày trước ({auto:'sla'}, còn trong hạn hoàn tác 3 ngày).
const nurtureRow = (id: string, owner: string, name: string) => ({
  id,
  owner_id: owner,
  full_name: name,
  phone: '0987654321',
  care_stage: 'Nuôi dài hạn',
  qualified_at: daysBeforeNow(60),
  care_stage_updated_at: daysBeforeNow(2),
  care_stage_history: [
    { at: daysBeforeNow(30), stage: 'Đang chăm sóc', note: '' },
    { at: daysBeforeNow(2), stage: 'Nuôi dài hạn', note: 'Tự động: quá 20 ngày ở "Đang chăm sóc" (SLA)', auto: 'sla' },
  ],
  interest_level: 40,
  source: 'facebook_ads',
  intake_method: 'ocr',
  registered_at: daysBeforeNow(60),
  created_at: daysBeforeNow(60),
  updated_at: daysBeforeNow(2),
  call_attempts: [{ at: daysBeforeNow(10), result: 'talked', note: '', duration: 60 }],
  next_tasks: [],
});

const ownOver = careRow('cl02-own-over', userId, 'Lê Thị Của Mình');
const colleagueOver = careRow('cl02-colleague-over', colleagueId, 'Phạm Văn Đồng Nghiệp');
const ownNurture = nurtureRow('cl02-own-nurture', userId, 'Lê Thị Nuôi Dài');
const colleagueNurture = nurtureRow('cl02-colleague-nurture', colleagueId, 'Phạm Văn Nuôi Dài');

async function seed(page: Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'cl02@example.test',
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
    { uid: userId, rows: [ownOver, colleagueOver, ownNurture, colleagueNurture] },
  );
}

async function openProfile(page: Page, id: string, name: string) {
  await seed(page);
  await page.goto(`/ho-so/${id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

const header = (page: Page) => page.getByTestId('customer-profile').locator('header').first();
const expectNoHorizontalScroll = async (page: Page) => {
  const w = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.vw);
};

test('L1/L2: sheet đổi bậc xếp Nuôi dài hạn ngay sau Đang chăm sóc, kèm "không tính SLA"', async ({ page }, info) => {
  await openProfile(page, ownOver.id, ownOver.full_name);
  await page.getByRole('button', { name: /Đổi bậc/ }).click();
  const sheet = page.getByRole('dialog', { name: /bậc/i });
  await expect(sheet).toBeVisible();

  const values = await sheet
    .getByRole('radio')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
  expect(values).toEqual([
    'Đăng kí mới',
    'Đang tiếp cận',
    'Đang chăm sóc',
    'Nuôi dài hạn',
    'Xem dự án',
    'Booking & Làm hồ sơ',
  ]);
  expect(values.indexOf('Nuôi dài hạn')).toBe(values.indexOf('Đang chăm sóc') + 1);

  const nurture = sheet.getByRole('radio', { name: 'Nuôi dài hạn' });
  await expect(nurture).toBeVisible();
  await expect(nurture).not.toBeChecked();
  await expect(sheet.getByRole('radio', { name: 'Đang chăm sóc' })).toBeChecked();
  // Dòng phụ nằm cùng dòng bậc nhánh (L1).
  const nurtureRow = sheet.locator('label').filter({ hasText: 'Nuôi dài hạn' });
  await expect(nurtureRow).toContainText('Nhánh của Đang chăm sóc · không tính SLA');
  await expectNoHorizontalScroll(page);

  // Ảnh tối cho báo cáo: chỉ chụp một lần ở 360px.
  if (info.project.name === 'phone-360') {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: info.outputPath('cl02-sheet-branch-dark-360.png') });
  }
});

test('L3: hồ sơ khách đồng nghiệp quá SLA không có thanh/chữ SLA, không báo rủi ro, không hoàn tác', async ({
  page,
}) => {
  await openProfile(page, colleagueOver.id, colleagueOver.full_name);
  const head = header(page);
  await expect(head).toContainText('Người phụ trách khác · hồ sơ chỉ xem.');
  await expect(head).not.toContainText('SLA bậc');
  await expect(head).not.toContainText(/quá \d/i);
  // Như khách chưa có tín hiệu SLA — không báo trễ/quá hạn (đầu hồ sơ kit R2-02 không còn ô "Chưa đủ dữ liệu").
  await expect(head).not.toContainText('Quá hạn');
  await expect(head).not.toContainText('Nguy cơ');
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // Cùng khách đồng nghiệp đang Nuôi dài hạn do app tự chuyển: vẫn không có nút hoàn tác SLA.
  await page.goto(`/ho-so/${colleagueNurture.id}`);
  await expect(page.getByRole('heading', { level: 1, name: colleagueNurture.full_name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toHaveCount(0);
});

test('L2: ô Tiến độ ở form xếp Nuôi dài hạn ngay sau Đang chăm sóc, có dấu nhánh', async ({ page }) => {
  await seed(page);
  await page.goto(`/intake/${ownOver.id}`);
  // Form kit (R5-01): ô chọn Radix (combobox + listbox), không còn <select>.
  const progress = page.getByRole('combobox', { name: 'Tiến độ' });
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('Đang chăm sóc');
  await progress.click();
  const texts = (await page.getByRole('option').allTextContents()).filter((text) => text !== '— Chưa rõ —');
  expect(texts.map((text) => text.replace(/^↳ /, '').split(' · ')[0])).toEqual([
    'Đăng kí mới',
    'Đang tiếp cận',
    'Đang chăm sóc',
    'Nuôi dài hạn',
    'Xem dự án',
    'Booking & Làm hồ sơ',
    'Kí HĐMB',
    'Loại',
  ]);
  const nurture = texts.find((text) => text.includes('Nuôi dài hạn'));
  expect(nurture).toContain('↳');
  expect(nurture).toContain('không tính SLA');
  await page.keyboard.press('Escape');
  await expectNoHorizontalScroll(page);
});

test('L3: hồ sơ khách của mình cùng dữ liệu vẫn có thanh SLA và nút hoàn tác tự chuyển', async ({ page }) => {
  await openProfile(page, ownOver.id, ownOver.full_name);
  const head = header(page);
  // Đồng hồ SLA của kit (R2-02): "SLA <mục tiêu> · <hạn mức>", "quá 5n 00h", tín hiệu "Quá hạn".
  await expect(head).toContainText('SLA 10n · 20n');
  await expect(head).toContainText('quá 5n');
  await expect(head).toContainText('Quá hạn');
  await expectNoHorizontalScroll(page);

  await page.goto(`/ho-so/${ownNurture.id}`);
  await expect(page.getByRole('heading', { level: 1, name: ownNurture.full_name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeVisible();
});
