import { expect, type Page, test } from '@playwright/test';

const NOW = new Date('2026-11-09T10:53:00+07:00');
const at = (day: string, time: string) => new Date(`2026-${day}T${time}:00+07:00`).toISOString();
const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;

type Seed = Record<string, unknown> & { id: string; owner_id: string; full_name: string; phone: string };

async function installApp(page: Page, userId: string) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'tl02@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-tl02-token',
        refresh_token: 'synthetic-tl02-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
}

async function seed(page: Page, userId: string, row: Seed) {
  await page.evaluate(
    async ({ name, row: customer }) => {
      const request = indexedDB.open(name, 2);
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
    { name: dbName(userId), row },
  );
}

async function readCustomer(page: Page, userId: string, id: string) {
  return page.evaluate(
    async ({ name, id: customerId }) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = db.transaction('customers', 'readonly').objectStore('customers').get(customerId);
      const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result as Record<string, unknown>);
        read.onerror = () => reject(read.error);
      });
      db.close();
      return row;
    },
    { name: dbName(userId), id },
  );
}

async function openProfile(page: Page, userId: string, customer: Seed) {
  await installApp(page, userId);
  await seed(page, userId, customer);
  await page.goto(`/ho-so/${customer.id}`);
  await expect(page.getByRole('heading', { level: 1, name: customer.full_name })).toBeVisible();
  await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
  return page.getByRole('tabpanel', { name: /Dòng thời gian/ });
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

function stageCustomer(theme: string, project: string): Seed {
  return {
    id: `tl02-stage-${project}-${theme}`,
    owner_id: `tl02-user-${project}-${theme}`,
    full_name: 'Khách TL-02 Bậc',
    phone: '0912000002',
    qualified_at: at('10-08', '16:10'),
    care_stage: 'Nuôi dài hạn',
    care_stage_updated_at: at('10-30', '10:53'),
    registered_at: at('10-08', '16:10'),
    created_at: at('10-08', '16:10'),
    updated_at: at('10-30', '10:53'),
    next_call_at: at('11-09', '08:00'),
    next_call_end: at('11-09', '09:00'),
    care_stage_history: [
      { stage: 'Đang chăm sóc', at: at('10-08', '16:10') },
      { stage: 'Xem dự án', at: at('10-09', '22:29') },
      { stage: 'Nuôi dài hạn', at: at('10-30', '10:53') },
    ],
    call_attempts: [{ at: at('10-08', '16:10'), result: 'talked', note: 'Đã nói chuyện' }],
    notes_manual: [],
    next_tasks: [],
  };
}

function editCustomer(theme: string, project: string): Seed {
  return {
    id: `tl02-edit-${project}-${theme}`,
    owner_id: `tl02-user-${project}-${theme}`,
    full_name: 'Khách TL-02 Sửa',
    phone: '0912000003',
    registered_at: at('10-01', '10:00'),
    created_at: at('10-01', '10:00'),
    updated_at: at('10-13', '16:00'),
    care_stage: 'Xem dự án',
    care_stage_updated_at: at('10-10', '10:00'),
    care_stage_history: [
      { stage: 'Đang chăm sóc', at: at('10-01', '10:00') },
      { stage: 'Xem dự án', at: at('10-10', '10:00') },
    ],
    call_attempts: [
      {
        at: at('10-12', '09:00'),
        result: 'talked',
        note: 'Ghi chú cuộc gọi cũ',
        duration: 120,
        origin: 'manual',
        device_id: 'seed-device',
        unknown_call_key: { keep: true },
      },
    ],
    notes_manual: [{ at: at('10-11', '09:00'), text: 'Ghi chú tay cũ', unknown_note_key: 'keep' }],
    next_tasks: [
      {
        at: at('10-13', '08:00'),
        text: 'Tham quan căn mẫu',
        kind: 'visit',
        due: at('10-14', '09:00'),
        done_at: at('10-13', '16:00'),
        unknown_task_key: 'keep',
      },
    ],
  };
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`TL-02 · ${theme}`, () => {
    test.use({ colorScheme: theme });

    test('đổi bậc 2 bước từ nhóm bậc và chip, không lùi; thời gian ở bậc đúng số chuẩn', async ({ page }, testInfo) => {
      const customer = stageCustomer(theme, testInfo.project.name);
      const userId = customer.owner_id;
      const panel = await openProfile(page, userId, customer);

      await expect(panel.getByText(/^Bậc: /)).toHaveCount(0);
      const groups = panel.locator('[data-timeline-group]');
      await expect(groups).toHaveCount(3);
      const first = groups.nth(0);
      const firstHeading = first.getByRole('heading', { level: 3, name: 'Nuôi dài hạn' });
      await expect(firstHeading).toBeVisible();
      expect(await firstHeading.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(
        14,
      );
      await expect(first.getByText('10 ngày · đang ở', { exact: true })).toBeVisible();
      await expect(groups.nth(1).getByText('20 ngày 12 giờ', { exact: true })).toBeVisible();
      await expect(groups.nth(2).getByText('1 ngày 6 giờ', { exact: true })).toBeVisible();

      // Hành trình ở tấm xem nhanh dùng cùng tên bậc/thời gian ở bậc.
      await page.goto('/today');
      await page.getByRole('button', { name: 'Mở Khách TL-02 Bậc', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Khách TL-02 Bậc', exact: true });
      const journey = sheet.getByRole('region', { name: 'Hành trình khách hàng' });
      const journeyStages = journey.locator(':scope > ol > li');
      await expect(journeyStages.nth(0)).toContainText('Nuôi dài hạn');
      await expect(journeyStages.nth(0).getByText('10 ngày · đang ở', { exact: true })).toBeVisible();
      expect(
        await journeyStages
          .nth(0)
          .locator('[data-stage-title]')
          .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
      ).toBeLessThanOrEqual(14);
      await sheet.getByRole('button', { name: 'Đóng' }).click();
      await page.goto(`/ho-so/${customer.id}`);
      await page.getByRole('tab', { name: /Dòng thời gian/ }).click();

      // (a) Nút Đổi bậc trong nhóm bậc hiện tại: bước 1 chặn lùi, bước 2 xác nhận mới ghi.
      const panelAgain = page.getByRole('tabpanel', { name: /Dòng thời gian/ });
      await panelAgain.getByRole('button', { name: 'Đổi bậc', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: 'Đổi bậc khách' });
      await expect(dialog.getByText(/Bước 1\/2/)).toBeVisible();
      const blocked = dialog.locator('[data-stage-option="Đăng kí mới"]');
      await expect(blocked.getByText('Không lùi bậc')).toBeVisible();
      await expect(blocked.getByRole('radio', { name: 'Đăng kí mới' })).toBeDisabled();
      await dialog.getByRole('radio', { name: 'Xem dự án' }).check();
      await dialog.getByRole('button', { name: 'Tiếp tục' }).click();
      await expect(dialog.getByText('Nuôi dài hạn → Xem dự án', { exact: true })).toBeVisible();
      const schedule = dialog.getByRole('checkbox');
      await expect(schedule).toBeChecked();
      await dialog.getByRole('button', { name: 'Quay lại' }).click();
      await dialog.getByRole('radio', { name: 'Xem dự án' }).check();
      await dialog.getByRole('button', { name: 'Tiếp tục' }).click();
      await dialog.getByRole('textbox', { name: 'Ghi chú đổi bậc' }).fill('Hẹn xem căn mẫu');
      await dialog.getByRole('button', { name: 'Xác nhận đổi bậc' }).click();
      await expect(dialog).toBeHidden();
      await expect
        .poll(async () => ((await readCustomer(page, userId, customer.id)).care_stage_history as unknown[]).length)
        .toBe(4);
      let saved = await readCustomer(page, userId, customer.id);
      expect((saved.care_stage_history as { stage: string; note?: string }[]).at(-1)).toMatchObject({
        stage: 'Xem dự án',
        note: 'Hẹn xem căn mẫu',
      });

      // Đóng ở bước 2 không ghi gì.
      await panelAgain.getByRole('button', { name: 'Đổi bậc', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Đổi bậc khách' });
      await dialog.getByRole('radio', { name: 'Booking & Làm hồ sơ' }).check();
      await dialog.getByRole('button', { name: 'Tiếp tục' }).click();
      await expect(dialog.getByText('Xem dự án → Booking & Làm hồ sơ', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Đóng' }).click();
      await expect(dialog).toBeHidden();
      await expect
        .poll(async () => ((await readCustomer(page, userId, customer.id)).care_stage_history as unknown[]).length)
        .toBe(4);

      // (b) Chip bậc cạnh tên mở đúng luồng 2 bước và ghi 1 mốc.
      await page.getByRole('button', { name: 'Đổi bậc · Xem dự án', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Đổi bậc khách' });
      await expect(dialog.getByText(/Bước 1\/2/)).toBeVisible();
      await dialog.getByRole('radio', { name: 'Booking & Làm hồ sơ' }).check();
      await dialog.getByRole('button', { name: 'Tiếp tục' }).click();
      await expect(dialog.getByText('Xem dự án → Booking & Làm hồ sơ', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Xác nhận đổi bậc' }).click();
      await expect(dialog).toBeHidden();
      await expect
        .poll(async () => ((await readCustomer(page, userId, customer.id)).care_stage_history as unknown[]).length)
        .toBe(5);
      saved = await readCustomer(page, userId, customer.id);
      expect((saved.care_stage_history as { stage: string }[]).at(-1)?.stage).toBe('Booking & Làm hồ sơ');
      await expectNoOverflow(page);
    });

    test('sửa tại chỗ và xoá mục cũ: việc xong, cuộc gọi, ghi chú; xoá hỏi lại lần 2', async ({ page }, testInfo) => {
      const customer = editCustomer(theme, testInfo.project.name);
      const userId = customer.owner_id;
      const panel = await openProfile(page, userId, customer);

      // (d) Sửa việc đã xong tại chỗ.
      await expect(panel.getByText('Xong việc: Tham quan căn mẫu', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Sửa việc', exact: true }).click();
      await panel.getByRole('textbox', { name: 'Tên việc' }).fill('Gọi lại chốt giá');
      await panel.getByRole('combobox', { name: 'Loại việc' }).selectOption('message');
      await panel.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(panel.getByRole('textbox', { name: 'Tên việc' })).toHaveCount(0);
      await expect(panel.getByText('Xong việc: Gọi lại chốt giá', { exact: true })).toBeVisible();
      let saved = await readCustomer(page, userId, customer.id);
      expect((saved.next_tasks as Record<string, unknown>[])[0]).toMatchObject({
        text: 'Gọi lại chốt giá',
        kind: 'message',
        due: at('10-14', '09:00'),
        done_at: at('10-13', '16:00'),
        unknown_task_key: 'keep',
      });

      // Xoá lần 2: Huỷ thì còn.
      await panel.getByRole('button', { name: 'Sửa việc', exact: true }).click();
      await panel.getByRole('button', { name: 'Xoá', exact: true }).click();
      let confirm = page.getByRole('alertdialog', { name: 'Xoá mục này?' });
      await expect(confirm.getByText('Gọi lại chốt giá', { exact: true })).toBeVisible();
      await expect(confirm.getByText('Không hoàn tác được.', { exact: true })).toBeVisible();
      await confirm.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(panel.getByText('Xong việc: Gọi lại chốt giá', { exact: true })).toBeVisible();
      expect((await readCustomer(page, userId, customer.id)).next_tasks).toHaveLength(1);

      // Xoá lần 2: Xoá thì mất (ô sửa vẫn mở sau khi huỷ hộp xác nhận).
      await panel.getByRole('button', { name: 'Xoá', exact: true }).click();
      confirm = page.getByRole('alertdialog', { name: 'Xoá mục này?' });
      await confirm.getByRole('button', { name: 'Xoá', exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(panel.getByText('Xong việc: Gọi lại chốt giá', { exact: true })).toHaveCount(0);
      await expect
        .poll(async () => ((await readCustomer(page, userId, customer.id)).next_tasks as unknown[]).length)
        .toBe(0);

      // (e) Sửa kết quả + ghi chú cuộc gọi.
      await expect(panel.getByText('Nói chuyện được', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Sửa cuộc gọi', exact: true }).click();
      await panel.getByRole('combobox', { name: 'Kết quả cuộc gọi' }).selectOption('busy');
      await panel.getByRole('textbox', { name: 'Sửa ghi chú' }).fill('Ghi chú cuộc gọi mới');
      await panel.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(panel.getByRole('combobox', { name: 'Kết quả cuộc gọi' })).toHaveCount(0);
      await expect(panel.getByText('Bận, hẹn gọi lại', { exact: true })).toBeVisible();
      await expect(panel.getByText('Ghi chú cuộc gọi mới', { exact: true })).toBeVisible();
      saved = await readCustomer(page, userId, customer.id);
      expect((saved.call_attempts as Record<string, unknown>[])[0]).toMatchObject({
        at: at('10-12', '09:00'),
        result: 'busy',
        note: 'Ghi chú cuộc gọi mới',
        duration: 120,
        device_id: 'seed-device',
        unknown_call_key: { keep: true },
      });

      // Xoá cuộc gọi đầu tiên của khách chưa đạt: cảnh báo đồng hồ SLA tiếp cận tính lại.
      await panel.getByRole('button', { name: 'Sửa cuộc gọi', exact: true }).click();
      await panel.getByRole('button', { name: 'Xoá', exact: true }).click();
      confirm = page.getByRole('alertdialog', { name: 'Xoá mục này?' });
      await expect(confirm.getByText(/đồng hồ SLA tiếp cận sẽ tính lại/i)).toBeVisible();
      await confirm.getByRole('button', { name: 'Xoá', exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect
        .poll(async () => ((await readCustomer(page, userId, customer.id)).call_attempts as unknown[]).length)
        .toBe(0);

      // Xoá một ghi chú tay.
      await expect(panel.getByText('Ghi chú tay cũ', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Sửa ghi chú', exact: true }).click();
      await panel.getByRole('button', { name: 'Xoá', exact: true }).click();
      confirm = page.getByRole('alertdialog', { name: 'Xoá mục này?' });
      await expect(confirm.getByText('Ghi chú tay cũ', { exact: true })).toBeVisible();
      await confirm.getByRole('button', { name: 'Xoá', exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(panel.getByText('Ghi chú tay cũ', { exact: true })).toHaveCount(0);
      await expect
        .poll(async () => ((await readCustomer(page, userId, customer.id)).notes_manual as unknown[]).length)
        .toBe(0);
      await expectNoOverflow(page);
    });

    test('(f) người không có quyền không thấy icon bút', async ({ page }, testInfo) => {
      const customer: Seed = {
        id: `tl02-readonly-${testInfo.project.name}-${theme}`,
        owner_id: `tl02-user-${testInfo.project.name}-${theme}`,
        full_name: 'Khách TL-02 Chỉ xem',
        phone: '0912000004',
        archived_at: at('11-01', '09:00'),
        care_stage: 'Đang chăm sóc',
        care_stage_updated_at: at('10-10', '10:00'),
        registered_at: at('10-01', '10:00'),
        created_at: at('10-01', '10:00'),
        updated_at: at('11-01', '09:00'),
        care_stage_history: [{ stage: 'Đang chăm sóc', at: at('10-10', '10:00') }],
        call_attempts: [{ at: at('10-11', '09:00'), result: 'talked', note: 'Chỉ xem' }],
        notes_manual: [{ at: at('10-12', '09:00'), text: 'Chỉ xem' }],
        next_tasks: [{ at: at('10-13', '08:00'), text: 'Chỉ xem', done_at: at('10-13', '16:00') }],
      };
      const panel = await openProfile(page, customer.owner_id, customer);
      await expect(panel.locator('[data-timeline-edit]')).toHaveCount(0);
      await expect(panel.getByRole('button', { name: /^Sửa / })).toHaveCount(0);
      await expect(panel.getByRole('button', { name: 'Đổi bậc', exact: true })).toHaveCount(0);
      await expectNoOverflow(page);
    });
  });
}
