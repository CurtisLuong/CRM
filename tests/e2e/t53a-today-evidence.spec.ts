import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`T5.3a bằng chứng Booking đọc được trên thẻ khách (${colorScheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.clock.install({ time: new Date('2026-10-17T02:00:00+07:00') });
    await page.route('http://127.0.0.1:54321/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.addInitScript(() => {
      const user = {
        id: 't53a-evidence-user',
        aud: 'authenticated',
        role: 'authenticated',
        email: 't53a@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: user.id, email: user.email }));
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
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('crm_khach_hang__t53a-evidence-user', 2);
        request.onupgradeneeded = () => {
          const current = request.result;
          if (!current.objectStoreNames.contains('customers'))
            current.createObjectStore('customers', { keyPath: 'id' });
          if (!current.objectStoreNames.contains('queue'))
            current.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
          if (!current.objectStoreNames.contains('meta')) current.createObjectStore('meta', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        tx.objectStore('customers').put({
          id: 'booking-evidence',
          owner_id: 't53a-evidence-user',
          full_name: 'Chị Hường Nguyễn',
          phone: '0900000001',
          qualified_at: '2026-10-07T03:54:48.994+00:00',
          care_stage: 'Booking & Làm hồ sơ',
          care_stage_updated_at: '2026-10-07T03:54:48.994+00:00',
          booking_steps: {},
          call_attempts: [],
          next_tasks: [],
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: '2026-10-01T00:00:00.000Z' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    });
    await page.goto('/today');
    // v3 (D-023): không còn thẻ NBA riêng — bằng chứng nằm ở lưới cấp 2 của thẻ khách (nhóm SLA).
    const card = page.locator('[data-card]').filter({ hasText: 'Chị Hường Nguyễn' });
    await expect(card).toHaveAttribute('data-tone', /over|soon/);
    const facts = card.locator('dl');
    await expect(facts).toContainText('Bước hồ sơ');
    await expect(facts).toContainText('Xác nhận cư trú');
    await expect(facts).toContainText('Cập nhật bậc');
    await expect(facts).toContainText('10:54 7/10/26');
    await expect(facts).toContainText('Hạn');
    await expect(facts).toContainText('10:54 12/10/26');
    await expect(card).not.toContainText(/\[object Object\]|\d{4}-\d{2}-\d{2}T|\b\d{13}\b|booking_steps|cu_tru/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    const widths = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    await page.screenshot({ path: testInfo.outputPath(`nba-evidence-${colorScheme}.png`), fullPage: true });
  });
}
