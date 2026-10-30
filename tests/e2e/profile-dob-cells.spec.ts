import { expect, type Page, test } from '@playwright/test';

// Curtis 30/10 (Telegram 1a): Tuổi, Mệnh, Cung là ô riêng có nhãn, khung giống các ô khác của
// Thông tin chính; ô cùng hàng phải thẳng hàng (trước đây chữ phụ dưới Ngày sinh làm lệch Hôn nhân).
// Giờ cố định 30/10/2026, dữ liệu giả, Supabase giả 127.0.0.1.
const userId = 'dob-cells-user';
const NOW = new Date(2026, 9, 30, 9, 30);
const AT = NOW.toISOString();

const base = {
  owner_id: userId,
  phone: '0342851805',
  gender: 'nữ',
  marital_status: 'đã kết hôn',
  occupation: 'Công ty, DN',
  residence: 'Hải Phòng',
  care_stage: 'Đang chăm sóc',
  care_stage_updated_at: AT,
  created_at: AT,
  updated_at: AT,
  projects: [],
  next_tasks: [],
  call_attempts: [],
  notes_manual: [],
  contact_prefs: {},
};
// 1978 = Mậu Ngọ, nạp âm dài nhất "Thiên Thượng Hỏa": ở 360px xuống 2 dòng, ô Cung cạnh đó cao bằng.
const customers = [
  { ...base, id: 'dob-full', full_name: 'Bùi Hương Lan', dob: '1978-06-10' },
  { ...base, id: 'dob-no-year', full_name: 'Trần Thu Hà', dob: '--08-15' },
  { ...base, id: 'dob-odd', full_name: 'Lê Văn Cũ', dob: 'khoảng 1985' },
];

async function open(page: Page, customerId: string, path = `/ho-so/${customerId}`) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'dob@example.test',
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
    { uid: userId, rows: customers },
  );
  await page.goto(path);
}

async function openMemory(page: Page, customerId: string) {
  await open(page, customerId);
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();
  await expect(page.getByLabel('Họ tên')).toBeVisible();
}

/** Mọi ô (input/select/ô chỉ đọc) của Thông tin chính: ô có nhãn cùng hàng thì khung cùng đỉnh, cùng cao. */
async function expectRowsAligned(page: Page) {
  const boxes = await page.evaluate(() => {
    const card = document.querySelector('label[for]')?.closest('.flex-wrap');
    if (!card) return [];
    return [...card.querySelectorAll('label[for]')].flatMap((label) => {
      const control = document.getElementById(label.getAttribute('for') || '');
      if (!control) return [];
      const shell = control.tagName === 'INPUT' ? control.parentElement : control;
      const l = label.getBoundingClientRect();
      const c = (shell as HTMLElement).getBoundingClientRect();
      const overflow = shell ? shell.scrollWidth > shell.clientWidth : false;
      return [
        {
          name: label.textContent,
          labelTop: l.top,
          top: c.top,
          height: c.height,
          overflow,
          readOnly: control.tagName === 'OUTPUT',
        },
      ];
    });
  });
  expect(boxes.length).toBeGreaterThan(4);
  for (const a of boxes) {
    for (const b of boxes) {
      if (a === b || Math.abs(a.labelTop - b.labelTop) > 2) continue;
      expect(Math.abs(a.top - b.top), `${a.name} / ${b.name} lệch đỉnh`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.height - b.height), `${a.name} / ${b.name} lệch cao`).toBeLessThanOrEqual(1);
    }
    expect(a.overflow, `${a.name} chữ tràn khung`).toBe(false);
    // Ô nhập luôn 44px; chỉ ô chỉ đọc có chữ dài (nạp âm) mới được xuống 2 dòng.
    if (!a.readOnly) expect(a.height, `${a.name} cao 44px`).toBeLessThanOrEqual(45);
    else expect(a.height, `${a.name} tối đa 2 dòng`).toBeLessThanOrEqual(70);
  }
  const view = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(view.sw).toBeLessThanOrEqual(view.vw);
}

test('hồ sơ: đủ năm sinh → ô Tuổi, Mệnh, Cung riêng, thẳng hàng với các ô khác', async ({ page }) => {
  await openMemory(page, 'dob-full');
  const group = page.getByRole('group', { name: 'Ngày sinh' });
  await expect(group.getByRole('textbox', { name: 'Ngày sinh — ngày/tháng/năm' })).toHaveValue('10/06/1978');
  await expect(group.getByLabel('Tuổi', { exact: true })).toHaveText('48');
  await expect(group.getByLabel('Mệnh', { exact: true })).toHaveText('Thiên Thượng Hỏa');
  await expect(group.getByLabel('Cung', { exact: true })).toHaveText('Song Tử');
  // Ô chỉ đọc: không có ô nhập nào cho Tuổi/Mệnh/Cung.
  await expect(group.getByRole('textbox')).toHaveCount(1);
  // Không còn chữ phụ dưới ô Ngày sinh.
  await expect(group).not.toContainText('Mệnh Hỏa');
  await expectRowsAligned(page);
  // Thứ tự đọc: Ngày sinh → Tuổi → Mệnh → Cung → Hôn nhân.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('label[for]')].map((label) => label.textContent?.trim()),
  );
  const at = (name: string) => order.indexOf(name);
  expect(at('Ngày sinh')).toBeLessThan(at('Tuổi'));
  expect(at('Tuổi')).toBeLessThan(at('Mệnh'));
  expect(at('Mệnh')).toBeLessThan(at('Cung'));
  expect(at('Cung')).toBeLessThan(at('Hôn nhân'));
});

test('hồ sơ: thiếu năm sinh → chỉ ô Cung; ngày sinh dạng lạ → không ô phụ, vẫn thẳng hàng', async ({ page }) => {
  await openMemory(page, 'dob-no-year');
  const group = page.getByRole('group', { name: 'Ngày sinh' });
  await expect(group.getByLabel('Cung', { exact: true })).toHaveText('Sư Tử');
  await expect(group.getByLabel('Tuổi', { exact: true })).toHaveCount(0);
  await expect(group.getByLabel('Mệnh', { exact: true })).toHaveCount(0);
  await expectRowsAligned(page);

  await page.goto('/ho-so/dob-odd');
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();
  await expect(group).toContainText('Đang lưu: khoảng 1985');
  await expect(group.locator('output')).toHaveCount(0);
});

test('Thêm khách: gõ ngày sinh → ô Tuổi, Mệnh, Cung như hồ sơ', async ({ page }) => {
  await open(page, 'dob-full', '/intake');
  await page.getByRole('button', { name: 'Thêm thông tin' }).click();
  await expect(page.getByLabel('Tuổi', { exact: true })).toHaveCount(0);
  await page.getByLabel('Ngày sinh (ngày/tháng/năm)').fill('10/06/1978');
  await expect(page.getByLabel('Tuổi', { exact: true })).toHaveText('48');
  await expect(page.getByLabel('Mệnh', { exact: true })).toHaveText('Thiên Thượng Hỏa');
  await expect(page.getByLabel('Cung', { exact: true })).toHaveText('Song Tử');
  const view = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(view.sw).toBeLessThanOrEqual(view.vw);
});
