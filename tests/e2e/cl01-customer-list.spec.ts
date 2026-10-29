import { expect, type Page, test } from '@playwright/test';

// CL-01 — đầu danh sách khách: chip nhóm không số, hàng đếm + Xoá lọc, ngày đăng ký có lịch,
// sắp xếp gọn, nhớ nhóm khi quay lại, khách nhóm không SLA. Giờ cố định 22/10/2026 09:30.
const userId = 'cl01-e2e-user';
const colleagueId = 'cl01-colleague';
const NOW = new Date('2026-10-22T09:30:00+07:00');
const pad = (n: number) => String(n).padStart(2, '0');
const at = (day: number, h: number, m = 0) => `2026-10-${pad(day)}T${pad(h)}:${pad(m)}:00+07:00`;

type Seed = Record<string, unknown> & { id: string; full_name: string; phone: string };

const owner = (index: number, name: string, registered: string, stage = 'Đang chăm sóc'): Seed => ({
  id: `cl01-p${index}`,
  owner_id: userId,
  full_name: name,
  phone: `09150000${pad(index)}`,
  care_stage: stage,
  qualified_at: registered,
  created_at: registered,
  registered_at: registered,
});

const potential: Seed[] = [
  owner(1, 'Khách Tiềm năng 01', at(22, 8)),
  owner(2, 'Khách Tiềm năng 02', at(21, 10)),
  owner(3, 'Khách Tiềm năng 03', at(20, 9), 'Xem dự án'),
  owner(4, 'Khách Tiềm năng 04', at(15, 9)),
  owner(5, 'Khách Tiềm năng 05', at(10, 9)),
];

const lead = (index: number, name: string, registered: string, over: Record<string, unknown> = {}): Seed => ({
  id: `cl01-l${index}`,
  owner_id: userId,
  full_name: name,
  phone: `09160000${pad(index)}`,
  care_stage: 'Đăng kí mới',
  created_at: registered,
  registered_at: registered,
  ...over,
});

const leads: Seed[] = [
  lead(1, 'Khách Mới A', at(22, 7)),
  lead(2, 'Khách Mới B', at(21, 7)),
  lead(3, 'Khách Mới C', at(15, 7)),
  lead(4, 'Khách Mới D', at(20, 7), { call_attempts: [{ at: at(20, 9), result: 'talked' }] }),
  lead(5, 'Khách Mới E', at(10, 7), { disqualified_at: at(11, 9) }),
];

// Đồng nghiệp: quá SLA 5 ngày + quên gọi → không được ghim / tô đỏ ở danh sách của tôi (L8).
const colleague: Seed = {
  id: colleagueId,
  owner_id: colleagueId,
  full_name: 'Khách Đồng Nghiệp',
  phone: '0917000001',
  care_stage: 'Đang chăm sóc',
  qualified_at: at(1, 9),
  created_at: at(1, 9),
  registered_at: at(1, 9),
  care_stage_updated_at: '2026-09-27T09:30:00+07:00',
  next_call_at: at(21, 7),
  next_call_end: at(21, 8),
  call_attempts: [],
};

async function open(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: theme });
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'cl01@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-cl01-token',
        refresh_token: 'synthetic-cl01-refresh',
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
    { uid: userId, rows: [...potential, ...leads, colleague] },
  );
  await page.goto('/khach-hang');
  await expect(page.getByRole('textbox', { name: 'Tìm khách' })).toBeVisible();
}

const sheetOf = (page: Page) => page.getByRole('dialog', { name: /Lọc/ });
const cardOf = (page: Page, name: string) => page.locator(`[data-card]:has(button[aria-label="Mở ${name}"])`);
const countText = (page: Page, count: number) => page.getByText(`${count} khách`, { exact: true });

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Bộ lọc/ }).click();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

