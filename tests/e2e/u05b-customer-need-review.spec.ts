import { expect, type Page, test } from '@playwright/test';

const userId = 'u05b-review-user';
const NOW = new Date(2026, 9, 19, 9, 30);
const stamp = (hour: number, minute = 0) => new Date(2026, 9, 19, hour, minute).toISOString();
const common = {
  id: 'u05b-common',
  owner_id: userId,
  phone: '0912345678',
  full_name: 'Nguyễn Thị Khách Hàng U05b',
  care_stage: 'Đang chăm sóc',
  qualified_at: stamp(8),
  created_at: stamp(8),
  registered_at: stamp(8),
  updated_at: stamp(8),
  care_stage_updated_at: stamp(9),
  sla_anchor_at: stamp(9),
  apt_type: '3N-2WC',
  projects: ['Happy Home', 'Vinhomes Marina'],
  interests: [{ apt_type: '2N-1WC', project: 'Hoàng Huy', status: 'open' }],
  call_attempts: [{ at: stamp(8), result: 'talked' }],
  next_tasks: [{ at: stamp(8), text: 'Gửi thông tin căn hộ', kind: 'other', due: stamp(9) }],
  notes_manual: [],
  contact_prefs: {},
};
const rows = [
  common,
  {
    ...common,
    id: 'u05b-new',
    full_name: 'Khách mới U05b',
    care_stage: 'Đăng kí mới',
    qualified_at: null,
    care_stage_updated_at: undefined,
    sla_anchor_at: undefined,
    next_call_at: undefined,
    next_call_end: undefined,
    apt_type: null,
    projects: [],
    interests: [],
    call_attempts: [],
  },
  {
    ...common,
    id: 'u05b-partial',
    full_name: 'Khách mới có dự án U05b',
    care_stage: 'Đăng kí mới',
    qualified_at: null,
    care_stage_updated_at: undefined,
    sla_anchor_at: undefined,
    next_call_at: undefined,
    next_call_end: undefined,
    apt_type: null,
    projects: ['Happy Home'],
    interests: [],
    call_attempts: [],
  },
  {
    ...common,
    id: 'u05b-archived',
    full_name: 'Khách lưu trữ U05b',
    archived_at: stamp(8),
  },
  {
    ...common,
    id: 'u05b-long',
    full_name: 'Khách nhu cầu rất dài U05b',
    care_stage: 'Đăng kí mới',
    qualified_at: null,
    care_stage_updated_at: undefined,
    sla_anchor_at: undefined,
    next_call_at: undefined,
    next_call_end: undefined,
    apt_type: 'Căn hộ ba phòng ngủ hai phòng vệ sinh có ban công góc siêu rộng',
    projects: [
      'Khu đô thị Happy Home Hải Phòng phía Đông ven sông với đầy đủ tiện ích trường học bệnh viện trung tâm thương mại công viên và kết nối giao thông thuận tiện',
    ],
    interests: [],
    next_tasks: [],
    call_attempts: [],
  },
  {
    ...common,
    id: 'u05b-missed',
    full_name: 'Khách quên gọi U05b',
    next_call_at: stamp(6),
    next_call_end: stamp(6, 45),
  },
];

async function seed(page: Page, path: string) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'u05b@example.test',
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
        for (const customer of customers) tx.objectStore('customers').put(customer);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, customers: rows },
  );
  await page.goto(path);
}

const routes = ['/today', '/cong-viec', '/khach-hang', '/khach-moi', '/khach-hang/retarget', '/khach-hang/luu-tru'];

