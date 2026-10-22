import { expect, type Page, test } from '@playwright/test';

// CL-03 (Curtis 2026-10-22): hồ sơ khách gọn — ô trống ẩn sau "Bổ sung", ngày sinh + tuổi/mệnh/cung
// lên Thông tin chính, ô ngắn 2 cột; Nhu cầu theo đợt + Người cùng quyết định sang tab Nhu cầu & căn.
// Giờ cố định 22/10/2026, dữ liệu giả, Supabase giả 127.0.0.1.
const userId = 'cl03-e2e-user';
const customerId = 'cl03-customer';
const NOW = new Date(2026, 9, 22, 9, 30);
const AT = NOW.toISOString();

const customer = {
  id: customerId,
  owner_id: userId,
  full_name: 'Nguyễn Thị Hưởng',
  phone: '0901234567',
  gender: 'Nữ',
  marital_status: 'Độc thân',
  occupation: 'Giáo viên',
  care_stage: 'Đang chăm sóc',
  care_stage_updated_at: AT,
  qualified_at: AT,
  created_at: AT,
  updated_at: AT,
  projects: [],
  next_tasks: [],
  call_attempts: [],
  notes_manual: [],
  contact_prefs: {},
};

const dbName = `crm_khach_hang__${encodeURIComponent(userId)}`;

async function readCustomer(page: Page) {
  return page.evaluate(
    async ({ name, id }) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const get = db.transaction('customers', 'readonly').objectStore('customers').get(id);
        get.onsuccess = () => resolve(get.result as Record<string, unknown>);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return row;
    },
    { name: dbName, id: customerId },
  );
}

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
      email: 'cl03@example.test',
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
  await page.goto(`/ho-so/${customerId}`);
  await expect(page.getByRole('heading', { level: 1, name: customer.full_name })).toBeVisible();
}

const noHorizontalScroll = async (page: Page) => {
  const view = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(view.sw).toBeLessThanOrEqual(view.vw);
};

test('CL-03: ô trống ẩn sau Bổ sung, ngày sinh ra tuổi/mệnh/cung, nhu cầu theo đợt ở tab riêng', async ({
  page,
}, testInfo) => {
  await open(page);
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();

  // L2: khách có Giới tính, SĐT, Hôn nhân nhưng thiếu Thu nhập, Nơi ở, Ngày sinh → ô trống không hiện.
  await expect(page.getByLabel('Số điện thoại')).toHaveValue(customer.phone);
  await expect(page.getByLabel('Giới tính')).toHaveValue('Nữ');
  await expect(page.getByLabel('Hôn nhân')).toHaveValue('Độc thân');
  await expect(page.getByLabel('Thu nhập')).toHaveCount(0);
  await expect(page.getByLabel('Nơi ở')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Ngày sinh' })).toHaveCount(0);

  const supplement = page.getByRole('button', { name: /^Bổ sung/ });
  await expect(supplement).toBeVisible();
  await expect(supplement).toHaveAttribute('aria-expanded', 'false');
  await supplement.click();
  await expect(supplement).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Thu nhập')).toBeVisible();
  await expect(page.getByLabel('Nơi ở')).toBeVisible();
  const dobGroup = page.getByRole('group', { name: 'Ngày sinh' });
  await expect(dobGroup).toBeVisible();
  // Ô dài chiếm cả hàng: Nơi ở rộng hơn hẳn ô ngắn SĐT.
  const phoneWidth = (await page.getByLabel('Số điện thoại').boundingBox())?.width || 0;
  const residenceWidth = (await page.getByLabel('Nơi ở').boundingBox())?.width || 0;
  expect(residenceWidth).toBeGreaterThan(phoneWidth * 1.5);

  // L3: 15/08/1985 → 41 tuổi, Mệnh Kim (+ nạp âm), Cung Sư Tử; lưu dob + menh + cung.
  const dobInput = dobGroup.getByRole('textbox', { name: 'Ngày sinh — ngày/tháng/năm' });
  await dobInput.fill('15/08/1985');
  await dobInput.press('Tab');
  await expect(page.getByText('Đã lưu ngày sinh', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readCustomer(page)).dob).toBe('1985-08-15');
  const saved = await readCustomer(page);
  expect(saved).toMatchObject({
    dob: '1985-08-15',
    menh: 'Mệnh Kim — Hải Trung Kim (Ất Sửu, 1985 AL)',
    cung: 'Sư Tử',
  });
  await expect(dobGroup).toContainText('41 tuổi');
  await expect(dobGroup).toContainText('Mệnh Kim');
  await expect(dobGroup).toContainText('Hải Trung Kim');
  await expect(dobGroup).toContainText('Cung Sư Tử');
  // Không hiện ISO / mã lưu.
  await expect(dobGroup).not.toContainText('1985-08-15');

  // L3: đổi sang 15/08 không năm → không tuổi/mệnh, vẫn có cung; menh null.
  await dobInput.fill('15/08');
  await dobInput.press('Tab');
  await expect
    .poll(async () => {
      const row = await readCustomer(page);
      return { dob: row.dob, menh: row.menh, cung: row.cung };
    })
    .toEqual({ dob: '--08-15', menh: null, cung: 'Sư Tử' });
  await expect(dobGroup).not.toContainText('41 tuổi');
  await expect(dobGroup).not.toContainText('Mệnh Kim');
  await expect(dobGroup).toContainText('Cung Sư Tử');

  // L4: ô ngắn 2 ô một hàng ở 360px; Giới tính và SĐT cùng hàng; không cuộn ngang.
  const phoneBox = await page.getByLabel('Số điện thoại').boundingBox();
  const genderBox = await page.getByLabel('Giới tính').boundingBox();
  expect(phoneBox, 'SĐT phải hiện').not.toBeNull();
  expect(genderBox, 'Giới tính phải hiện').not.toBeNull();
  expect(Math.abs((phoneBox?.y ?? -999) - (genderBox?.y ?? 999))).toBeLessThanOrEqual(2);
  await noHorizontalScroll(page);

  // L5: Nhu cầu theo đợt + Người cùng quyết định chỉ hiện sau khi mở "Nâng cao" của tab Nhu cầu & căn.
  await page.getByRole('tab', { name: 'Nhu cầu & căn' }).click();
  await expect(page.getByText('Nhu cầu theo đợt', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Dự án quan tâm mới')).toHaveCount(0);
  const needsAdvanced = page.getByRole('button', { name: 'Nâng cao' });
  await expect(needsAdvanced).toHaveAttribute('aria-expanded', 'false');
  await needsAdvanced.click();
  await expect(needsAdvanced).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Nhu cầu theo đợt', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Dự án quan tâm mới')).toBeVisible();
  await expect(page.getByLabel('Tên người cùng quyết định')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm đợt' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm người' })).toBeVisible();
  await noHorizontalScroll(page);

  // Một ảnh tối cho báo cáo (chế độ sáng đã kiểm ở trên).
  await page.getByRole('tab', { name: 'Trí nhớ' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await dobGroup.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath(`cl03-profile-compact-dark-${testInfo.project.name}.png`) });
});
