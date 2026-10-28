import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const userId = 'r2-01-customer-list';
const customer = {
  id: 'r2-01-customer',
  owner_id: userId,
  full_name: 'Khách R2-01',
  phone: '0912345678',
  care_stage: 'Đang chăm sóc',
  qualified_at: '2026-10-20T09:00:00.000Z',
  created_at: '2026-10-20T09:00:00.000Z',
  registered_at: '2026-10-20T09:00:00.000Z',
  updated_at: '2026-10-20T09:00:00.000Z',
  projects: ['Dự án R2'],
};

async function open(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r2-01@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-r2-01-token',
        refresh_token: 'synthetic-r2-01-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(async (row) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(row.owner_id)}`, 2);
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
  }, customer);
  await page.goto('/khach-hang');
  await expect(page.getByRole('textbox', { name: 'Tìm khách' })).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`R2-01 ${theme}: danh sách dùng component kit và không tràn ngang`, async ({ page }, info) => {
    test.skip(!['phone-360', 'desktop-1280'].includes(info.project.name), 'Kiểm ở 360px và 1280px');
    await open(page, theme);
    await expect(page.getByRole('group', { name: 'Nhóm khách' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Lọc/ })).toBeVisible();
    if (info.project.name === 'desktop-1280') {
      await expect(page.getByRole('table', { name: 'Danh sách khách' })).toBeVisible();
      await expect(page.getByRole('row', { name: /Khách R2-01/ })).toBeVisible();
    } else {
      await expect(page.locator('[data-card]').filter({ hasText: 'Khách R2-01' })).toBeVisible();
    }
    const widths = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  });
}

test('R2-01: feature không import UI cũ ngoài Icon', () => {
  const source = ['src/features/customers/route.tsx', 'src/features/customers/CalendarRange.tsx']
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  const imports = source.match(/from\s+['"]@\/ui(?:\/[^'"]+)?['"]/g) ?? [];
  expect(
    imports.filter(
      (entry) => !['@/ui/Icon', '@/ui/display', '@/ui/BlockBoundary'].some((allowed) => entry.includes(allowed)),
    ),
  ).toEqual([]);
});
