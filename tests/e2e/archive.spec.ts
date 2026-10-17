import { expect, type Page, test } from '@playwright/test';

const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;

async function readStore(page: Page, userId: string, store: 'customers' | 'queue') {
  return page.evaluate(
    async ({ name, store }) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const get = db.transaction(store, 'readonly').objectStore(store).getAll();
        get.onsuccess = () => resolve(get.result as Record<string, unknown>[]);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return rows;
    },
    { name: dbName(userId), store },
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`archive hides a customer softly and restore brings it back (${theme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    const userId = `t510-${testInfo.project.name}-${theme}`;
    const customerId = `archive-${testInfo.project.name}-${theme}`;
    await page.route('http://127.0.0.1:54321/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.addInitScript((userId) => {
      const user = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'archive@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-archive-token',
          refresh_token: 'synthetic-archive-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    }, userId);
    await page.goto('/');
    await page.evaluate(
      async ({ name, userId, customerId }) => {
        const request = indexedDB.open(name, 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['customers', 'meta'], 'readwrite');
          const base = {
            owner_id: userId,
            care_stage: 'Đang chăm sóc',
            qualified_at: '2026-10-10T00:00:00.000Z',
            created_at: '2026-10-10T00:00:00.000Z',
            updated_at: '2026-10-15T00:00:00.000Z',
            next_call_at: '2026-10-17T02:00:00.000Z',
            next_call_end: '2026-10-17T04:00:00.000Z',
          };
          tx.objectStore('customers').put({
            ...base,
            id: customerId,
            full_name: 'Khách Thử Lưu Trữ',
            phone: '0909000111',
            notes_manual: [{ text: 'Ghi chú giữ lại', at: '2026-10-16T04:00:00.000Z', x_import_id: 'keep' }],
            x_future: { keep: true },
          });
          tx.objectStore('customers').put({
            ...base,
            id: `${customerId}-other`,
            full_name: 'Khách Đang Chăm',
            phone: '0909000222',
          });
          tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      { name: dbName(userId), userId, customerId },
    );

    await page.goto(`/ho-so/${customerId}`);
    await expect(page.getByRole('heading', { name: 'Khách Thử Lưu Trữ' })).toBeVisible();
    await page.getByRole('button', { name: 'Lưu trữ khách…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Lưu trữ khách Khách Thử Lưu Trữ?' });
    await expect(dialog.getByText(/Ghi chú, cuộc gọi, lịch sử và tài liệu được giữ nguyên/)).toBeVisible();
    await testInfo.attach(`archive-confirm-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    await dialog.getByRole('button', { name: 'Lưu trữ khách', exact: true }).click();
    await expect(page.getByText(/Khách đã lưu trữ ngày/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gọi' })).toBeDisabled();

    const [archived] = (await readStore(page, userId, 'customers')).filter((c) => c.id === customerId);
    expect(archived.archived_at).toEqual(expect.any(String));
    expect(archived.x_future).toStrictEqual({ keep: true });
    expect(archived.notes_manual).toStrictEqual([
      { text: 'Ghi chú giữ lại', at: '2026-10-16T04:00:00.000Z', x_import_id: 'keep' },
    ]);
    const ops = (await readStore(page, userId, 'queue')).filter((op) => op.recordId === customerId);
    for (const op of ops) expect(op.type).not.toBe('delete');

    for (const path of ['/khach-hang', '/today', '/cong-viec']) {
      await page.goto(path);
      await expect(page.getByText('Khách Đang Chăm').first()).toBeVisible();
      await expect(page.getByText('Khách Thử Lưu Trữ')).toHaveCount(0);
    }

    await page.goto('/khach-hang/luu-tru');
    await expect(
      page.getByTestId('archived-customers').getByRole('heading', { name: 'Khách đã lưu trữ' }),
    ).toBeVisible();
    await expect(page.getByText('Khách Đang Chăm')).toHaveCount(0);
    await testInfo.attach(`archived-list-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByRole('button', { name: 'Khôi phục Khách Thử Lưu Trữ' }).click();
    await expect(page.getByText('Chưa có khách nào được lưu trữ')).toBeVisible();

    const [restored] = (await readStore(page, userId, 'customers')).filter((c) => c.id === customerId);
    expect(restored.archived_at).toBeNull();
    expect(restored.x_future).toStrictEqual({ keep: true });
    await page.goto('/khach-hang');
    await expect(page.getByText('Khách Thử Lưu Trữ').first()).toBeVisible();
  });
}