test('nhu cầu từng thẻ đúng nội dung, vị trí, màu và ellipsis ở 360/390/1280px', async ({ page }) => {
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 780 });
    for (const path of routes) {
      await seed(page, path);
      const lines = page.getByTestId('customer-need-line');
      await expect(lines.first(), `Thiếu dòng nhu cầu tại ${path}, ${width}px`).toBeVisible();
      for (const line of await lines.all()) {
        const card = line.locator('xpath=ancestor::*[self::article or self::button or @data-card][1]');
        const cardName = await card.innerText();
        const expected = cardName.includes('Khách mới U05b')
          ? 'Chưa rõ loại căn · Chưa rõ dự án'
          : cardName.includes('Khách mới có dự án U05b')
            ? 'Chưa rõ loại căn · Happy Home'
            : cardName.includes('Khách nhu cầu rất dài U05b')
              ? 'Căn hộ ba phòng ngủ hai phòng vệ sinh có ban công góc siêu rộng · Khu đô thị Happy Home Hải Phòng phía Đông ven sông với đầy đủ tiện ích trường học bệnh viện trung tâm thương mại công viên và kết nối giao thông thuận tiện'
              : '3N-2WC +1 · Happy Home +2';
        await expect(line).toHaveText(expected);
        await expect(card.getByTestId('customer-need-line')).toHaveCount(1);
        const name = card.getByText(/U05b/).first();
        const [nameBox, needBox] = await Promise.all([name.boundingBox(), line.boundingBox()]);
        expect(nameBox).not.toBeNull();
        expect(needBox).not.toBeNull();
        if (!nameBox || !needBox) throw new Error(`Không đo được dòng thẻ ở ${path}`);
        expect(needBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
        expect(needBox.height).toBeLessThanOrEqual(20);
      }
      const unknownLine = lines.filter({ hasText: 'Chưa rõ loại căn · Happy Home' }).first();
      if (await unknownLine.count()) {
        const colors = await unknownLine
          .locator('span')
          .evaluateAll((parts) => parts.map((part) => getComputedStyle(part).color));
        expect(colors).toHaveLength(2);
        expect(colors[0]).not.toBe(colors[1]);
      }
      const longLine = lines.filter({ hasText: 'Căn hộ ba phòng ngủ' }).first();
      if (path === '/khach-moi') await expect(longLine).toBeVisible();
      if (await longLine.count()) {
        // Curtis 31/10: phần trong dòng co riêng ("Chưa rõ…" co trước) → "…" có thể nằm ở dòng hoặc ở từng phần.
        const metrics = await longLine.evaluate((element) =>
          [element, ...element.querySelectorAll('span')].some(
            (part) => part.scrollWidth > part.clientWidth && getComputedStyle(part).textOverflow === 'ellipsis',
          ),
        );
        expect(metrics).toBe(true);
      }
      if (width === 1280 && path === '/khach-hang') {
        const name = page.getByRole('button', { name: `Mở ${common.full_name}` });
        await expect(name).toBeVisible();
        await expect(name).not.toHaveClass(/text-\[13px\]|leading-\[18px\]/);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test('điện thoại giữ số ở ba danh sách, thẻ Khách hàng 64px ẩn số và chỉ hiện nhãn hạn', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/khach-moi', '/khach-hang/retarget', '/khach-hang/luu-tru']) {
    await seed(page, path);
    const cards = page.locator('[data-testid="customer-need-line"]').locator('xpath=ancestor::button[1]');
    await expect(cards.first()).toContainText('0912345678');
  }

  await seed(page, '/khach-hang');
  const normal = page.locator('[data-card]').filter({ hasText: 'Nguyễn Thị Khách Hàng U05b' }).first();
  await expect(normal).toBeVisible();
  await expect(normal).not.toContainText('0912345678');
  expect((await normal.boundingBox())?.height).toBe(64);
  await expect(normal).toContainText('Hôm nay');

  const overdue = page.locator('[data-card]').filter({ hasText: 'Khách quên gọi U05b' }).first();
  await expect(overdue).toBeVisible();
  await expect(overdue).toContainText('Quên gọi');
  await expect(overdue).not.toContainText('Hôm nay');
});

test('ActionItem giữ đệm 8px khi có dòng nhu cầu', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seed(page, '/today');
  const cards = page.locator('[data-card]').filter({ has: page.getByTestId('customer-need-line') });
  await expect(cards.first()).toBeVisible();
  expect(await cards.first().evaluate((element) => getComputedStyle(element).padding)).toBe('8px');
});
