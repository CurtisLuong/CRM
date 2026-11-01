import { expect, type Page, test } from '@playwright/test';

const userId = 'r2-04-customer-sheet';
const NOW = new Date('2026-10-28T10:30:00+07:00');
const at = (day: number, hour: number, minute = 0) =>
  `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;

const customer = {
  id: 'r2-04-customer',
  owner_id: userId,
  full_name: 'Khách Xem Nhanh',
  phone: '0912345678',
  qualified_at: at(26, 9),
  care_stage: 'Đang chăm sóc',
  care_stage_updated_at: at(27, 9),
  sla_anchor_at: at(27, 9),
  registered_at: at(26, 9),
  created_at: at(26, 9),
  updated_at: at(28, 9),
  next_call_at: at(28, 8),
  next_call_end: at(28, 9),
  call_attempts: [{ at: at(27, 10), result: 'talked', note: 'Hỏi nhu cầu căn hai phòng ngủ' }],
  notes_manual: [{ at: at(27, 11), text: 'Gửi bảng giá dự án' }],
  interactions: [{ at: at(27, 12), channel: 'zalo', kind: 'sent', note: 'Đã gửi thông tin dự án' }],
  next_tasks: [{ at: at(27, 13), text: 'Gửi hồ sơ mẫu', kind: 'docs', due: at(28, 9), done_at: at(27, 14) }],
  care_stage_history: [
    { at: at(25, 9), stage: 'Đăng kí mới', note: 'Khách mới đăng ký' },
    { at: at(26, 9), stage: 'Đang tiếp cận', note: 'Đã liên hệ' },
    { at: at(27, 9), stage: 'Đang chăm sóc', note: 'Đã đủ điều kiện' },
  ],
};

async function open(page: Page, path: '/khach-hang' | '/today') {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'r2-04@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-r2-04-token',
        refresh_token: 'synthetic-r2-04-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        CallLog: {
          dial: async () => {
            const w = window as Window & { __dialCalls?: number };
            w.__dialCalls = (w.__dialCalls ?? 0) + 1;
            return {};
          },
        },
      },
    };
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, row }) => {
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
        tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, row: customer },
  );
  await page.goto(path);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`R2-04 · ${theme}`, () => {
    test.use({ colorScheme: theme });

    test('tấm từ danh sách: nội dung, hành trình, responsive, Escape và mở hồ sơ', async ({ page }, info) => {
      test.skip(!['phone-360', 'desktop-1280'].includes(info.project.name), 'Kiểm ở 360px và 1280px');
      await open(page, '/khach-hang');
      await page.getByRole('button', { name: 'Mở Khách Xem Nhanh' }).click();
      const sheet = page.getByRole('dialog', { name: 'Khách Xem Nhanh' });
      await expect(sheet).toBeVisible();
      await expect(page).toHaveURL(/\/khach-hang\/r2-04-customer$/);
      await expect(sheet.getByText('0912 345 678')).toBeVisible();
      await expect(sheet.getByText('Đang chăm sóc', { exact: true }).first()).toBeVisible();
      await expect(sheet.getByText('Quá hạn', { exact: true })).toBeVisible();
      await expect(sheet.getByText('Ở bậc này')).toBeVisible();

      const actions = sheet.getByRole('navigation', { name: 'Hành động nhanh' });
      for (const name of [
        'Gọi Khách Xem Nhanh',
        'Zalo Khách Xem Nhanh',
        'Ghi chú Khách Xem Nhanh',
        'Hẹn Khách Xem Nhanh',
      ])
        await expect(actions.getByRole('button', { name })).toBeEnabled();
      await expect(sheet.getByRole('heading', { name: 'Hành trình · 4 việc' })).toBeVisible();
      const currentStage = sheet.getByRole('button', { name: /Đang chăm sóc/ });
      await expect(currentStage).toHaveAttribute('aria-expanded', 'true');
      await expect(sheet.getByRole('button', { name: /Đăng kí mới/ })).toHaveAttribute('aria-expanded', 'false');
      await expect(sheet.getByText('Hỏi nhu cầu căn hai phòng ngủ')).toBeVisible();
      await expect(sheet.getByText('Gửi bảng giá dự án')).toBeVisible();
      await expect(sheet.getByText('Đã gửi Zalo')).toBeVisible();
      await expect(sheet.getByText('Xong việc: Gửi hồ sơ mẫu')).toBeVisible();

      const bounds = await sheet.evaluate(async (element) => {
        // Đo sau khi tấm trượt vào xong, không đo giữa chừng hiệu ứng.
        // Bỏ hiệu ứng lặp vô hạn (chấm nhấp nháy) — chỉ chờ hiệu ứng có kết thúc.
        const finite = element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY);
        await Promise.all(finite.map((animation) => animation.finished));
        const rect = element.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });
      const width = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(width.document).toBeLessThanOrEqual(width.viewport);
      if (info.project.name === 'phone-360') {
        expect(bounds.left).toBeCloseTo(0, 0); // tấm còn trượt vào: lệch vài phần triệu px
        expect(bounds.width).toBeCloseTo(360, 0);
      } else {
        expect(bounds.width).toBeCloseTo(480, 0);
        expect(bounds.left).toBeGreaterThan(700);
        await expect(page.locator('[data-card]').filter({ hasText: 'Khách Xem Nhanh' })).toBeVisible();
      }

      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(page).toHaveURL('/khach-hang');
      await page.getByRole('button', { name: 'Mở Khách Xem Nhanh' }).click();
      await page
        .getByRole('dialog', { name: 'Khách Xem Nhanh' })
        .getByRole('button', { name: 'Mở hồ sơ đầy đủ' })
        .click();
      await expect(page).toHaveURL(/\/ho-so\/r2-04-customer$/);
    });

    test('Gọi từ tấm mở đúng luồng gọi nhanh', async ({ page }, info) => {
      test.skip(!['phone-360', 'desktop-1280'].includes(info.project.name), 'Kiểm ở 360px và 1280px');
      await open(page, '/khach-hang');
      await page.getByRole('button', { name: 'Mở Khách Xem Nhanh' }).click();
      await page
        .getByRole('dialog', { name: 'Khách Xem Nhanh' })
        .getByRole('button', { name: 'Gọi Khách Xem Nhanh' })
        .click();
      await page.waitForFunction(() => (window as Window & { __dialCalls?: number }).__dialCalls === 1);
      await expect(page.getByRole('dialog', { name: 'Khách Xem Nhanh' })).toHaveCount(0);
    });

    test('tấm từ Hôm nay giữ nguyên trang và đóng bằng Escape', async ({ page }, info) => {
      test.skip(!['phone-360', 'desktop-1280'].includes(info.project.name), 'Kiểm ở 360px và 1280px');
      await open(page, '/today');
      const card = page.locator('[data-card]').filter({ hasText: 'Khách Xem Nhanh' });
      const before = await page.evaluate(() => window.scrollY);
      await card.getByRole('button', { name: 'Mở Khách Xem Nhanh' }).click();
      const sheet = page.getByRole('dialog', { name: 'Khách Xem Nhanh' });
      await expect(sheet).toBeVisible();
      await expect(page).toHaveURL('/today');
      await expect(sheet.getByRole('button', { name: 'Mở hồ sơ đầy đủ' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(page).toHaveURL('/today');
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  });
}
