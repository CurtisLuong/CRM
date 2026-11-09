import { expect, type Page, type TestInfo, test } from '@playwright/test';

const NOW = new Date('2026-11-09T02:30:00.000Z');
const OWN = 'pf12-own';
const OTHER = 'pf12-other';
const ARCHIVED = 'pf12-archived';

const legacyTasks = [
  {
    at: '2026-10-10T01:00:00.000Z',
    text: 'Kí hợp đồng',
    kind: 'contract',
    due: '2026-11-10T07:45:12.000Z',
    side: 'customer',
    source: 'system',
    key: 'preserve-key',
    due_original: '2026-11-10T07:45:12.000Z',
    x_future: { nested: ['giữ nguyên'] },
  },
  { at: '2026-10-11T01:00:00.000Z', text: 'Việc khác', kind: 'other', due: '2026-10-30T02:00:00.000Z', side: 'me' },
  {
    at: '2026-10-12T01:00:00.000Z',
    text: 'Đã xem nhà mẫu',
    kind: 'visit',
    due: '2026-10-20T02:00:00.000Z',
    done_at: '2026-10-20T02:00:00.000Z',
    side: 'me',
  },
];

function customer(id: string, ownerId: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    owner_id: ownerId,
    full_name: name,
    phone: '0901234567',
    care_stage: 'Đang chăm sóc',
    care_stage_history: [{ stage: 'Đang chăm sóc', note: null, at: '2026-10-01T00:00:00.000Z' }],
    registered_at: '2026-10-01T00:00:00.000Z',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    call_attempts: [],
    notes_manual: [],
    next_tasks: legacyTasks,
    next_call_at: '2026-11-10T02:00:00.000Z',
    next_call_end: '2026-11-10T04:00:00.000Z',
    next_call_reason: 'Hỏi hồ sơ',
    ...extra,
  };
}

async function openProfile(page: Page, info: TestInfo, theme: 'light' | 'dark', target: 'own' | 'other' | 'archived') {
  const userId = `pf12-${info.project.name}-${theme}`;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pf12@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pf12-token',
        refresh_token: 'synthetic-pf12-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, rows }) => {
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
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      uid: userId,
      rows: [
        customer(OWN, userId, 'Phạm Văn An'),
        customer(OTHER, 'another-sale', 'Nguyễn Thị Bình'),
        customer(ARCHIVED, userId, 'Trần Văn Cũ', { archived_at: '2026-10-15T04:00:00.000Z' }),
      ],
    },
  );
  const id = target === 'own' ? OWN : target === 'other' ? OTHER : ARCHIVED;
  await page.goto(`/ho-so/${id}`);
  const name = target === 'own' ? 'Phạm Văn An' : target === 'other' ? 'Nguyễn Thị Bình' : 'Trần Văn Cũ';
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.context().setOffline(true);
  return userId;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function readCustomer(page: Page, userId: string, customerId = OWN) {
  return page.evaluate(
    async ({ uid, id }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const get = db.transaction('customers', 'readonly').objectStore('customers').get(id);
        get.onsuccess = () => resolve(get.result as Record<string, unknown>);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return row;
    },
    { uid: userId, id: customerId },
  );
}

async function readQueue(page: Page, userId: string) {
  return page.evaluate(async (uid) => {
    const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const list = db.transaction('queue', 'readonly').objectStore('queue').getAll();
      list.onsuccess = () => resolve(list.result as Array<Record<string, unknown>>);
      list.onerror = () => reject(list.error);
    });
    db.close();
    return rows;
  }, userId);
}

async function tasksOf(page: Page, userId: string) {
  return (await readCustomer(page, userId)).next_tasks as Array<Record<string, unknown>>;
}

