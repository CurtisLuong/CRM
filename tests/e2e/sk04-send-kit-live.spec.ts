import { expect, type Page, test } from '@playwright/test';

const UID = '10000000-0000-4000-8000-000000000001';
const PEER = '10000000-0000-4000-8000-000000000002';
const ITEM_ID = '20000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-05T03:00:00Z');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
  'base64',
);
const row = (id: string, title: string, project: string | null = null) => ({
  id,
  owner_id: PEER,
  title,
  body: 'Chữ gửi khách',
  project,
  files: [] as { id: string; name: string; type: string; size: number; path: string }[],
  sort_order: 0,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  deleted_at: null as string | null,
});
type Row = ReturnType<typeof row>;

async function prepare(page: Page, pending = false) {
  const state = {
    rows: [] as Row[],
    writes: [] as Row[],
    downloads: [] as string[],
    notify: (_type: string, _id: string) => {},
    joined: false,
  };
  await page.clock.install({ time: NOW });
  await page.routeWebSocket('ws://127.0.0.1:54321/**', (socket) => {
    socket.onMessage((message) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(message));
      if (event === 'phx_join') {
        const filters = payload.config.postgres_changes.map((filter: object, index: number) => ({
          ...filter,
          id: index + 1,
        }));
        socket.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]),
        );
        if (topic.includes('crm-send-kit')) {
          state.joined = true;
          state.notify = (type, id) =>
            socket.send(
              JSON.stringify([
                joinRef,
                null,
                topic,
                'postgres_changes',
                {
                  ids: [1],
                  data: {
                    schema: 'public',
                    table: 'send_kit_items',
                    type,
                    commit_timestamp: NOW.toISOString(),
                    columns: [{ name: 'id', type: 'uuid' }],
                    record: type === 'DELETE' ? {} : { id },
                    old_record: { id },
                    errors: null,
                  },
                },
              ]),
            );
        }
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, count?: number) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
          ...(count === undefined ? {} : { 'content-range': `0-0/${count}` }),
        },
      });
    if (url.pathname.endsWith('/rpc/team_list'))
      return json([
        { user_id: UID, full_name: 'Nguyễn A', is_me: true },
        { user_id: PEER, full_name: 'Nguyễn B' },
      ]);
    if (url.pathname.endsWith('/send_kit_items')) {
      if (method === 'GET') {
        const rows = [...state.rows].sort((a, b) => a.id.localeCompare(b.id));
        return json(rows, rows.length);
      }
      const body = request.postDataJSON() as Row;
      state.writes.push(body);
      state.rows = [...state.rows.filter((item) => item.id !== body.id), body];
      return json([body]);
    }
    if (url.pathname.includes('/storage/v1/object/')) {
      state.downloads.push(url.pathname);
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    if (url.pathname.endsWith('/customers'))
      return json(
        [
          {
            id: 'sk04-customer',
            owner_id: UID,
            full_name: 'Khách thử',
            phone: '0900000000',
            projects: ['Dự án A'],
            care_stage: 'Đang chăm sóc',
            next_tasks: [],
            call_attempts: [],
            interactions: [],
            created_at: NOW.toISOString(),
            updated_at: NOW.toISOString(),
          },
        ],
        1,
      );
    return json(url.pathname.includes('/rest/v1/') ? [] : {}, 0);
  });
  await page.addInitScript(
    ({ uid, now, pending }) => {
      const user = {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'sk04@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: now,
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-sk04-token',
          refresh_token: 'synthetic-sk04-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => !pending || localStorage.getItem('sk04-seeded') === 'yes',
      });
    },
    { uid: UID, now: NOW.toISOString(), pending },
  );
  return state;
}

for (const width of [360, 1280]) {
  test.describe(`SK-04 ${width}px`, () => {
    test.beforeEach(({ page }) => {
      test.skip(page.viewportSize()?.width !== width, 'Nghiệm thu 360 và 1280px.');
    });

    test('mở /today tự đẩy kho cũ, chỉ tải tệp server khi vào Tài liệu', async ({ page }) => {
      const state = await prepare(page, true);
      await page.goto('/today');
      await page.evaluate(
        async ({ uid, id, now }) => {
          const request = indexedDB.open(`crm_send_kit__${uid}`, 1);
          request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('items', 'readwrite');
            tx.objectStore('items').put({
              id,
              title: 'Tài liệu tối qua',
              text: 'Chữ đang chờ',
              project: 'Dự án A',
              order: 7,
              updatedAt: now,
              files: [],
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          db.close();
          localStorage.setItem('sk04-seeded', 'yes');
        },
        { uid: UID, id: ITEM_ID, now: NOW.getTime() - 60_000 },
      );
      const remote = row('20000000-0000-4000-8000-000000000002', 'Ảnh đồng nghiệp');
      remote.files = [
        { id: 'f1', name: 'anh.png', type: 'image/png', size: PNG.length, path: `${PEER}/remote/f1.png` },
      ];
      state.rows = [remote];
      await page.goto('/today');
      await expect.poll(() => state.writes.length).toBe(1);
      expect(state.writes[0]).toMatchObject({
        id: ITEM_ID,
        owner_id: UID,
        title: 'Tài liệu tối qua',
        body: 'Chữ đang chờ',
        project: 'Dự án A',
        sort_order: 7,
      });
      await expect(page).toHaveURL(/\/today$/);
      expect(state.downloads).toHaveLength(0);
      await page.goto('/tai-lieu');
      await expect(page.getByRole('heading', { name: 'Tài liệu tối qua' })).toBeVisible();
      await expect.poll(() => state.downloads.length).toBe(1);
      await expect(page.getByAltText('anh.png')).toBeVisible();
    });

    test('tấm gửi tự nhận/sửa/xoá từ Realtime, tick đúng Chung và dự án đang chọn', async ({ page }) => {
      const state = await prepare(page);
      state.rows = [row(ITEM_ID, 'Tài liệu dự án A', 'Dự án A')];
      await page.goto('/tai-lieu?customer=sk04-customer');
      await expect(page.getByRole('checkbox')).toHaveCount(1);
      await expect(page.getByRole('checkbox').first()).toBeChecked();
      await expect.poll(() => state.joined).toBe(true);
      const common = row('20000000-0000-4000-8000-000000000002', 'Mục Chung mới');
      const projectA = row('20000000-0000-4000-8000-000000000003', 'Bảng giá mới', 'Dự án A');
      const projectB = row('20000000-0000-4000-8000-000000000004', 'Dự án khác', 'Dự án B');
      state.rows.push(common, projectA, projectB);
      for (const item of [common, projectA, projectB]) state.notify('INSERT', item.id);
      await page.clock.runFor(350);
      await expect(page.getByRole('checkbox', { name: /Bảng giá mới/ })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: /Mục Chung mới/ })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: /Dự án khác/ })).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(3);
      for (const checkbox of await page.getByRole('checkbox').all()) await expect(checkbox).toBeChecked();
      projectA.title = 'Bảng giá đã sửa';
      projectA.updated_at = new Date(NOW.getTime() + 1000).toISOString();
      state.notify('UPDATE', projectA.id);
      await page.clock.runFor(350);
      await expect(page.getByRole('checkbox', { name: /Bảng giá đã sửa/ })).toBeVisible();
      common.deleted_at = new Date(NOW.getTime() + 2000).toISOString();
      common.updated_at = common.deleted_at;
      state.notify('UPDATE', common.id);
      await page.clock.runFor(350);
      await expect(page.getByRole('checkbox', { name: /Mục Chung mới/ })).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(2);
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });
  });
}
