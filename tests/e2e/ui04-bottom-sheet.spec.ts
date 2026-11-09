import { expect, type Locator, type Page, test } from '@playwright/test';

const userId = 'ui04-customer-sheet';
const NOW = new Date('2026-10-28T10:30:00+07:00');
const at = (day: number, hour: number, minute = 0) =>
  `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;

const customer = {
  id: 'ui04-customer',
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
  notes_manual: Array.from({ length: 18 }, (_, i) => ({
    at: at(27, 11, i),
    text: `Ghi chú chăm sóc khách lần ${i + 1}`,
  })),
  interactions: [{ at: at(27, 12), channel: 'zalo', kind: 'sent', note: 'Đã gửi thông tin dự án' }],
  next_tasks: [{ at: at(27, 13), text: 'Gửi hồ sơ mẫu', kind: 'docs', due: at(28, 9), done_at: at(27, 14) }],
  care_stage_history: [
    { at: at(25, 9), stage: 'Đăng kí mới', note: 'Khách mới đăng ký' },
    { at: at(26, 9), stage: 'Đang tiếp cận', note: 'Đã liên hệ' },
    { at: at(27, 9), stage: 'Đang chăm sóc', note: 'Đã đủ điều kiện' },
  ],
};

async function open(page: Page, path: '/khach-hang' | '/today', assignable = true) {
  await page.clock.install({ time: NOW });
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('/team_list') && assignable
          ? [
              { user_id: userId, full_name: 'Tư vấn viên thử', is_me: true },
              { user_id: 'ui04-colleague', full_name: 'Đồng nghiệp thử' },
            ]
          : [],
      ),
    }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ui04@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-ui04-token',
        refresh_token: 'synthetic-ui04-refresh',
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

async function bounds(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('Phần tử chưa có vị trí');
  return rect;
}

function viewportOf(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Thiếu kích thước màn hình');
  return viewport;
}

async function settle(sheet: Locator) {
  await sheet.evaluate(async (element) => {
    await document.fonts.ready;
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
}

async function swipe(page: Page, target: Locator, distance: number, startNearBottom = false) {
  const rect = await target.boundingBox();
  if (!rect) throw new Error('Không tìm thấy vùng vuốt');
  const x = rect.x + rect.width / 2;
  const y = startNearBottom ? rect.y + rect.height - 12 : rect.y + 12;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + (distance * step) / 6 }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function noOverflow(page: Page, sheet: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`UI-04 · ${theme}`, () => {
    test.use({ colorScheme: theme });

    test('Hôm nay: kích thước, cuộn thân, đầu/đáy cố định, nút có icon', async ({ page }, info) => {
      await open(page, '/today');
      await page.getByRole('button', { name: 'Mở Khách Xem Nhanh' }).click();
      const sheet = page.getByRole('dialog', { name: 'Khách Xem Nhanh' });
      await settle(sheet);
      const rect = await sheet.boundingBox();
      if (!rect) throw new Error('Tấm chưa mở');
      const viewport = viewportOf(page);
      if (viewport.width < 1024) {
        expect(Math.abs(rect.height - (viewport.height * 2) / 3)).toBeLessThanOrEqual(2);
        expect(Math.abs(rect.y + rect.height - viewport.height)).toBeLessThanOrEqual(2);
        expect(rect.x).toBe(0);
        expect(rect.width).toBe(viewport.width);
        await expect(sheet.locator('[data-sheet-handle]')).toBeVisible();
      } else {
        expect(rect.width).toBe(480);
        expect(rect.x + rect.width).toBe(viewport.width);
        expect(rect.height).toBe(viewport.height);
        await expect(sheet.locator('[data-sheet-handle]')).toBeHidden();
      }
      await expect(sheet.getByRole('heading', { name: 'Hành trình · 21 việc' })).toBeVisible();
      const body = sheet.locator('[data-sheet-body]');
      const header = sheet.locator('[data-sheet-header]');
      const footer = sheet.locator('[data-sheet-footer]');
      expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      const headerBefore = await header.boundingBox();
      const footerBefore = await footer.boundingBox();
      await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await header.boundingBox()).toEqual(headerBefore);
      expect(await footer.boundingBox()).toEqual(footerBefore);
      const assign = footer.getByRole('button', { name: 'Giao khách' });
      const profile = footer.getByRole('button', { name: 'Mở hồ sơ', exact: true });
      const a = await bounds(assign);
      const b = await bounds(profile);
      expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
      expect(a.height).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      await expect(assign.locator('svg[data-icon="assign"]')).toHaveCount(1);
      await expect(profile.locator('svg[data-icon="profile"]')).toHaveCount(1);
      const summary = sheet.getByText('0912 345 678').locator('..');
      await expect(summary.getByText('Quá hạn', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      await noOverflow(page, sheet);
      await body.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath('customer-sheet.png') });
      await profile.click();
      await expect(page).toHaveURL(/\/ho-so\/ui04-customer$/);
    });

    test('không quyền giao: Mở hồ sơ chiếm cả hàng; X/Esc/nền tối đóng được', async ({ page }) => {
      await open(page, '/khach-hang', false);
      const trigger = page.getByRole('button', { name: 'Mở Khách Xem Nhanh' });
      const sheet = page.getByRole('dialog', { name: 'Khách Xem Nhanh' });
      for (const method of ['X', 'Escape', 'overlay']) {
        await trigger.click();
        await settle(sheet);
        const footer = sheet.locator('[data-sheet-footer]');
        await expect(footer.getByRole('button', { name: 'Giao khách' })).toHaveCount(0);
        const footerSize = await footer.evaluate((element) => ({
          width: element.clientWidth,
          padding:
            parseFloat(getComputedStyle(element).paddingLeft) + parseFloat(getComputedStyle(element).paddingRight),
        }));
        const button = sheet.getByRole('button', { name: 'Mở hồ sơ', exact: true });
        expect(Math.abs((await bounds(button)).width - (footerSize.width - footerSize.padding))).toBeLessThanOrEqual(2);
        if (method === 'X') await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
        else if (method === 'Escape') await page.keyboard.press('Escape');
        else await page.mouse.click(5, 5);
        await expect(sheet).toHaveCount(0);
      }
    });

    test('cảm ứng: 30px bật về, 120px đóng từ thanh kéo và đầu, thân chỉ cuộn', async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'Cử chỉ dành cho tấm đáy');
      await open(page, '/khach-hang');
      const trigger = page.getByRole('button', { name: 'Mở Khách Xem Nhanh' });
      const sheet = page.getByRole('dialog', { name: 'Khách Xem Nhanh' });
      await trigger.click();
      await settle(sheet);
      const before = await bounds(sheet);
      await swipe(page, sheet.locator('[data-sheet-handle]'), 30);
      await expect(sheet).toBeVisible();
      await expect.poll(async () => Math.abs((await bounds(sheet)).y - before.y)).toBeLessThan(2);
      const body = sheet.locator('[data-sheet-body]');
      await swipe(page, body, -120, true);
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await swipe(page, body, 120);
      await expect(sheet).toBeVisible();
      await swipe(page, sheet.locator('[data-sheet-handle]'), 120);
      await expect(sheet).toHaveCount(0);
      await trigger.click();
      await settle(sheet);
      await swipe(page, sheet.locator('[data-sheet-header]'), 120);
      await expect(sheet).toHaveCount(0);
    });

    test('Lọc khách: tấm tối đa 90%, tới được ô cuối, chừa thanh hệ thống', async ({ page }, info) => {
      test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'Kiểm biểu mẫu trên điện thoại');
      await open(page, '/khach-hang');
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 32, bottom: 24 } });
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Lọc khách' });
      await settle(sheet);
      const rect = await bounds(sheet);
      const height = viewportOf(page).height;
      expect(rect.height).toBeLessThanOrEqual(height * 0.9 + 2);
      expect(rect.y).toBeGreaterThanOrEqual(32);
      expect(Math.abs(rect.y + rect.height - height)).toBeLessThanOrEqual(2);
      expect(await sheet.evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom))).toBe(24);
      const body = sheet.locator('[data-sheet-body]');
      expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      const last = sheet.getByRole('textbox', { name: 'Tên tệp mới' });
      await last.scrollIntoViewIfNeeded();
      await last.fill('Khách cần chăm sóc');
      const input = await bounds(last);
      expect(input.y + input.height).toBeLessThanOrEqual((await bounds(sheet.locator('[data-sheet-footer]'))).y + 2);
      await noOverflow(page, sheet);
      await page.screenshot({ path: info.outputPath('filter-sheet.png') });
      await session.detach();
    });

    test('vuốt bản nháp vẫn hỏi trước khi bỏ', async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'Cử chỉ dành cho tấm đáy');
      await open(page, '/khach-hang');
      await page.getByRole('button', { name: 'Mở Khách Xem Nhanh' }).click();
      await page.getByRole('button', { name: 'Ghi chú Khách Xem Nhanh' }).click();
      const sheet = page.getByRole('dialog').filter({ has: page.locator('[data-sheet-handle]') });
      await settle(sheet);
      await sheet.getByRole('textbox').first().fill('Ghi chú cần giữ');
      await swipe(page, sheet.locator('[data-sheet-handle]'), 120);
      await expect(page.getByRole('heading', { name: 'Bỏ nội dung đang nhập?' })).toBeVisible();
      await page.getByRole('button', { name: 'Tiếp tục nhập' }).click();
      await expect(sheet.getByRole('textbox').first()).toHaveValue('Ghi chú cần giữ');
      await swipe(page, sheet.locator('[data-sheet-handle]'), 120);
      await page.getByRole('button', { name: 'Bỏ nháp', exact: true }).click();
      await expect(sheet).toHaveCount(0);
    });

    test('Giỏ hàng: ô ngắn cùng hàng sau hiệu ứng mở, ô cuối vẫn cuộn tới được', async ({ page }) => {
      await open(page, '/khach-hang');
      await page.goto('/gio-hang');
      await page.getByRole('button', { name: 'Thêm dự án', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Thêm dự án', exact: true });
      await settle(sheet);
      // Đo cùng một khung hình sau hiệu ứng: tấm trượt lên không làm lệch hai ô trong form.
      const pair = await sheet
        .getByLabel('Giá dự án', { exact: true })
        .or(sheet.getByLabel('Phí mỗi căn', { exact: true }))
        .evaluateAll((inputs) =>
          inputs.map((input) => {
            const rect = input.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width };
          }),
        );
      expect(pair).toHaveLength(2);
      expect(Math.abs(pair[0].y - pair[1].y)).toBeLessThanOrEqual(2);
      expect(pair[1].x).toBeGreaterThanOrEqual(pair[0].x + pair[0].width);
      const last = sheet.getByLabel('Nhận sổ sau bàn giao', { exact: true });
      await last.scrollIntoViewIfNeeded();
      const field = await bounds(last);
      const footer = await bounds(sheet.locator('[data-sheet-footer]'));
      expect(field.y + field.height).toBeLessThanOrEqual(footer.y + 2);
      await noOverflow(page, sheet);
    });

    test('giảm chuyển động; bàn phím thu vùng nhìn thấy vẫn tới được ô nhập', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, '/khach-hang');
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Lọc khách' });
      await settle(sheet);
      expect(await sheet.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
      if ((page.viewportSize()?.width ?? 0) >= 1024) return;
      const last = sheet.getByRole('textbox', { name: 'Tên tệp mới' });
      await last.fill('Bàn phím đang mở');
      await page.evaluate(() => {
        // Mô phỏng VisualViewport khi bàn phím phủ 300px; viewport bố cục giữ nguyên.
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: innerHeight - 300 });
        window.visualViewport?.dispatchEvent(new Event('resize'));
      });
      await expect
        .poll(async () => (await bounds(sheet)).y + (await bounds(sheet)).height)
        .toBeCloseTo(viewportOf(page).height - 300, 0);
      const input = await bounds(last);
      const body = await bounds(sheet.locator('[data-sheet-body]'));
      expect(input.y).toBeGreaterThanOrEqual(body.y - 2);
      expect(input.y + input.height).toBeLessThanOrEqual(body.y + body.height + 2);
      await expect(last).toBeFocused();
    });
  });
}

test('máy tính bảng dọc 768/1023px vẫn dùng tấm đáy; 1024px chuyển bám phải', async ({ page }) => {
  await open(page, '/khach-hang');
  for (const width of [768, 1023, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Mở Khách Xem Nhanh' }).click();
    const sheet = page.getByRole('dialog', { name: 'Khách Xem Nhanh' });
    await settle(sheet);
    const rect = await bounds(sheet);
    expect(rect.width).toBe(width < 1024 ? width : 480);
    expect(Math.abs(rect.height - (width < 1024 ? 600 : 900))).toBeLessThanOrEqual(2);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
});
