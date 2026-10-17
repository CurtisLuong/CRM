import { expect, test } from '@playwright/test';

test('Tệp retarget luôn loại khách không liên hệ và có thể lưu điều kiện', async ({ page }, testInfo) => {
  const userId = `retarget-${testInfo.project.name}`;
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'retarget@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-retarget-token',
        refresh_token: 'synthetic-retarget-refresh',
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
      tx.objectStore('customers').put({
        id: 'retarget-ok',
        owner_id: id,
        full_name: 'Khách phù hợp',
        phone: '0901111111',
        apt_type: '2N-2WC',
        projects: ['Dự án kiểm thử'],
        interests: [
          {
            id: 'i1',
            project: 'Dự án kiểm thử',
            apt_type: '2N',
            budget_max: 2_000_000_000,
            status: 'open',
            timeline: '6 tháng',
          },
        ],
        contact_prefs: { do_not_contact: false },
        next_tasks: [],
        call_attempts: [],
        interactions: [],
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-16T00:00:00.000Z',
      });
      tx.objectStore('customers').put({
        id: 'retarget-dnc',
        owner_id: id,
        full_name: 'Khách không liên hệ',
        phone: '0902222222',
        apt_type: '2N',
        contact_prefs: { do_not_contact: true, dnc_reason: 'Đã yêu cầu' },
        next_tasks: [],
        call_attempts: [],
        interactions: [],
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-16T00:00:00.000Z',
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, userId);

  await page.goto('/khach-hang/retarget');
  await expect(page.getByRole('heading', { name: 'Tệp & Retarget' })).toBeVisible();
  await expect(page.getByText('Khách phù hợp', { exact: true })).toBeVisible();
  await expect(page.getByText('Khách không liên hệ')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Loại căn', exact: true }).fill('2N');
  await page.getByLabel('Tên tệp').fill('Tệp căn 2N');
  await page.getByRole('button', { name: 'Lưu tệp' }).click();
  await expect(page.getByText('Tệp căn 2N')).toBeVisible();
  await expect(page.getByText(/Catalog hiện không cung cấp mốc xác minh giá\/tồn/)).toBeVisible();
});
