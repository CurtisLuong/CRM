import { expect, test } from '@playwright/test';

test('R5-02b: textarea nhiều dòng, nhãn kết quả và label mẫu tin', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const userId = 'r5-02b-e2e-user';
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
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
  });

  await page.goto('/');
  await page.evaluate(async () => {
    const userId = 'r5-02b-e2e-user';
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('customers'))
          database.createObjectStore('customers', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('queue'))
          database.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 'r5-02b-customer',
        owner_id: userId,
        full_name: 'Khách R5-02b',
        phone: '0901234567',
        qualified_at: '2026-10-01T03:00:00.000Z',
        care_stage: 'Đang chăm sóc',
        registered_at: '2026-10-01T03:00:00.000Z',
        created_at: '2026-10-01T03:00:00.000Z',
        updated_at: '2026-10-01T03:00:00.000Z',
        call_attempts: [],
        next_tasks: [],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });

  await page.goto('/thao-tac-nhanh');
  await expect(page.getByRole('heading', { name: 'Khách R5-02b' })).toBeVisible();
  // U-02: bỏ nút "Ghi cuộc gọi" trùng; ghi cuộc gọi tay qua Ghi tương tác → Đã gọi.
  await page.getByRole('button', { name: 'Ghi tương tác', exact: true }).first().click();
  await page
    .getByRole('dialog', { name: 'Ghi tương tác · Khách R5-02b' })
    .getByRole('button', { name: 'Đã gọi' })
    .click();
  const callSheet = page.getByRole('dialog', { name: 'Kết quả cuộc gọi · Khách R5-02b' });
  await expect(callSheet).toBeVisible();
  const callNote = callSheet.getByRole('textbox', { name: 'Ghi chú cuộc gọi' });
  expect((await callNote.boundingBox())?.height).toBeGreaterThan(44);
  // 4 lựa chọn chính giữ nhãn chọn nhanh của v2 (dài hơn nhãn lưu); các kết quả còn lại lấy từ CALL_RESULTS.
  for (const label of ['Nói chuyện được', 'Không nghe / không liên lạc', 'Bận, hẹn lại', 'Sai số / không phù hợp']) {
    await expect(callSheet.getByRole('radio', { name: label, exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Zalo', exact: true }).click();
  const zaloSheet = page.getByRole('dialog', { name: 'Nhắn Zalo · Khách R5-02b' });
  await expect(zaloSheet).toBeVisible();
  const message = zaloSheet.getByRole('textbox', { name: 'Nội dung tin nhắn' });
  expect((await message.boundingBox())?.height).toBeGreaterThan(44);
  await zaloSheet.locator('label[for="zalo-template-select"]').click();
  await expect(zaloSheet.getByRole('combobox', { name: 'Mẫu tin' })).toBeFocused();
});
