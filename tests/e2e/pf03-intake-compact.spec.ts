import { expect, type Page, test } from '@playwright/test';

const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;

/** Phiên giả + Supabase giả (offline IndexedDB) như các spec khác. */
async function seedSession(page: Page, userId: string) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pf03@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pf03-token',
        refresh_token: 'synthetic-pf03-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
}

async function readCustomers(page: Page, userId: string) {
  return page.evaluate(async (name) => {
    const request = indexedDB.open(name, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const get = db.transaction('customers', 'readonly').objectStore('customers').getAll();
      get.onsuccess = () => resolve(get.result as Record<string, unknown>[]);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return rows;
  }, dbName(userId));
}

test('PF-03: form chỉ hiện trường thiết yếu; tạo khách chỉ với họ tên + SĐT', async ({ page }, testInfo) => {
  const userId = `pf03-minimal-${testInfo.project.name}`;
  await seedSession(page, userId);
  await page.goto('/intake');

  // Hiện sẵn đúng các trường thiết yếu.
  await expect(page.getByLabel('Họ tên *')).toBeVisible();
  await expect(page.getByLabel('Số điện thoại *')).toBeVisible();
  await expect(page.getByText('Nguồn khách', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Kênh *')).toBeVisible();
  await expect(page.getByText('Nhu cầu căn hộ', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Dự án (có thể chọn nhiều)')).toBeVisible();
  await expect(page.getByLabel('Loại căn')).toBeVisible();
  await expect(page.getByText('Chăm sóc', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Ghi chú mới')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhập từ ảnh' })).toBeVisible();

  // Mặc định ẩn.
  await expect(page.getByLabel('Giới tính')).toHaveCount(0);
  await expect(page.getByLabel('Chiến dịch')).toHaveCount(0);
  await expect(page.getByLabel('Ghi chú đăng ký')).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Thêm thông tin' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // Mở khu: các trường ẩn hiện ra, nhãn nút đổi trạng thái.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Giới tính')).toBeVisible();
  await expect(page.getByLabel('Chiến dịch')).toBeVisible();
  await expect(page.getByLabel('Ghi chú đăng ký')).toBeVisible();

  // 360px không cuộn ngang khi khu đang mở.
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Đóng lại: không thấy trường ẩn; lưu chỉ với họ tên + SĐT vẫn được.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Giới tính')).toHaveCount(0);
  await page.getByLabel('Họ tên *').fill('Lê Văn Tối Giản');
  await page.getByLabel('Số điện thoại *').fill('0911222333');
  // Form vẫn "dirty" sau khi lưu nên cổng chặn rời nháp hỏi xác nhận — đồng ý để sang danh sách.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Lưu khách' }).click();

  await expect(page).toHaveURL(/\/khach-hang$/);
  await expect
    .poll(async () => (await readCustomers(page, userId)).find((row) => row.phone === '0911222333')?.full_name)
    .toBe('Lê Văn Tối Giản');
});

test('PF-03: chọn Giới tính trong khu mở rộng rồi đóng khu vẫn lưu được giá trị ẩn', async ({ page }, testInfo) => {
  const userId = `pf03-gender-${testInfo.project.name}`;
  await seedSession(page, userId);
  await page.goto('/intake');

  const toggle = page.getByRole('button', { name: 'Thêm thông tin' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Giới tính').selectOption('nữ');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Giới tính')).toHaveCount(0);

  await page.getByLabel('Họ tên *').fill('Phạm Thị Ẩn');
  await page.getByLabel('Số điện thoại *').fill('0911333444');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Lưu khách' }).click();

  await expect(page).toHaveURL(/\/khach-hang$/);
  await expect
    .poll(async () => (await readCustomers(page, userId)).find((row) => row.phone === '0911333444')?.gender)
    .toBe('nữ');
});

test('PF-03: sửa khách cũ — khu mặc định đóng, nhãn báo số trường đã điền', async ({ page }, testInfo) => {
  const userId = `pf03-edit-${testInfo.project.name}`;
  const customerId = `pf03-customer-${testInfo.project.name}`;
  await seedSession(page, userId);
  await page.evaluate(
    async ({ uid, id }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        tx.objectStore('customers').put({
          id,
          owner_id: uid,
          full_name: 'Nguyễn Thị Đầy Đủ',
          phone: '0911555666',
          gender: 'nữ',
          dob: '1988-08-15',
          campaign: 'TC_T10',
          care_stage: 'Đang chăm sóc',
          care_stage_updated_at: '2026-10-15T00:00:00.000Z',
          created_at: '2026-10-10T00:00:00.000Z',
          updated_at: '2026-10-15T00:00:00.000Z',
          projects: [],
          next_tasks: [],
          call_attempts: [],
          notes_manual: [],
          advanced: { life_stage: 'Mới cưới', pain_points: '' },
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, id: customerId },
  );

  await page.goto(`/intake/${customerId}`);
  await expect(page.getByLabel('Họ tên *')).toHaveValue('Nguyễn Thị Đầy Đủ');
  const toggle = page.getByRole('button', { name: 'Thêm thông tin · đã điền 4' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Giới tính')).toHaveCount(0);

  await toggle.click();
  await expect(page.getByLabel('Giới tính')).toHaveValue('nữ');
  await expect(page.getByLabel('Ngày sinh (ngày/tháng/năm)')).toHaveValue('15/08/1988');
  await expect(page.getByLabel('Chiến dịch')).toHaveValue('TC_T10');
});
