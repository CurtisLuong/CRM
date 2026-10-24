import { expect, type Page, type TestInfo, test } from '@playwright/test';

// CP-03 (Curtis 24/10/2026): Thêm việc mở đúng 5 hành động, Gọi điện chỉ đặt lịch hẹn gọi,
// bốn loại còn lại lưu next_tasks với mã message/cafe/visit/docs. Dữ liệu giả + Supabase giả 127.0.0.1.
// Ảnh chụp trong test-results cho Lead xem (360 / 390 / 1280, sáng / tối).
const NOW = new Date(2026, 9, 24, 9, 30);
const OWN = 'cp03-own';
const OTHER = 'cp03-other';
const ARCHIVED = 'cp03-archived';

const legacyTasks = [
  {
    at: '2026-10-10T01:00:00.000Z',
    text: 'Kí hợp đồng',
    kind: 'contract',
    due: '2026-10-30T02:00:00.000Z',
    side: 'me',
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
    ...extra,
  };
}

async function openProfile(page: Page, info: TestInfo, theme: 'light' | 'dark', target: 'own' | 'other' | 'archived') {
  const userId = `cp03-${info.project.name}-${theme}`;
  await page.emulateMedia({ colorScheme: theme });
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'cp03@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-cp03-token',
        refresh_token: 'synthetic-cp03-refresh',
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
  return userId;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Ảnh chụp sau khi sheet/route chạy xong animation để Lead thấy đúng trạng thái cuối. */
async function shoot(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: info.outputPath(name) });
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

async function pickKind(page: Page, label: string) {
  await page.getByRole('button', { name: 'Thêm việc' }).click();
  const dialog = page.getByRole('dialog', { name: /Thêm việc ·/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: new RegExp(label) }).click();
  return page.getByRole('dialog', { name: /Thêm việc ·/ });
}

async function saveTask(
  page: Page,
  label: string,
  text: string,
  options: { day?: string; time?: string; allDay?: boolean } = {},
) {
  const dialog = await pickKind(page, label);
  await dialog.getByLabel('Nội dung việc').fill(text);
  if (options.day) {
    await dialog.getByLabel('Ngày hạn').fill(options.day);
    if (options.allDay) await dialog.getByRole('checkbox', { name: /Cả ngày/ }).check();
    else if (options.time) await dialog.getByLabel('Giờ hạn').fill(options.time);
  }
  return dialog;
}

async function tasksOf(page: Page, userId: string) {
  return (await readCustomer(page, userId)).next_tasks as Array<Record<string, unknown>>;
}

