import { expect, type Page, test } from '@playwright/test';

const userId = 'u05d-need-priority-user';
const at = new Date(2026, 9, 31, 9, 0).toISOString();
const rows = [
  { id: 'u05d-missing-type', full_name: 'Khách thiếu loại căn U05d', apt_type: null, projects: ['NOXH Tràng Duệ'] },
  { id: 'u05d-short', full_name: 'Khách nhu cầu ngắn U05d', apt_type: '3N-2WC', projects: ['Vin TC'] },
  {
    id: 'u05d-long-project',
    full_name: 'Khách dự án dài U05d',
    apt_type: '3N-2WC',
    projects: ['Khu đô thị NOXH Tràng Duệ Hải Phòng với đầy đủ tiện ích và kết nối thuận tiện'],
  },
  { id: 'u05d-missing-both', full_name: 'Khách thiếu nhu cầu U05d', apt_type: null, projects: [] },
].map((row) => ({
  ...row,
  owner_id: userId,
  phone: '0912345678',
  care_stage: 'Đang chăm sóc',
  qualified_at: at,
  created_at: at,
  registered_at: at,
  updated_at: at,
  interests: [],
  call_attempts: [],
  next_tasks: [],
  notes_manual: [],
}));

async function open(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 31, 9, 30) });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'u05d@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
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
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, customers }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
      request.onupgradeneeded = () => {
        for (const [name, keyPath] of [
          ['customers', 'id'],
          ['queue', 'opId'],
          ['meta', 'key'],
        ]) {
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath, autoIncrement: name === 'queue' });
        }
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        for (const customer of customers) tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, customers: rows },
  );
  await page.goto('/khach-hang');
}

test('dòng nhu cầu co theo ưu tiên ở 360/390px', async ({ page }) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 780 });
    await open(page);

    const check = async (name: string, expected: string, shouldAptFit: boolean, shouldProjectFit: boolean) => {
      const card = page.locator('[data-card]').filter({ hasText: name }).first();
      const line = card.getByTestId('customer-need-line');
      // Mô phỏng bề rộng nội dung 162px đã ghi nhận trên thẻ ở màn 360px.
      await line.evaluate((element) => {
        (element as HTMLElement).style.flex = '0 0 162px';
      });
      await expect(line).toHaveText(expected);
      await expect(line).toHaveAttribute('title', expected);
      const sizes = await line.locator('span').evaluateAll((parts) =>
        parts.map((part) => ({
          client: part.clientWidth,
          scroll: part.scrollWidth,
          ellipsis: getComputedStyle(part).textOverflow,
        })),
      );
      expect(sizes).toHaveLength(2);
      expect(sizes[0].scroll <= sizes[0].client, `${name}: ${JSON.stringify(sizes)}`).toBe(shouldAptFit);
      expect(sizes[1].scroll <= sizes[1].client, `${name}: ${JSON.stringify(sizes)}`).toBe(shouldProjectFit);
      if (!shouldAptFit) expect(sizes[0].ellipsis).toBe('ellipsis');
      if (!shouldProjectFit) expect(sizes[1].ellipsis).toBe('ellipsis');
      return line;
    };

    const missingType = await check('Khách thiếu loại căn U05d', 'Chưa rõ loại căn · NOXH Tràng Duệ', false, true);
    await check('Khách nhu cầu ngắn U05d', '3N-2WC · Vin TC', true, true);
    await check(
      'Khách dự án dài U05d',
      '3N-2WC · Khu đô thị NOXH Tràng Duệ Hải Phòng với đầy đủ tiện ích và kết nối thuận tiện',
      true,
      false,
    );
    await check('Khách thiếu nhu cầu U05d', 'Chưa rõ loại căn · Chưa rõ dự án', false, false);
    expect(await missingType.evaluate((line) => line.scrollWidth <= line.clientWidth)).toBe(true);
    for (const name of rows.map((row) => row.full_name)) {
      expect((await page.locator('[data-card]').filter({ hasText: name }).first().boundingBox())?.height).toBe(64);
    }
  }
});
