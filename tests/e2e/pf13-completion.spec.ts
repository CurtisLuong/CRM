import { expect, type Page, type TestInfo, test } from '@playwright/test';

const NOW = new Date('2026-11-09T13:13:00.000Z');
const OWN = 'pf13-own';

const legacyTasks = [
  { at: '2026-10-10T01:00:00.000Z', text: 'Gửi bảng giá', kind: 'message', due: '2026-11-09T14:00:00.000Z' },
  { at: '2026-10-11T01:00:00.000Z', text: 'Gặp khách', kind: 'cafe', due: '2026-11-09T13:00:00.000Z' },
  { at: '2026-10-12T01:00:00.000Z', text: 'Chuẩn bị hồ sơ', kind: 'docs' },
];

function customer(id: string, ownerId: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    owner_id: ownerId,
    full_name: name,
    phone: '0901234567',
    care_stage: 'Nuôi dài hạn',
    qualified_at: '2026-10-01T00:00:00.000Z',
    care_stage_history: [{ stage: 'Nuôi dài hạn', note: null, at: '2026-10-01T00:00:00.000Z' }],
    registered_at: '2026-10-01T00:00:00.000Z',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    call_attempts: [],
    notes_manual: [],
    next_tasks: legacyTasks,
    next_call_at: '2026-11-09T13:25:00.000Z',
    next_call_end: '2026-11-09T13:45:00.000Z',
    next_call_reason: 'Gọi lần 1 · khung tối · khung gần nhất sau đăng ký và hỏi thêm nhu cầu của khách',
    ...extra,
  };
}