for (const theme of ['light', 'dark'] as const) {
  test(`CP-03 ${theme}: 5 loại đúng thứ tự/icon, lưu đúng mã + hạn giờ/cả ngày/không hạn`, async ({ page }, info) => {
    const userId = await openProfile(page, info, theme, 'own');
    await page.getByRole('button', { name: 'Thêm việc' }).click();
    const picker = page.getByRole('dialog', { name: /Thêm việc ·/ });
    await expect(picker).toBeVisible();
    const actions = await picker.locator('[data-task-action]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        key: (node as HTMLElement).dataset.taskAction,
        icon: node.querySelector('svg')?.getAttribute('data-icon'),
        label: node.querySelector('.text-body-strong')?.textContent,
      })),
    );
    expect(actions).toEqual([
      { key: 'call', icon: 'call', label: 'Gọi điện' },
      { key: 'message', icon: 'message', label: 'Zalo' },
      { key: 'cafe', icon: 'cafe', label: 'Cafe và Gặp' },
      { key: 'visit', icon: 'visit', label: 'Tham quan' },
      { key: 'docs', icon: 'docs', label: 'Hồ sơ' },
    ]);
    expect(await picker.locator('[data-task-form-kind]').count()).toBe(0);
    await noHorizontalScroll(page);
    await shoot(page, info, `cp03-picker-${theme}.png`);

    await picker.getByRole('button', { name: /Zalo/ }).click();
    let dialog = page.getByRole('dialog', { name: /Thêm việc ·/ });
    await dialog.getByLabel('Nội dung việc').fill('Zalo hỏi thăm');
    await shoot(page, info, `cp03-form-${theme}.png`);
    await dialog.getByRole('button', { name: 'Lưu việc' }).click();
    await expect(dialog).toBeHidden();

    dialog = await saveTask(page, 'Cafe và Gặp', 'Cafe bàn vay', { day: '2026-10-26', time: '14:30' });
    await dialog.getByRole('button', { name: 'Lưu việc' }).click();
    await expect(dialog).toBeHidden();

    dialog = await saveTask(page, 'Tham quan', 'Tham quan nhà mẫu', { day: '2026-10-27', allDay: true });
    await dialog.getByRole('button', { name: 'Lưu việc' }).click();
    await expect(dialog).toBeHidden();

    dialog = await saveTask(page, 'Hồ sơ', 'Bổ sung sổ đỏ');
    await dialog.getByRole('button', { name: 'Lưu việc' }).click();
    await expect(dialog).toBeHidden();

    const tasks = await tasksOf(page, userId);
    const added = tasks.filter((task) =>
      ['Zalo hỏi thăm', 'Cafe bàn vay', 'Tham quan nhà mẫu', 'Bổ sung sổ đỏ'].includes(String(task.text)),
    );
    expect(added.map((task) => task.kind)).toEqual(['message', 'cafe', 'visit', 'docs']);
    const cafe = added.find((task) => task.text === 'Cafe bàn vay');
    const visit = added.find((task) => task.text === 'Tham quan nhà mẫu');
    const docs = added.find((task) => task.text === 'Bổ sung sổ đỏ');
    expect(cafe?.due_allday).toBeUndefined();
    expect(visit?.due_allday).toBe(true);
    expect(docs).toBeDefined();
    expect(docs?.due).toBeUndefined();
    const cafeLocal = await page.evaluate((iso) => {
      const at = new Date(String(iso));
      return [at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()];
    }, cafe?.due);
    expect(cafeLocal).toEqual([2026, 10, 26, 14, 30]);

    // Công việc cũ còn nguyên bên cạnh việc mới.
    expect(tasks).toEqual(expect.arrayContaining(legacyTasks.map((task) => expect.objectContaining(task))));
    await noHorizontalScroll(page);
    await shoot(page, info, `cp03-saved-${theme}.png`);
  });

  test(`CP-03 ${theme}: Gọi điện mở lịch hẹn gọi, không sinh việc trùng`, async ({ page }, info) => {
    const userId = await openProfile(page, info, theme, 'own');
    const before = await tasksOf(page, userId);
    await page.getByRole('button', { name: 'Thêm việc' }).click();
    const picker = page.getByRole('dialog', { name: /Thêm việc ·/ });
    await picker.getByRole('button', { name: /Gọi điện/ }).click();
    const call = page.getByRole('dialog', { name: /Hẹn gọi lại · Phạm Văn An/ });
    await expect(call).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Thêm việc ·/ })).toBeHidden();
    await noHorizontalScroll(page);
    await shoot(page, info, `cp03-call-${theme}.png`);
    await call.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(call).toBeHidden();

    const row = await readCustomer(page, userId);
    expect(row.next_call_at).toBeTruthy();
    expect(row.next_call_end).toBeTruthy();
    const after = await tasksOf(page, userId);
    expect(after).toHaveLength(before.length);
    expect(after.some((task) => task.kind === 'call' && !legacyTasks.some((old) => old.at === task.at))).toBe(false);
  });

  test(`CP-03 ${theme}: khách nhóm/lưu trữ chỉ xem; việc cũ contract/other vẫn hiện đúng loại + icon`, async ({
    page,
  }, info) => {
    await openProfile(page, info, theme, 'other');
    await expect(page.getByRole('button', { name: 'Thêm việc' })).toBeDisabled();
    await noHorizontalScroll(page);
    await shoot(page, info, `cp03-readonly-${theme}.png`);

    await page.goto(`/ho-so/${ARCHIVED}`);
    await expect(page.getByRole('button', { name: 'Thêm việc' })).toBeDisabled();

    await page.goto(`/ho-so/${OWN}`);
    const next = page.getByRole('region', { name: 'Việc tiếp theo', exact: true });
    await expect(next).toContainText('Kí hợp đồng');
    await expect(next.locator('svg[data-icon="contract"]').first()).toBeVisible();
    await expect(next.getByText('Việc', { exact: true }).last()).toBeVisible();
    await expect(next.locator('svg[data-icon="task"]').first()).toBeVisible();

    await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
    const done = page.locator('[data-timeline-entry]').filter({ hasText: 'Xong việc: Đã xem nhà mẫu' });
    await expect(done).toBeVisible();
    await expect(done.getByText('Tham quan')).toBeVisible();
    await expect(done.locator('svg[data-icon="visit"]')).toBeVisible();

    await page.goto('/cong-viec');
    await page.getByLabel('Lọc theo loại việc').selectOption('contract');
    const contract = page.locator('#main li').filter({ hasText: 'Phạm Văn An' }).filter({ hasText: 'Kí hợp đồng' });
    await expect(contract).toBeVisible();
    await expect(contract.getByText('Kí HĐ')).toBeVisible();
    await expect(contract.locator('svg[data-icon="contract"]')).toBeVisible();
    await page.getByLabel('Lọc theo loại việc').selectOption('other');
    const other = page.locator('#main li').filter({ hasText: 'Phạm Văn An' }).filter({ hasText: 'Việc khác' });
    await expect(other).toBeVisible();
    await expect(other.getByText('Việc', { exact: true })).toBeVisible();
    await noHorizontalScroll(page);
    await shoot(page, info, `cp03-legacy-${theme}.png`);
  });

  test(`CP-03 ${theme}: mất mạng vẫn lưu việc vào máy + hàng đợi đồng bộ`, async ({ page }, info) => {
    const userId = await openProfile(page, info, theme, 'own');
    await page.context().setOffline(true);
    const dialog = await saveTask(page, 'Zalo', 'Nhắn khi mất mạng');
    await dialog.getByRole('button', { name: 'Lưu việc' }).click();
    await expect(dialog).toBeHidden();

    const tasks = await tasksOf(page, userId);
    expect(tasks.at(-1)).toMatchObject({ text: 'Nhắn khi mất mạng', kind: 'message' });
    const queue = await readQueue(page, userId);
    expect(queue.length).toBeGreaterThan(0);
    const op = queue.at(-1);
    const payload = op?.payload as { next_tasks?: Array<Record<string, unknown>> } | undefined;
    expect(payload?.next_tasks?.at(-1)).toMatchObject({ text: 'Nhắn khi mất mạng', kind: 'message' });
    await noHorizontalScroll(page);
    await shoot(page, info, `cp03-offline-${theme}.png`);
    await page.context().setOffline(false);
  });
}
