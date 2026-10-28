import { expect, test } from '@playwright/test';

const realUserId = 'dm01-real-user';
const demoUserId = 'dm01-preview';
const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;

async function seedRealDatabase(page: import('@playwright/test').Page) {
  await page.evaluate(
    async ({ name, userId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 2);
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
        const tx = db.transaction(['customers', 'queue', 'meta'], 'readwrite');
        tx.objectStore('customers').put({
          id: 'real-customer-preserved',
          owner_id: userId,
          full_name: 'Khách thật đã seed',
          phone: '0912345678',
          private_marker: 'must-stay-unchanged',
        });
        tx.objectStore('queue').add({ type: 'update', recordId: 'real-customer-preserved', payload: { note: 'seed' } });
        tx.objectStore('meta').put({ key: 'seed-marker', value: 'preserve' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { name: dbName(realUserId), userId: realUserId },
  );
}

async function readDatabase(page: import('@playwright/test').Page, userId: string) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<{ customers: unknown[]; queue: unknown[]; meta: unknown[] }>((resolve, reject) => {
      const tx = db.transaction(['customers', 'queue', 'meta']);
      const output = { customers: [] as unknown[], queue: [] as unknown[], meta: [] as unknown[] };
      for (const storeName of ['customers', 'queue', 'meta'] as const) {
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => {
          output[storeName] = request.result;
          if (Object.values(output).every((rows) => rows.length || storeName === 'meta')) {
            // The transaction completion below resolves after each request has populated its result.
          }
        };
        request.onerror = () => reject(request.error);
      }
      tx.oncomplete = () => resolve(output);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return result;
  }, dbName(userId));
}

test('demo giữ dữ liệu local, chặn mạng, sống qua reload và xoá riêng DB demo khi thoát', async ({ page }) => {
  // Giờ cố định: nhóm "Hẹn gọi còn lại hôm nay" không phụ thuộc lúc chạy test.
  await page.clock.install({ time: new Date(2026, 9, 28, 10, 0) });
  await page.goto('/today');
  await expect(page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' })).toBeVisible();
  await seedRealDatabase(page);
  const realBefore = await readDatabase(page, realUserId);
  const requestsDuringDemo: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.port === '54321' || !['localhost', '127.0.0.1'].includes(url.hostname)) requestsDuringDemo.push(url.href);
  });

  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await expect(page.getByText('Dữ liệu mẫu — không lưu lên máy chủ')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hôm nay', exact: true })).toBeVisible();

  const groups = [
    'Đến giờ / quá giờ hẹn gọi',
    'Quá hạn mức SLA phễu',
    'Việc đến hạn hôm nay',
    'Hẹn gọi còn lại hôm nay',
    'Khách mới chưa gọi',
    'Gọi lại khách chưa liên lạc được',
    'Đã nói chuyện — chờ phân loại',
    'Cuộc gọi chưa ghi chú',
    'Khách nóng đang nguội',
    'Khách đang chăm lâu chưa liên hệ',
    'Chưa có việc tiếp theo',
  ];
  for (const group of groups) await expect(page.locator(`section[aria-label="${group}"]`)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Mở Gia Hân · Khách mới' }).click();
  await expect(page.getByRole('heading', { name: 'Gia Hân · Khách mới' })).toBeVisible();
  await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nội dung ghi chú' }).fill('Đã xem thử dữ liệu mẫu.');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByLabel('Đã biết').getByText('Đã xem thử dữ liệu mẫu.')).toBeVisible();

  const demoAfterNote = await readDatabase(page, demoUserId);
  const demoCustomer = demoAfterNote.customers.find((row) => (row as { id?: string }).id === 'dm01-05') as
    | { notes_manual?: { text: string }[] }
    | undefined;
  expect(demoCustomer?.notes_manual?.some((note) => note.text === 'Đã xem thử dữ liệu mẫu.')).toBe(true);
  expect(demoAfterNote.queue.length).toBeGreaterThan(0);
  expect(await readDatabase(page, realUserId)).toEqual(realBefore);
  expect(requestsDuringDemo).toEqual([]);

  await page.reload();
  await expect(page.getByText('Dữ liệu mẫu — không lưu lên máy chủ')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gia Hân · Khách mới', exact: true })).toBeVisible();
  expect(await readDatabase(page, demoUserId)).toEqual(demoAfterNote);
  expect(requestsDuringDemo).toEqual([]);

  await page.getByRole('button', { name: 'Thoát dữ liệu mẫu' }).first().click();
  await expect(page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' })).toBeVisible();
  expect(
    await page.evaluate(
      async (name) => (await indexedDB.databases()).some((database) => database.name === name),
      dbName(demoUserId),
    ),
  ).toBe(false);
  expect(await readDatabase(page, realUserId)).toEqual(realBefore);
});