async function closeFilters(page: Page, count: number) {
  const sheet = sheetOf(page);
  await sheet.getByRole('button', { name: `Xem ${count} khách` }).click();
  await expect(sheet).toBeHidden();
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('CL-01: chip không số, hàng phễu + đếm + Xoá lọc, ngày đăng ký có lịch, sắp xếp gọn, nhớ nhóm', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone-390', 'CL-01 kiểm ở 360 và 1280');
  await open(page);

  // L1 — đúng 3 chip nhóm, không số.
  const potentialChip = page.getByRole('button', { name: 'Tiềm năng', exact: true });
  await expect(potentialChip).toHaveAttribute('aria-pressed', 'true');
  await expect(potentialChip).toHaveText('Tiềm năng');
  await expect(page.getByRole('button', { name: 'Khách mới', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Khách nhóm', exact: true })).toBeVisible();

  // L2 — một hàng: phễu · N khách · (Xoá lọc khi khác mặc định).
  await expect(page.getByRole('button', { name: /^Bộ lọc/ })).toBeVisible();
  await expect(countText(page, 5)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toHaveCount(0);
  await noHorizontalScroll(page);

  // L5 + L6 — bộ lọc trong sheet: "Bậc chăm sóc" có nhánh Nuôi dài hạn; sắp xếp 3 hàng gọn.
  const sheet = await openFilters(page);
  await expect(sheet.getByLabel('Lọc bậc chăm sóc')).toBeVisible();
  await expect(sheet.getByRole('option', { name: 'Tất cả bậc chăm sóc' })).toBeAttached();
  await expect(sheet.getByRole('option', { name: /↳ Nuôi dài hạn/ })).toBeAttached();
  await expect(sheet.getByText(/Ba tầng:/)).toHaveCount(0);
  const sortRow = sheet.getByRole('button', { name: 'Ngày đăng ký: Mới nhất' });
  await expect(sortRow).toHaveAttribute('aria-pressed', 'true');
  const sortBox = await sortRow.boundingBox();
  expect(sortBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(sheet.getByRole('button', { name: 'Lần tương tác: Chưa tương tác trước' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Tên: A–Z' })).toBeVisible();
  // Đổi sắp xếp không làm hiện "Xoá lọc" (Curtis chọn: chỉ tính bộ lọc).
  await sheet.getByRole('button', { name: 'Tên: A–Z' }).click();
  await expect(sheet.getByRole('button', { name: 'Tên: Z–A' })).toBeVisible();
  await closeFilters(page, 5);
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toHaveCount(0);
  await openFilters(page);
  await sheet.getByRole('button', { name: 'Tên: Z–A' }).click();
  await expect(sheet.getByRole('button', { name: 'Tên: A–Z' })).toBeVisible();
  await closeFilters(page, 5);

  // L4 — preset Hôm qua.
  await openFilters(page);
  await expect(sheet.getByLabel('Lọc ngày đăng ký')).toBeVisible();
  await sheet.getByLabel('Lọc ngày đăng ký').selectOption('yesterday');
  await expect(sheet.getByRole('button', { name: 'Xem 1 khách' })).toBeVisible();
  await closeFilters(page, 1);
  await expect(countText(page, 1)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toBeVisible();

  // L4 — Tuỳ chọn: mở lịch, chọn một khoảng, Huỷ giữ lựa chọn cũ.
  await openFilters(page);
  await sheet.getByLabel('Lọc ngày đăng ký').selectOption('custom');
  const day10 = sheet.getByRole('button', { name: 'Chọn 10/10/2026' });
  await expect(day10).toBeVisible();
  const dayBox = await day10.boundingBox();
  expect(dayBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(dayBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  await day10.click();
  await sheet.getByRole('button', { name: 'Chọn 15/10/2026' }).click();
  await expect(sheet.getByText('10/10 – 15/10', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Huỷ' }).click();
  await expect(sheet.getByRole('button', { name: 'Xem 1 khách' })).toBeVisible();
  await closeFilters(page, 1);
  await expect(countText(page, 1)).toBeVisible();

  // L4 — Xác nhận mới áp dụng; khoảng gồm trọn cả hai ngày.
  await openFilters(page);
  await sheet.getByLabel('Lọc ngày đăng ký').selectOption('custom');
  await sheet.getByRole('button', { name: 'Chọn 10/10/2026' }).click();
  await sheet.getByRole('button', { name: 'Chọn 15/10/2026' }).click();
  await sheet.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(sheet.getByRole('button', { name: 'Xem 2 khách' })).toBeVisible();
  // Chỗ hiển thị ghi ngày kiểu Việt Nam, không ISO.
  await expect(sheet.locator('option[value="custom"]')).toHaveText('10/10 – 15/10');
  await closeFilters(page, 2);
  await expect(countText(page, 2)).toBeVisible();

  // L3 — Xoá lọc ở hàng đếm: về mặc định của nhóm, giữ ô tìm + sắp xếp.
  await page.getByRole('button', { name: 'Xoá lọc' }).click();
  await expect(countText(page, 5)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toHaveCount(0);
  await openFilters(page);
  await sheet.getByLabel('Lọc bậc chăm sóc').selectOption('Xem dự án');
  await expect(sheet.getByRole('button', { name: 'Xem 1 khách' })).toBeVisible();
  await closeFilters(page, 1);
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tìm khách' }).fill('Tiềm năng');
  await expect(countText(page, 1)).toBeVisible();
  // Ô tìm không tính vào "Xoá lọc".
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toBeVisible();
  await page.getByRole('button', { name: 'Xoá lọc' }).click();
  await expect(countText(page, 5)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Tìm khách' })).toHaveValue('Tiềm năng');

  // L3 — Khách mới mặc định "Trong phễu" → chưa có Xoá lọc.
  await page.getByRole('button', { name: 'Khách mới', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Khách mới', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(countText(page, 4)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toHaveCount(0);

  // L7 — Khách mới + "Chưa gọi" + ô tìm; mở hồ sơ rồi quay lại vẫn đúng chỗ.
  await openFilters(page);
  await sheet.getByLabel('Lọc trạng thái').selectOption('new');
  await expect(sheet.getByRole('button', { name: 'Xem 3 khách' })).toBeVisible();
  await closeFilters(page, 3);
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Tìm khách' });
  await search.fill('0916000001');
  await expect(countText(page, 1)).toBeVisible();
  await cardOf(page, 'Khách Mới A').getByRole('button', { name: 'Mở Khách Mới A' }).click();
  await expect(page).toHaveURL(/\/khach-hang\/cl01-l1$/);
  await page.getByRole('button', { name: 'Mở hồ sơ đầy đủ' }).click();
  await expect(page).toHaveURL(/\/ho-so\/cl01-l1$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/khach-hang\/cl01-l1$/);
  await expect(page.getByRole('button', { name: 'Mở hồ sơ đầy đủ' })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('button', { name: 'Khách mới', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('0916000001');
  await expect(countText(page, 1)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá lọc' })).toBeVisible();
  await openFilters(page);
  await expect(sheet.getByLabel('Lọc trạng thái')).toHaveValue('new');
  await closeFilters(page, 1);

  // L8 — khách đồng nghiệp không ghim / không báo quá SLA.
  await page.getByRole('button', { name: 'Khách nhóm', exact: true }).click();
  await search.fill('Đồng Nghiệp');
  const colleagueCard = cardOf(page, 'Khách Đồng Nghiệp');
  await expect(colleagueCard).toBeVisible();
  await expect(colleagueCard).not.toContainText('Quá SLA');
  await expect(colleagueCard).not.toHaveAttribute('data-tone', 'over');
  await noHorizontalScroll(page);

  const shot = info.outputPath(`cl01-list-${info.project.name}-light.png`);
  await page.screenshot({ path: shot });
  await info.attach('cl01-list-light', { path: shot, contentType: 'image/png' });
});

test('CL-01: lịch Tuỳ chọn dùng được ở giao diện tối', async ({ page }, info) => {
  test.skip(info.project.name === 'phone-390', 'CL-01 kiểm ở 360 và 1280');
  await open(page, 'dark');

  await expect(page.getByRole('button', { name: 'Tiềm năng', exact: true })).toBeVisible();
  await expect(countText(page, 5)).toBeVisible();
  const sheet = await openFilters(page);
  await sheet.getByLabel('Lọc ngày đăng ký').selectOption('custom');
  const day = sheet.getByRole('button', { name: 'Chọn 10/10/2026' });
  await expect(day).toBeVisible();
  const box = await day.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await day.click();
  await sheet.getByRole('button', { name: 'Chọn 15/10/2026' }).click();
  await expect(sheet.getByText('10/10 – 15/10', { exact: true })).toBeVisible();
  await noHorizontalScroll(page);

  const shot = info.outputPath(`cl01-calendar-${info.project.name}-dark.png`);
  await page.screenshot({ path: shot });
  await info.attach('cl01-calendar-dark', { path: shot, contentType: 'image/png' });
});
