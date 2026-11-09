import { expect, type Locator, type Page, type TestInfo, test } from '@playwright/test';

// PF-12 (09/11): nút mở tấm đổi thành icon + "Lưu trữ khách" (bỏ dấu "…").

const userId = 'ui03b-e2e-user';
const NOW = new Date(2026, 10, 8, 9, 30);
const AT = NOW.toISOString();
const customer = {
  id: 'ui03b-customer',
  owner_id: userId,
  full_name: 'Nguyễn Thị Hưởng',
  phone: '0901234567',
  care_stage: 'Nuôi dài hạn',
  care_stage_updated_at: AT,
  qualified_at: AT,
  created_at: AT,
  updated_at: AT,
  gender: 'Nữ',
  dob: '1985-08-15',
  marital_status: 'Đã kết hôn',
  occupation: 'Giáo viên',
  income: '25 triệu',
  residence: 'Hải Phòng',
  contact_prefs: { channel: 'Zalo', slot: '18:00–20:00' },
  projects: [],
  next_tasks: [{ at: AT, text: 'Gửi bảng giá mẫu', kind: 'message', side: 'me', due: '2026-11-09T03:00:00.000Z' }],
  call_attempts: [{ at: AT, result: 'talked', origin: 'manual' }],
  notes_manual: [],
  advanced: {
    life_context: 'Đang thuê nhà, cần gần trường học',
    capital: 800000000,
    assets_total: 1200000000,
    loan_need: 400000000,
    x_old: 'Ghi cũ vẫn giữ',
  },
};

async function open(page: Page, customer: Record<string, unknown>) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/team_list', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { user_id: userId, full_name: 'Curtis', is_me: true, is_admin: false },
        { user_id: 'ui03b-lan', full_name: 'Lan', is_me: false, is_admin: false },
      ]),
    }),
  );
  await page.route('**/ai', async (route) => {
    const { task } = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data:
          task === 'parse_note'
            ? {
                cap_nhat: { finance: 500000000, residence: 'Hải Phòng' },
                nguoi_quyet_dinh: [{ ten: 'Chị Lan', vai_tro: 'vợ', ghi_chu: 'Cùng xem nhà' }],
                viec: [{ text: 'Gửi bảng giá', ben: 'em', kind: 'message', date: '2026-11-09' }],
                hen_goi: { date: '2026-11-09', time: '10:00', reason: 'Trao đổi bảng giá' },
              }
            : { tin_nhan: 'Em gửi anh chị thông tin căn hộ để tham khảo.' },
        model: 'mock',
      }),
    });
  });
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pf11@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem(
      `crm_team:${uid}`,
      JSON.stringify([
        { user_id: uid, full_name: 'Curtis', is_me: true, is_admin: false },
        { user_id: 'ui03b-lan', full_name: 'Lan', is_me: false, is_admin: false },
      ]),
    );
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
        tx.objectStore('customers').put({
          ...row,
          id: 'ui03b-lead',
          full_name: 'Khách mới mẫu',
          phone: '0901234568',
          qualified_at: null,
          care_stage: 'Mới',
          registered_at: '2026-11-03T02:30:00.000Z',
          call_attempts: [{ at: '2026-11-06T02:30:00.000Z', result: 'talked', origin: 'manual' }],
          next_tasks: [],
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, row: customer },
  );
  await page.goto(`/ho-so/${customer.id}`);
  await expect(page.getByRole('heading', { level: 1, name: String(customer.full_name) })).toBeVisible();
}