for (const theme of ['light', 'dark'] as const) {
  test(`PF-12 ${theme}: sửa đủ ba trường, bảo toàn dữ liệu; huỷ và đóng không ghi`, async ({ page }, info) => {
    const userId = await openProfile(page, info, theme, 'own');
    const next = page.getByRole('region', { name: 'Việc tiếp theo', exact: true });
    const add = next.getByRole('button', { name: 'Thêm việc', exact: true });
    await expect(add).toHaveText('Thêm');
    await expect(add.locator('[data-icon="add"]')).toBeVisible();
    expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const edit = next.getByRole('button', { name: 'Sửa việc Kí hợp đồng', exact: true });
    expect((await edit.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const completeTarget = next.getByRole('checkbox', { name: 'Hoàn thành Kí hợp đồng', exact: true }).locator('..');
    expect((await completeTarget.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await completeTarget.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    await edit.click();
    let dialog = page.getByRole('dialog', { name: 'Sửa việc · Phạm Văn An' });
    expect(
      (await dialog.getByRole('button', { name: 'Đóng', exact: true }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(dialog.getByLabel('Nội dung việc')).toHaveValue('Kí hợp đồng');
    await expect(dialog.locator('[data-task-form-kind]')).toHaveText('Kí HĐ');
    await expect(dialog.getByLabel('Ngày hạn')).toHaveValue('2026-11-10');
    await expect(dialog.getByLabel('Giờ hạn')).toHaveValue('14:45');
    await expect(dialog.getByRole('checkbox', { name: /Cả ngày/ })).not.toBeChecked();
    await noHorizontalScroll(page);

    await dialog.getByLabel('Nội dung việc').fill('   ');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Nhập nội dung việc trước khi lưu.');
    expect(await tasksOf(page, userId)).toEqual(legacyTasks);
    await dialog.getByRole('button', { name: 'Đổi loại' }).click();
    await dialog.getByRole('button', { name: /Tham quan/ }).click();
    await dialog.getByLabel('Nội dung việc').fill('Xem căn hộ mẫu');
    await dialog.getByLabel('Ngày hạn').fill('2026-11-12');
    await dialog.getByRole('checkbox', { name: /Cả ngày/ }).check();
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`pf12-edit-${theme}.png`) });
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog).toBeHidden();
    let saved = await tasksOf(page, userId);
    expect(saved).toEqual([
      { ...legacyTasks[0], text: 'Xem căn hộ mẫu', kind: 'visit', due: '2026-11-12T02:00:00.000Z', due_allday: true },
      ...legacyTasks.slice(1),
    ]);
    expect((await readQueue(page, userId)).length).toBeGreaterThan(0);

    // Mở lại đúng dữ liệu cả ngày, chuyển sang có giờ rồi xoá hạn.
    await next.getByRole('button', { name: 'Sửa việc Xem căn hộ mẫu' }).click();
    dialog = page.getByRole('dialog', { name: /Sửa việc ·/ });
    await expect(dialog.getByLabel('Nội dung việc')).toHaveValue('Xem căn hộ mẫu');
    await expect(dialog.locator('[data-task-form-kind]')).toHaveText('Tham quan');
    await expect(dialog.getByLabel('Ngày hạn')).toHaveValue('2026-11-12');
    await expect(dialog.getByRole('checkbox', { name: /Cả ngày/ })).toBeChecked();
    await dialog.getByRole('checkbox', { name: /Cả ngày/ }).uncheck();
    await dialog.getByLabel('Giờ hạn').fill('16:20');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog).toBeHidden();
    saved = await tasksOf(page, userId);
    expect(saved[0]).toEqual({
      ...legacyTasks[0],
      text: 'Xem căn hộ mẫu',
      kind: 'visit',
      due: '2026-11-12T09:20:00.000Z',
    });
    await next.getByRole('button', { name: 'Sửa việc Xem căn hộ mẫu' }).click();
    await dialog.getByLabel('Ngày hạn').fill('');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog).toBeHidden();
    const { due: _due, ...withoutDue } = legacyTasks[0];
    expect((await tasksOf(page, userId))[0]).toEqual({ ...withoutDue, text: 'Xem căn hộ mẫu', kind: 'visit' });

    const beforeCancel = await readCustomer(page, userId);
    const queueBefore = await readQueue(page, userId);
    await next.getByRole('button', { name: 'Sửa việc Xem căn hộ mẫu' }).click();
    await expect(dialog.getByLabel('Ngày hạn')).toHaveValue('');
    await dialog.getByLabel('Nội dung việc').fill('Không lưu bản nháp');
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await expect(dialog).toBeHidden();
    await next.getByRole('button', { name: 'Sửa việc Xem căn hộ mẫu' }).click();
    await expect(dialog.getByLabel('Nội dung việc')).toHaveValue('Xem căn hộ mẫu');
    await dialog.getByLabel('Nội dung việc').fill('Đóng không ghi');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await readCustomer(page, userId)).toEqual(beforeCancel);
    expect(await readQueue(page, userId)).toEqual(queueBefore);
    await noHorizontalScroll(page);

    await next.getByRole('button', { name: 'Hẹn gọi lại', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Hẹn gọi lại · Phạm Văn An/ })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test(`PF-12 ${theme}: lưu trữ gọn, bắt buộc lý do, Khác cần ghi chú, khôi phục được`, async ({ page }, info) => {
    const userId = await openProfile(page, info, theme, 'own');
    const before = await readCustomer(page, userId);
    const section = page.getByRole('region', { name: 'Lưu trữ khách', exact: true });
    await expect(page.getByText(/Dùng cho khách nhập nhầm/)).toHaveCount(0);
    const archive = section.getByRole('button', { name: 'Lưu trữ khách', exact: true });
    await expect(archive.locator('[data-icon="archive"]')).toBeVisible();
    await expect(section.getByRole('link', { name: 'Xem khách đã lưu trữ' })).toHaveAttribute(
      'href',
      '/khach-hang/luu-tru',
    );
    await archive.scrollIntoViewIfNeeded();
    expect((await archive.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`pf12-archive-block-${theme}.png`) });
    await archive.click();
    const dialog = page.getByRole('dialog', { name: 'Lưu trữ khách Phạm Văn An?' });
    const submit = dialog.getByRole('button', { name: 'Lưu trữ khách', exact: true });
    await expect(submit).toBeDisabled();
    expect(Number(await submit.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThan(1);
    await expect(dialog.locator('p').filter({ hasText: /^Chọn lý do$/ })).toBeVisible();
    await expect(dialog.locator('ul')).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`pf12-archive-reason-${theme}.png`) });
    await dialog.getByLabel('Lý do lưu trữ', { exact: true }).selectOption('khac');
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Ghi chú lý do lưu trữ').fill('   ');
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Ghi chú lý do lưu trữ').fill('Nhập thử');
    await expect(submit).toBeEnabled();
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await archive.click();
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Lý do lưu trữ', { exact: true }).selectOption('so_sai');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Khôi phục', exact: true })).toBeVisible();
    const saved = await readCustomer(page, userId);
    expect(saved.archived_at).toBeTruthy();
    expect(saved.next_tasks).toEqual(before.next_tasks);
    expect(saved.interactions).toEqual([
      expect.objectContaining({ kind: 'archived', reason: 'so_sai', channel: 'other' }),
    ]);
    await page.getByRole('button', { name: 'Khôi phục', exact: true }).click();
    await expect(archive).toBeVisible();
    expect((await readCustomer(page, userId)).archived_at).toBeNull();
    await noHorizontalScroll(page);
  });

  test(`PF-12 ${theme}: khách người khác và khách lưu trữ không sửa được việc`, async ({ page }, info) => {
    await openProfile(page, info, theme, 'other');
    for (const id of [OTHER, ARCHIVED]) {
      if (id === ARCHIVED) {
        await page.context().setOffline(false);
        await page.goto(`/ho-so/${id}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Trần Văn Cũ' })).toBeVisible();
      }
      const next = page.getByRole('region', { name: 'Việc tiếp theo', exact: true });
      await expect(next.getByRole('button', { name: 'Thêm việc' })).toBeDisabled();
      await expect(next.getByRole('button', { name: 'Sửa việc Kí hợp đồng' })).toBeDisabled();
      await expect(next.getByRole('button', { name: 'Hẹn gọi lại', exact: true })).toBeDisabled();
      await noHorizontalScroll(page);
    }
  });
}
