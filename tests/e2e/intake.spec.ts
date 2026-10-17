import { expect, test } from '@playwright/test';

test('form nhập khách hiện đủ các nhóm dữ liệu và bảo vệ truy cập màn', async ({ page }) => {
  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'Thêm khách mới' })).toBeVisible();
  await expect(page.getByLabel('Họ tên *')).toBeVisible();
  await expect(page.getByLabel('Số điện thoại *')).toBeVisible();
  await expect(page.getByText('Nguồn khách', { exact: true })).toBeVisible();
  await expect(page.getByText('Nhu cầu căn hộ', { exact: true })).toBeVisible();
  await expect(page.getByText('Chăm sóc', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhập từ ảnh' })).toBeVisible();
});

test('form tiếng Việt không tràn ngang trên màn hình nhỏ', async ({ page }) => {
  await page.goto('/intake');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('cảnh báo trước khi bỏ bản nháp khi chuyển sang danh sách khách', async ({ page }) => {
  await page.goto('/intake');
  await page.getByLabel('Họ tên *').fill('Khách đang soạn');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Khách hàng', exact: true }).click();
  await expect(page).toHaveURL(/\/khach-hang$/);
});

test('intake detects same-phone near-name duplicates and requires an explicit keeper before merge', async ({
  page,
}) => {
  const userId = 't68-intake-user';
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 't68@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-t68-token',
        refresh_token: 'synthetic-t68-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(async (id) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(id)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      const store = tx.objectStore('customers');
      for (const [recordId, name, source, at] of [
        ['t68-a', 'Nguyễn Thị Mai', 'facebook_ads', '2026-10-01T00:00:00.000Z'],
        ['t68-b', 'Nguyen Thi Mai', 'referral', '2026-10-02T00:00:00.000Z'],
      ])
        store.put({
          id: recordId,
          owner_id: id,
          full_name: name,
          phone: recordId === 't68-a' ? '0912345678' : '+84 912 345 678',
          source,
          notes_manual: [{ text: recordId, at }],
          care_stage_history: [],
          next_tasks: [],
          call_attempts: [],
          created_at: at,
          updated_at: at,
        });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, userId);

  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'Có hồ sơ nghi trùng' })).toBeVisible();
  await page.getByRole('button', { name: 'So sánh' }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận gộp và lưu trữ hồ sơ còn lại' })).toBeVisible();
  await expect(page.getByText('Nguồn', { exact: true })).toHaveCount(2);
});
