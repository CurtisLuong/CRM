import { expect, test } from '@playwright/test';

test('app opens Today and exposes the first-step queue or a clear sign-in state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header h1')).toHaveText('Hôm nay');
  await expect(page.getByRole('heading', { name: 'Sổ Khách v2' })).toBeVisible();
  await expect(
    page.getByText(/Đăng nhập để mở hàng đợi khách của bạn|Chưa cấu hình kết nối|Next Best Action/),
  ).toBeVisible();
  const metrics = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth }));
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.width);
});

test('Hôm nay dời hàng loạt việc P2 giữ hạn gốc và có thể hoàn tác', async ({ page }) => {
  const fixedNow = new Date(2026, 9, 16, 9, 55);
  await page.clock.install({ time: fixedNow });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const userId = 't42-today-user';
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 't42@example.test',
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
    const userId = 't42-today-user';
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
      request.onupgradeneeded = () => {
        const current = request.result;
        if (!current.objectStoreNames.contains('customers')) current.createObjectStore('customers', { keyPath: 'id' });
        if (!current.objectStoreNames.contains('queue'))
          current.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        if (!current.objectStoreNames.contains('meta')) current.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const due = new Date(2026, 9, 17, 0, 0, 0, 0).toISOString();
    const old = new Date(2026, 8, 1, 10, 0, 0, 0).toISOString();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      for (let i = 1; i <= 3; i++)
        tx.objectStore('customers').put({
          id: `capacity-${i}`,
          owner_id: userId,
          full_name: `Khách P2 ${i}`,
          phone: `090000000${i}`,
          qualified_at: old,
          care_stage: 'Đang chăm sóc',
          care_stage_updated_at: old,
          sla_anchor_at: new Date(2026, 9, 16, 9, 0).toISOString(),
          interest_level: 40,
          call_attempts: [],
          next_call_at: null,
          next_tasks: [
            { at: `task-${i}`, text: `Việc cả ngày ${i}`, kind: 'docs', due, due_allday: true, x_keep: `unknown-${i}` },
          ],
        });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: old });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto('/today');
  const move = page.getByRole('button', { name: /Dời \d+ việc P2 sang khung kế/ });
  await expect(move).toBeVisible();
  await move.click();
  await expect(page.getByText(/Đã dời \d+ việc/)).toBeVisible();
  const afterMove = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('crm_khach_hang__t42-today-user', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('customers');
    const all = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const request = tx.objectStore('customers').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return all.map((customer) => (customer.next_tasks as Record<string, unknown>[])[0]);
  });
  const moved = afterMove.filter((task) => task.due_original);
  expect(moved.length).toBeGreaterThan(0);
  expect(moved.every((task) => task.due_original === new Date(2026, 9, 17, 0, 0).toISOString())).toBe(true);
  expect(moved.every((task) => task.due === new Date(2026, 9, 18, 9, 0).toISOString())).toBe(true);
  expect(moved.every((task) => task.snoozed_reason === 'Em bận' && task.due !== task.due_original && task.x_keep)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('crm_khach_hang__t42-today-user', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const task = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const request = db.transaction('customers').objectStore('customers').getAll();
          request.onsuccess = () =>
            resolve(request.result.map((customer) => (customer.next_tasks as Record<string, unknown>[])[0]));
          request.onerror = () => reject(request.error);
        });
        db.close();
        return task.every(
          (entry) =>
            !entry.due_original && !entry.snoozed_reason && entry.due === new Date(2026, 9, 17, 0, 0).toISOString(),
        );
      }),
    )
    .toBe(true);
});
