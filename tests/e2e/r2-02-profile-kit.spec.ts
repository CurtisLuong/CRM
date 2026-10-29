import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const userId = 'r2-02-profile-user';
const customerId = 'r2-02-customer';
const now = new Date(2026, 9, 28, 10, 0);
const row = {
  id: customerId,
  owner_id: userId,
  full_name: 'Nguyễn Minh Anh',
  phone: '0912345678',
  care_stage: 'Đang chăm sóc',
  care_stage_updated_at: new Date(2026, 9, 27, 9).toISOString(),
  qualified_at: new Date(2026, 9, 25, 9).toISOString(),
  created_at: new Date(2026, 9, 25, 9).toISOString(),
  updated_at: new Date(2026, 9, 27, 9).toISOString(),
  care_stage_history: [{ stage: 'Đang chăm sóc', at: new Date(2026, 9, 27, 9).toISOString() }],
  call_attempts: [],
  next_tasks: [],
  notes_manual: [],
  interactions: [],
};

async function openProfile(page: Page) {
  await page.clock.install({ time: now });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r2-02@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-r2-02-token',
        refresh_token: 'synthetic-r2-02-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, customer }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
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
        tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, customer: row },
  );
  await page.goto(`/ho-so/${customerId}`);
  await expect(page.getByRole('heading', { level: 1, name: row.full_name })).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`R2-02: đầu hồ sơ kit vừa màn 360 và desktop 1280 · ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openProfile(page);
    for (const viewport of [
      { width: 360, height: 780 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const head = page.getByTestId('customer-profile').locator('header').first();
      for (const name of ['Gọi', 'Zalo', 'Ghi chú', 'Hẹn'])
        await expect(
          page.getByRole('navigation', { name: 'Hành động nhanh' }).getByRole('button', { name, exact: true }),
        ).toBeVisible();
      await expect(head.getByText('Đang chăm sóc', { exact: true }).first()).toBeVisible();
      await expect(head.getByText('SLA', { exact: false }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('R2-02: hồ sơ trong phạm vi không import component cũ ngoài ngoại lệ chung', () => {
  const files = [
    'src/features/profile/route.tsx',
    'src/features/profile/timeline.tsx',
    'src/features/profile/add-task.tsx',
    'src/features/profile/archive.tsx',
    'src/features/profile/model.ts',
  ];
  const disallowed = /from\s+['"]@\/ui['"]/;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const imports = source.match(/from\s+['"]@\/ui[^'"]*['"]/g) ?? [];
    expect(
      imports.filter(
        (line) => !['@/ui/display', '@/ui/Icon', '@/ui/BlockBoundary'].some((allowed) => line.includes(allowed)),
      ),
      file,
    ).toEqual([]);
    expect(source).not.toMatch(disallowed);
  }
});
