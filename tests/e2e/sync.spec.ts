import { expect, type Page, test } from '@playwright/test';

// T5.9 / D-021 qua supabase-js thật (PostgREST giả bằng route): gộp mảng khi flush + bỏ op bị từ chối.
const USER = 't59-e2e-user';
const API = 'http://127.0.0.1:54321';
const OLD_NOTE = { text: 'Ghi chú cũ', at: '2026-10-01T00:00:00.000Z', extension: { kept: true } };
const MAC_NOTE = { text: 'Ghi chú của Mac', at: '2026-10-17T03:00:00.000Z' };
const PHONE_NOTE = { text: 'Ghi chú của điện thoại', at: '2026-10-17T03:05:00.000Z' };
const base = {
  owner_id: USER,
  phone: '0905900000',
  care_stage: 'Đang chăm sóc',
  care_stage_history: [{ stage: 'Đang chăm sóc', note: null, at: '2026-10-01T00:00:00.000Z' }],
  registered_at: '2026-10-01T00:00:00.000Z',
  call_attempts: [],
  next_tasks: [],
};
const MERGE = { ...base, id: 't59-merge', full_name: 'Khách gộp ghi chú', notes_manual: [OLD_NOTE] };
const REJECT = { ...base, id: 't59-reject', full_name: 'Khách bị từ chối', notes_manual: [] };

type Server = Record<string, Record<string, unknown>>;

async function install(page: Page, server: Server, patches: { url: string; body: Record<string, unknown> }[]) {
  await page.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${API}/rest/v1/customers**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (!id || !server[id]) return route.fallback();
    if (request.method() === 'GET') {
      const select = url.searchParams.get('select') || '*';
      const row = server[id];
      const data = select === '*' ? row : Object.fromEntries(select.split(',').map((c) => [c, row[c] ?? null]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push({ url: request.url(), body });
      if (body.care_stage === 'Bậc không hợp lệ')
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '23514',
            message: 'new row for relation "customers" violates check constraint "customers_care_stage_check"',
            details: null,
            hint: null,
          }),
        });
      const expected = url.searchParams.get('updated_at')?.replace(/^eq\./, '');
      const matched = !expected || expected === server[id].updated_at;
      if (matched) server[id] = { ...server[id], ...body, updated_at: '2026-10-17T04:00:00+00:00' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(matched ? [{ id }] : []),
      });
    }
    return route.fallback();
  });
  await page.addInitScript((userId) => {
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'curtis@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: user.id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-t59-token',
        refresh_token: 'synthetic-t59-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, USER);
}

/** Ghi khách + op chờ vào IndexedDB như máy offline để lại (op mang bản gốc mảng arrayBase). */
async function seedOffline(page: Page, rows: Record<string, unknown>[], ops: Record<string, unknown>[]) {
  await page.evaluate(
    async ({ userId, rows, ops }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
        request.onupgradeneeded = () => {
          const current = request.result;
          if (!current.objectStoreNames.contains('customers'))
            current.createObjectStore('customers', { keyPath: 'id' });
          if (!current.objectStoreNames.contains('queue'))
            current.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
          if (!current.objectStoreNames.contains('meta')) current.createObjectStore('meta', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'queue', 'meta'], 'readwrite');
        for (const row of rows) tx.objectStore('customers').put(row);
        for (const op of ops) tx.objectStore('queue').add(op);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { userId: USER, rows, ops },
  );
}

test('điện thoại offline thêm ghi chú → flush gộp với ghi chú Mac trên server; op 23514 bỏ được sau xác nhận', async ({
  page,
}) => {
  const server: Server = {
    [MERGE.id]: { ...MERGE, notes_manual: [MAC_NOTE, OLD_NOTE], updated_at: '2026-10-17T03:00:00+00:00' },
    [REJECT.id]: { ...REJECT, updated_at: '2026-10-17T03:00:00+00:00' },
  };
  const patches: { url: string; body: Record<string, unknown> }[] = [];
  await install(page, server, patches);
  await page.goto('/');
  const now = '2026-10-17T03:05:00.000Z';
  await seedOffline(
    page,
    [
      { ...MERGE, notes_manual: [PHONE_NOTE, OLD_NOTE], updated_at: now },
      { ...REJECT, care_stage: 'Bậc không hợp lệ', updated_at: now },
    ],
    [
      {
        type: 'update',
        recordId: MERGE.id,
        payload: { notes_manual: [PHONE_NOTE, OLD_NOTE], updated_at: now },
        ts: now,
        arrayBase: { notes_manual: [OLD_NOTE] },
      },
      { type: 'update', recordId: REJECT.id, payload: { care_stage: 'Bậc không hợp lệ', updated_at: now }, ts: now },
    ],
  );
  await page.reload();

  // Gộp: server giữ ghi chú Mac + ghi chú điện thoại + thuộc tính lạ; ghi có điều kiện updated_at.
  await expect.poll(() => (server[MERGE.id].notes_manual as { text: string }[]).length).toBe(3);
  expect(server[MERGE.id].notes_manual).toEqual([PHONE_NOTE, MAC_NOTE, OLD_NOTE]);
  const mergePatch = patches.find((p) => p.url.includes(MERGE.id));
  expect(mergePatch?.url).toContain('updated_at=eq.');
  expect(Object.keys(mergePatch?.body ?? {}).sort()).toEqual(['notes_manual', 'updated_at']);

  // Op bị từ chối: chỉ báo lỗi → mở chi tiết → lý do dễ hiểu → bỏ có xác nhận.
  const indicator = page.getByRole('button', { name: 'Lỗi đồng bộ' });
  await expect(indicator).toBeVisible();
  await indicator.click();
  const sheet = page.getByRole('dialog', { name: 'Đồng bộ' });
  await expect(sheet.getByText('Khách bị từ chối')).toBeVisible();
  await expect(sheet.getByText(/Dữ liệu không hợp lệ theo quy tắc của máy chủ/)).toBeVisible();
  await expect(sheet.getByText('Thay đổi: bậc chăm sóc')).toBeVisible();
  await sheet.getByRole('button', { name: 'Bỏ thao tác này' }).click();
  await expect(sheet.getByText(/Khách sẽ quay về dữ liệu đang có trên máy chủ/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Xác nhận bỏ' }).click();
  await expect(sheet.getByText('Dữ liệu trên máy này đã khớp máy chủ')).toBeVisible();

  const local = await page.evaluate(async (userId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T>(store: string, key?: string) =>
      new Promise<T>((resolve, reject) => {
        const os = db.transaction(store).objectStore(store);
        const req = key ? os.get(key) : os.getAll();
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      });
    const out = {
      rejected: await read<Record<string, unknown>>('customers', 't59-reject'),
      merged: await read<Record<string, unknown>>('customers', 't59-merge'),
      queue: await read<unknown[]>('queue'),
      discarded: await read<{ ops: unknown[] }>('meta', 'discarded-ops'),
    };
    db.close();
    return out;
  }, USER);
  expect(local.queue).toEqual([]);
  expect(local.rejected.care_stage).toBe('Đang chăm sóc'); // về giá trị server
  expect(local.discarded.ops).toHaveLength(1); // bản sao op đã bỏ còn trong máy
  expect(local.merged.notes_manual).toEqual([PHONE_NOTE, MAC_NOTE, OLD_NOTE]); // cache tải lại từ server
});
