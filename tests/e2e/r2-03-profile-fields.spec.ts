import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`R2-03: ô hồ sơ dùng TextField kit, không cuộn ngang (${theme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    const userId = `r203-${testInfo.project.name}-${theme}`;
    const customerId = `r203-customer-${testInfo.project.name}-${theme}`;
    await page.route('http://127.0.0.1:54321/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.addInitScript((uid) => {
      const user = {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'r203@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-r203-token',
          refresh_token: 'synthetic-r203-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    }, userId);
    await page.goto('/');
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
            full_name: 'Nguyễn Thị Hưởng',
            phone: '0901234567',
            care_stage: 'Đang chăm sóc',
            created_at: '2026-10-10T00:00:00.000Z',
            updated_at: '2026-10-15T00:00:00.000Z',
            projects: [],
            next_tasks: [],
            call_attempts: [],
            notes_manual: [],
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
    await page.goto(`/ho-so/${customerId}`);
    await expect(page.getByRole('heading', { name: 'Nguyễn Thị Hưởng' })).toBeVisible();
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    const name = page.getByRole('textbox', { name: 'Họ tên' });
    await expect(name).toBeVisible();
    await expect(name).toHaveClass(/text-body/);
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}