async function openProfile(page: Page, info: TestInfo, theme: 'light' | 'dark', forToday = false) {
  const userId = `pf13-${info.project.name}-${theme}`;
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
      email: 'pf13@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-pf13-token',
        refresh_token: 'synthetic-pf13-refresh',
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
        customer(
          OWN,
          userId,
          'Phạm Văn An',
          forToday
            ? {
                next_call_at: null,
                next_call_end: null,
                notes_manual: [{ at: NOW.toISOString(), text: 'Vừa trao đổi nhu cầu' }],
              }
            : {},
        ),
      ],
    },
  );
  await page.goto(`/ho-so/${OWN}`);
  const name = 'Phạm Văn An';
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
  test(`PF-13 ${theme}: dòng gọi đồng bộ, nhập tay; hoàn thành việc có ghi chú`, async ({ page }, info) => {
    const uid = await openProfile(page, info, theme);
    const next = page.getByRole('region', { name: 'Việc tiếp theo', exact: true });
    const call = next.getByRole('checkbox', { name: 'Hoàn thành Gọi lại', exact: true });
    const task = next.getByRole('checkbox', { name: 'Hoàn thành Gửi bảng giá', exact: true });
    await expect(next.getByText('Gọi lại', { exact: true })).toBeVisible();
    await expect(next.getByText('Gọi điện', { exact: true })).toBeVisible();
    await expect(next.getByText('Hôm nay 20:25–20:45', { exact: true })).toBeVisible();
    const box = await call.boundingBox();
    const taskBox = await task.boundingBox();
    expect(Math.abs((box?.x ?? -99) - (taskBox?.x ?? 99))).toBeLessThanOrEqual(2);
    for (const checkbox of [call, task]) {
      const target = await checkbox.locator('..').boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(44);
      expect(target?.height).toBeGreaterThanOrEqual(44);
    }
    const rows = next.locator('ul > li');
    await expect(rows.nth(0)).toContainText('Gặp khách');
    await expect(rows.nth(1)).toContainText('Gọi lại');
    await expect(rows.nth(2)).toContainText('Gửi bảng giá');
    await expect(rows.nth(3)).toContainText('Chuẩn bị hồ sơ');
    await noHorizontalScroll(page);
    const before = await readCustomer(page, uid);
    const queueBefore = await readQueue(page, uid);

    await call.click();
    let outcome = page.getByRole('dialog', { name: /Kết quả cuộc gọi/ });
    await expect(outcome).toBeVisible();
    await noHorizontalScroll(page);
    await outcome.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(outcome).not.toBeVisible();
    await expect(call).not.toBeChecked();
    expect(await readCustomer(page, uid)).toEqual(before);
    expect(await readQueue(page, uid)).toEqual(queueBefore);

    await task.click();
    let dialog = page.getByRole('dialog', { name: 'Hoàn thành việc', exact: true });
    await expect(dialog.getByText('Gửi bảng giá', { exact: true })).toBeVisible();
    await noHorizontalScroll(page);
    for (const button of ['Huỷ', 'Xác nhận xong', 'Đóng']) {
      await expect
        .poll(async () => (await dialog.getByRole('button', { name: button, exact: true }).boundingBox())?.height)
        .toBeGreaterThanOrEqual(44);
    }
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await expect(task).not.toBeChecked();
    expect(await readCustomer(page, uid)).toEqual(before);
    expect(await readQueue(page, uid)).toEqual(queueBefore);
    await task.click();
    await dialog.getByRole('textbox', { name: 'Ghi chú (tuỳ chọn)' }).fill('Bản nháp cần bỏ');
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    expect(await readQueue(page, uid)).toEqual(queueBefore);
    await expect(task).not.toBeChecked();

    await task.click();
    dialog = page.getByRole('dialog', { name: 'Hoàn thành việc', exact: true });
    await expect(dialog.getByRole('textbox')).toHaveValue('');
    await dialog.getByRole('textbox').fill('Khách thích căn góc, nhờ gửi thêm ảnh');
    await dialog.getByRole('button', { name: 'Xác nhận xong', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Đã xong việc', { exact: true })).toBeVisible();
    const tasks = await tasksOf(page, uid);
    expect(tasks[0].done_at).toBeTruthy();
    expect(tasks[0].done_note).toBe('Khách thích căn góc, nhờ gửi thêm ảnh');
    expect((await readCustomer(page, uid)).care_stage_history).toEqual(before.care_stage_history);
    const timeline = page.getByRole('tabpanel', { name: 'Dòng thời gian' });
    await expect(timeline.getByText('Xong việc: Gửi bảng giá', { exact: true })).toBeVisible();
    await expect(timeline.getByText(/Khách thích căn góc, nhờ gửi thêm ảnh/)).toBeVisible();
    await expect(timeline.getByText(/Hạn /)).toBeVisible();

    await call.click();
    outcome = page.getByRole('dialog', { name: /Kết quả cuộc gọi/ });
    await outcome.getByRole('radio', { name: 'Nói chuyện được', exact: true }).click();
    await outcome.getByRole('checkbox', { name: 'Không hẹn gọi tiếp' }).check();
    await outcome.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(outcome).not.toBeVisible();
    const saved = await readCustomer(page, uid);
    expect(saved.call_attempts).toEqual([expect.objectContaining({ origin: 'manual', result: 'talked' })]);
    expect(saved.next_call_at).toBeNull();
    await noHorizontalScroll(page);
  });
}

for (const path of ['/cong-viec', '/today']) {
  test(`PF-13 ${path}: việc thường mở hộp xác nhận`, async ({ page }, info) => {
    const uid = await openProfile(page, info, 'light', path === '/today');
    await page.context().setOffline(false);
    await page.goto(path);
    await expect(
      page
        .getByRole('button', { name: path === '/cong-viec' ? 'Hoàn tất: Gặp khách' : /Xong Phạm Văn An/, exact: true })
        .first(),
    ).toBeVisible();
    await page.context().setOffline(true);
    const before = await readCustomer(page, uid);
    const queue = await readQueue(page, uid);
    const name = path === '/cong-viec' ? 'Hoàn tất: Gặp khách' : /Xong Phạm Văn An/;
    await page.getByRole('button', { name, exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Hoàn thành việc', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
    expect(await readCustomer(page, uid)).toEqual(before);
    expect(await readQueue(page, uid)).toEqual(queue);
  });
}