async function sameRow(a: Locator, b: Locator) {
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  // UI-04 (09/11): tấm đáy trượt lên → chờ hiệu ứng của tấm chứa ô xong rồi mới đo.
  await a.evaluate(async (el) => {
    const sheet = el.closest('[role="dialog"]');
    if (sheet) await Promise.all(sheet.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
  const first = await a.boundingBox();
  const second = await b.boundingBox();
  if (!first || !second) throw new Error('Không đo được ô nhập');
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(2);
  // Lưới chia điểm ảnh con có thể chồng nhau < 1px.
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width - 1);
}

// grouped=false: ngăn kéo Thao tác nhanh giữ một lớp (ít chạm), không bọc khu + thẻ — chỉ đo tràn ngang.
async function capture(page: Page, info: TestInfo, name: string, target?: Locator, grouped = true) {
  const root = target ?? page.locator('main').last();
  if (grouped) await expect(root.locator('[data-form-card]').first()).toBeVisible();
  const overflow = await page.evaluate(() => {
    const containers = [document.documentElement, ...document.querySelectorAll('[role="dialog"], [data-form-card]')];
    return containers
      .filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.tagName);
  });
  expect(overflow).toEqual([]);
  const ungrouped = await root
    .locator('input:not([type="file"]), textarea, select')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getClientRects().length > 0 && !node.closest('[data-form-card]'))
        .map((node) => node.getAttribute('aria-label') || node.tagName),
    );
  if (grouped) expect(ungrouped).toEqual([]);
  await expect(root.locator('[data-form-card] [data-form-card] [data-form-card]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`UI-03b bố cục ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await open(page, customer);
    });

    test('Thêm khách: khu chính, thông tin thêm và nâng cao', async ({ page }, info) => {
      await page.goto('/intake');
      await sameRow(page.getByLabel('Họ tên', { exact: false }), page.getByLabel('Số điện thoại', { exact: false }));
      await page.getByRole('button', { name: 'Thêm thông tin', exact: true }).click();
      await sameRow(
        page.getByRole('combobox', { name: 'Giới tính', exact: true }),
        page.getByLabel('Ngày sinh (ngày/tháng/năm)', { exact: true }),
      );
      await sameRow(
        page.getByLabel('Tình trạng hôn nhân'),
        page.getByRole('combobox', { name: 'Công việc', exact: true }),
      );
      await sameRow(page.getByLabel('Diện tích (m²)'), page.getByLabel('Mã toà'));
      if (info.project.name === 'desktop-1280') await sameRow(page.getByLabel('Mã toà'), page.getByLabel('Hướng căn'));
      const more = page.getByRole('region', { name: 'Thông tin thêm' });
      const card = more.locator('[data-form-card]');
      expect(
        await more
          .getByRole('button', { name: 'Thêm thông tin', exact: true })
          .evaluate((node) =>
            node
              .closest('[data-form-card]')
              ?.contains(document.getElementById(node.getAttribute('aria-controls') || '')),
          ),
      ).toBe(true);
      const sub = more
        .locator('[data-form-subsection]')
        .filter({ has: page.getByRole('heading', { name: 'Chi tiết căn hộ', exact: true }) });
      const indent = await sub.evaluate(
        (node) => node.getBoundingClientRect().x - (node.closest('[data-form-card]')?.getBoundingClientRect().x ?? 0),
      );
      expect(indent).toBeGreaterThan(12);
      await card.scrollIntoViewIfNeeded();
      await capture(page, info, `intake-${theme}`);
      for (const details of await more.locator('details').all()) await details.locator('summary').click();
      await sameRow(page.getByLabel('Giá trị tài sản', { exact: true }), page.getByLabel('Vốn', { exact: true }));
      if (info.project.name === 'desktop-1280')
        await sameRow(
          page.getByLabel('Vốn', { exact: true }),
          page.getByLabel('Khoản trả hàng tháng chấp nhận', { exact: true }),
        );
      await capture(page, info, `intake-advanced-${theme}`);
      await page.getByRole('button', { name: 'Thêm thông tin', exact: true }).click();
      await expect(page.getByLabel('Diện tích (m²)')).toHaveCount(0);
    });

    test('Hồ sơ: Thêm việc và Lưu trữ khách', async ({ page }, info) => {
      await page.getByRole('button', { name: 'Thêm việc', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: /Thêm việc ·/ });
      await dialog.locator('[data-task-action="message"]').click();
      await dialog.getByLabel('Ngày hạn').fill('2026-11-09');
      await sameRow(dialog.getByLabel('Ngày hạn'), dialog.getByLabel('Giờ hạn'));
      await capture(page, info, `add-task-${theme}`, dialog);
      await dialog.getByLabel('Nội dung việc', { exact: true }).fill('Gửi bảng giá mới');
      await dialog.getByRole('button', { name: 'Lưu việc', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: 'Lưu trữ khách', exact: true }).click();
      dialog = page.getByRole('dialog', { name: /Lưu trữ khách/ });
      await dialog.getByLabel('Lý do lưu trữ', { exact: true }).selectOption('khac');
      await expect(dialog.getByLabel('Ghi chú lý do lưu trữ')).toBeVisible();
      await capture(page, info, `archive-${theme}`, dialog);
    });

    test('Công việc: thêm, sửa, dời và lọc', async ({ page }, info) => {
      await page.goto('/cong-viec');
      await page.getByRole('button', { name: 'Thêm lời hứa', exact: true }).click();
      await sameRow(page.getByLabel('Loại lời hứa'), page.getByLabel('Loại việc mới'));
      if (info.project.name === 'desktop-1280')
        await sameRow(page.getByLabel('Loại việc mới'), page.getByLabel('Hạn lời hứa'));
      await capture(page, info, `tasks-create-${theme}`);
      await page.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await page.getByRole('button', { name: 'Sửa', exact: true }).click();
      await capture(page, info, `tasks-edit-${theme}`);
      await page.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await page.getByRole('button', { name: 'Dời', exact: true }).click();
      await sameRow(page.getByLabel('Hạn mới: Gửi bảng giá mẫu'), page.getByLabel('Lý do dời: Gửi bảng giá mẫu'));
      await capture(page, info, `tasks-snooze-filter-${theme}`);
    });

    for (const [kind, title] of [
      ['outcome', 'Kết quả cuộc gọi'],
      ['note', 'Ghi chú nhanh'],
      ['schedule', 'Hẹn gọi lại'],
      ['zalo', 'Nhắn Zalo'],
    ] as const) {
      test(`Thao tác nhanh: ${title}`, async ({ page }, info) => {
        await page.goto('/thao-tac-nhanh');
        const row = page
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { name: customer.full_name, exact: true }) });
        if (kind === 'outcome') {
          await row.getByRole('button', { name: 'Ghi tương tác', exact: true }).click();
          await page.getByRole('button', { name: 'Đã gọi', exact: true }).click();
        } else {
          await row
            .getByRole('button', {
              name: kind === 'note' ? 'Ghi chú' : kind === 'schedule' ? 'Hẹn' : 'Zalo',
              exact: true,
            })
            .click();
        }
        const dialog = page.getByRole('dialog', { name: new RegExp(title) });
        await expect(dialog).toBeVisible();
        if (kind === 'outcome') {
          await dialog.getByRole('radio', { name: 'Nói chuyện được', exact: true }).click();
          await dialog.getByRole('button', { name: 'Đổi lịch gọi', exact: true }).click();
        }
        if (kind === 'schedule' || kind === 'outcome') {
          const slots = dialog.getByRole('radiogroup', { name: 'Khung giờ gọi' });
          await sameRow(slots.getByRole('radio').nth(0), slots.getByRole('radio').nth(1));
        }
        if (kind === 'note') {
          await dialog.getByLabel('Nội dung ghi chú').fill('Khách có vốn 500 triệu ở Hải Phòng, em hứa gửi bảng giá.');
          const review = dialog.getByRole('button', { name: 'Lưu + AI · xem đề xuất' });
          if (await review.count()) {
            await review.click();
            await expect(dialog.getByTestId('ai-note-review')).toBeVisible();
            await expect(dialog.getByRole('button', { name: 'Duyệt và lưu các mục đã chọn' })).toBeDisabled();
          }
        }
        if (kind === 'zalo' && process.env.VITE_WORKER_URL)
          await expect(dialog.getByLabel('Mục đích tin (tuỳ chọn)')).toBeVisible();
        await capture(page, info, `quick-${kind}-${theme}`, dialog, false);
      });
    }

    test('Phân loại và Giao khách từ Hôm nay', async ({ page }, info) => {
      await page.goto('/today');
      await page.getByRole('button', { name: /^Phân loại Khách mới mẫu/ }).click();
      let dialog = page.getByRole('dialog', { name: /Phân loại ·/ });
      await dialog.getByRole('combobox', { name: 'Lý do loại', exact: true }).selectOption('khac');
      await capture(page, info, `today-classify-${theme}`, dialog);
      await dialog.getByRole('button', { name: 'Để sau', exact: true }).click();
      await page.goto(`/ho-so/${customer.id}`);
      await page.getByRole('button', { name: 'Giao khách', exact: true }).click();
      dialog = page.getByRole('dialog', { name: /Giao khách:/ });
      await dialog.getByLabel('Người nhận khách').selectOption('ui03b-lan');
      await capture(page, info, `assign-${theme}`, dialog);
    });

    test('Khách mới: phân loại trong hồ sơ tóm tắt', async ({ page }, info) => {
      await page.goto('/khach-moi');
      await page
        .getByRole('button', { name: /Khách mới mẫu/ })
        .first()
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('combobox', { name: 'Lý do loại', exact: true }).selectOption('khac');
      await capture(page, info, `lead-detail-${theme}`, dialog);
    });
  });
}
