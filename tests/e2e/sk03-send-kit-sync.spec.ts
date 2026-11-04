import { expect, type Page, test } from '@playwright/test';

const UID = '10000000-0000-4000-8000-000000000001';
const PEER = '10000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-04T03:05:00Z');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
  'base64',
);
const customer = {
  id: 'sk03-customer',
  owner_id: UID,
  full_name: 'Khách thử tài liệu',
  phone: '0900000000',
  projects: [],
  care_stage: 'Đang chăm sóc',
  next_tasks: [],
  call_attempts: [],
  interactions: [],
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
};
const serverItem = (id: string, owner = UID) => ({
  id,
  owner_id: owner,
  title: owner === PEER ? 'Bảng giá của B' : 'Tài liệu của tôi',
  body: 'Chữ gửi khách',
  project: null,
  files: [] as { id: string; name: string; type: string; size: number; path: string }[],
  sort_order: owner === PEER ? 1 : 0,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  deleted_at: null as string | null,
});
type ServerItem = ReturnType<typeof serverItem>;

async function open(
  page: Page,
  options: {
    rows?: ServerItem[];
    legacy?: boolean;
    readError?: boolean;
    admin?: boolean;
    downloadError?: boolean;
  } = {},
) {
  const state = {
    rows: options.rows ?? [],
    writes: [] as ServerItem[],
    uploads: [] as string[],
    downloads: [] as string[],
    readError: options.readError ?? false,
    writeError: false,
    downloadError: options.downloadError ?? false,
  };
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = async (body: unknown, count?: number) =>
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
        { user_id: UID, full_name: 'Nguyễn A', is_me: true, is_admin: !!options.admin },
        { user_id: PEER, full_name: 'Nguyễn B', is_me: false, is_admin: false },
      ]);
    if (url.pathname.endsWith('/send_kit_items')) {
      if (method === 'GET') {
        if (state.readError)
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"lỗi giả"}' });
        const cursor = url.searchParams.get('id');
        const rows = state.rows
          .filter(
            (row) => !cursor || (cursor.startsWith('eq.') ? row.id === cursor.slice(3) : row.id > cursor.slice(3)),
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        return json(rows, rows.length);
      }
      const body = request.postDataJSON() as ServerItem;
      state.writes.push(body);
      if (state.writeError)
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"lỗi ghi giả"}' });
      const previous = state.rows.find((row) => row.id === body.id);
      if (method === 'POST' && previous) return json([]);
      if (method === 'PATCH' && previous && Date.parse(previous.updated_at) > Date.parse(body.updated_at))
        return json([]);
      state.rows = [...state.rows.filter((row) => row.id !== body.id), body];
      return json([body]);
    }
    if (url.pathname.includes('/storage/v1/object/')) {
      if (method === 'POST') {
        state.uploads.push(url.pathname);
        return json({ Key: 'ok' });
      }
      state.downloads.push(url.pathname);
      if (state.downloadError)
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"lỗi tải giả"}' });
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    if (url.pathname.endsWith('/customers')) return json(method === 'GET' ? [customer] : [], 1);
    return json(url.pathname.includes('/rest/v1/') ? [] : {}, 0);
  });
  await page.addInitScript(
    ({ uid, now }) => {
      const user = {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'sk03@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: now,
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-sk03-token',
          refresh_token: 'synthetic-sk03-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      const state = window as Window & { __sk03Shares?: { text?: string; files: string[] }[] };
      state.__sk03Shares = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          state.__sk03Shares?.push({ text: data.text, files: (data.files ?? []).map((file) => file.name) });
        },
      });
    },
    { uid: UID, now: NOW.toISOString() },
  );
  await page.goto('/today');
  if (options.legacy)
    await page.evaluate(
      async ({ uid, now }) => {
        const request = indexedDB.open(`crm_send_kit__${uid}`, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('items', 'readwrite');
          for (const [index, id] of [
            '20000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000002',
          ].entries())
            tx.objectStore('items').put({
              id,
              title: `Mục cũ ${index + 1}`,
              text: `Chữ cũ ${index + 1}`,
              project: index ? 'Dự án A' : null,
              order: index + 5,
              updatedAt: now,
              files: index
                ? [
                    {
                      id: '30000000-0000-4000-8000-000000000001',
                      name: 'anh-cu.png',
                      type: 'image/png',
                      size: 3,
                      blob: new Blob(['anh'], { type: 'image/png' }),
                    },
                  ]
                : [],
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      { uid: UID, now: NOW.getTime() - 60_000 },
    );
  await page.goto('/tai-lieu');
  await expect(page.getByRole('heading', { name: 'Tài liệu gửi khách' })).toBeVisible();
  return state;
}

for (const viewport of [360, 1280]) {
  test.describe(`SK-03 ${viewport}px`, () => {
    test.beforeEach(({ page }) => {
      test.skip(page.viewportSize()?.width !== viewport, 'Nghiệm thu 360 và 1280px.');
    });

    test('thấy tài liệu nhóm, tên người tạo, quyền sửa và tick/gửi được mục đồng nghiệp', async ({ page }) => {
      const state = await open(page, { rows: [serverItem('a'), serverItem('b', PEER)] });
      const peerCard = page.getByRole('heading', { name: 'Bảng giá của B' }).locator('..').locator('..');
      await expect(peerCard.getByText('👤 Nguyễn B')).toBeVisible();
      await expect(peerCard.getByRole('button')).toHaveCount(0);
      const ownCard = page.getByRole('heading', { name: 'Tài liệu của tôi' }).locator('..').locator('..');
      await expect(ownCard.getByRole('button', { name: 'Sửa', exact: true })).toBeVisible();
      await page.goto('/tai-lieu?customer=sk03-customer');
      await expect(page.getByRole('checkbox')).toHaveCount(2);
      await expect(page.getByRole('checkbox').first()).toBeChecked();
      await expect(page.getByRole('checkbox').last()).toBeChecked();
      await page.getByRole('button', { name: 'Gửi qua Zalo (2 mục · 0 tệp)' }).click();
      await expect
        .poll(() => page.evaluate(() => (window as Window & { __sk03Shares?: unknown[] }).__sk03Shares?.length))
        .toBe(1);
      state.rows = state.rows.map((row) =>
        row.owner_id === PEER
          ? {
              ...row,
              deleted_at: new Date(NOW.getTime() + 1000).toISOString(),
              updated_at: new Date(NOW.getTime() + 1000).toISOString(),
            }
          : row,
      );
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.getByRole('checkbox')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Gửi qua Zalo (1 mục · 0 tệp)' })).toBeEnabled();
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });

    test('2 mục cũ được upsert đúng id, chữ, dự án, thứ tự và tệp', async ({ page }) => {
      const state = await open(page, { legacy: true });
      await expect(page.getByRole('heading', { name: 'Mục cũ 1' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Mục cũ 2' })).toBeVisible();
      await expect.poll(() => state.writes.length).toBe(2);
      expect(state.writes.map((row) => row.id).sort()).toEqual([
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
      ]);
      expect(state.writes.find((row) => row.sort_order === 5)).toMatchObject({ body: 'Chữ cũ 1', project: null });
      expect(state.writes.find((row) => row.sort_order === 6)).toMatchObject({
        body: 'Chữ cũ 2',
        project: 'Dự án A',
        files: [
          {
            name: 'anh-cu.png',
            path: `${UID}/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000001.png`,
          },
        ],
      });
      expect(state.uploads).toHaveLength(1);
      await expect(page.getByText('Chưa đồng bộ', { exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Mục cũ 2' })).toBeVisible();
    });

    test('server 500 giữ nguyên tài liệu trên máy và dòng báo không tự mất', async ({ page }) => {
      const state = await open(page, { legacy: true, readError: true });
      await expect(page.getByRole('heading', { name: 'Mục cũ 1' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Mục cũ 2' })).toBeVisible();
      await expect(page.getByText('Chưa tải được tài liệu mới — đang dùng bản trên máy')).toBeVisible();
      await expect(page.getByText('Chưa đồng bộ', { exact: true })).toHaveCount(2);
      await page.clock.runFor(6000);
      await expect(page.getByText('Chưa tải được tài liệu mới — đang dùng bản trên máy')).toBeVisible();
      expect(state.writes).toHaveLength(0);
      state.readError = false;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => state.writes.length).toBe(2);
      await expect(page.getByText('Chưa tải được tài liệu mới — đang dùng bản trên máy')).toHaveCount(0);
    });

    test('tệp 51MB bị từ chối và không lọt vào mục đã lưu', async ({ page }) => {
      const state = await open(page);
      await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
      await page.getByLabel('Tiêu đề').fill('Giới hạn tệp');
      // Playwright giới hạn buffer truyền qua setInputFiles ở 50MB; tạo File ngay trong trình duyệt.
      await page.locator('input[type=file]').evaluate((input) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(51 * 1024 * 1024)], 'video-lon.mp4', { type: 'video/mp4' }));
        (input as HTMLInputElement).files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await expect(page.getByRole('dialog').getByText('video-lon.mp4 quá 50MB — nén lại rồi đăng')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bỏ tệp video-lon.mp4' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Lưu tài liệu' }).click();
      await expect.poll(() => state.writes.length).toBe(1);
      expect(state.writes[0]?.files).toEqual([]);
      expect(state.uploads).toHaveLength(0);
    });

    test('tệp server tải một lần rồi gửi offline đủ 2 ảnh; xoá mềm vẫn giữ blob trên máy', async ({
      page,
      context,
    }) => {
      const kit = serverItem('a');
      kit.files = ['f1', 'f2'].map((id) => ({
        id,
        name: `${id}.png`,
        type: 'image/png',
        size: PNG.length,
        path: `${UID}/a/${id}.png`,
      }));
      const state = await open(page, { rows: [kit] });
      await expect.poll(() => state.downloads.length).toBe(2);
      await expect(page.getByAltText('f2.png')).toBeVisible();
      await context.setOffline(true);
      await page.evaluate(() => history.pushState({}, '', '/tai-lieu?customer=sk03-customer'));
      await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
      await page.getByRole('button', { name: 'Gửi qua Zalo (1 mục · 2 tệp)' }).click();
      await expect
        .poll(() => page.evaluate(() => (window as Window & { __sk03Shares?: unknown[] }).__sk03Shares?.length))
        .toBe(1);
      const shares = await page.evaluate(
        () => (window as Window & { __sk03Shares?: { files: string[] }[] }).__sk03Shares,
      );
      expect(shares?.[0]?.files).toEqual(['f1.png', 'f2.png']);
      await page.getByRole('button', { name: 'Quản lý' }).click();
      await page.getByRole('button', { name: 'Xoá', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Tài liệu của tôi' })).toHaveCount(0);
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => state.rows[0]?.deleted_at).toBeTruthy();
    });

    test('thiếu tệp offline báo rõ và không gọi chia sẻ thiếu tệp', async ({ page, context }) => {
      const kit = serverItem('a');
      kit.files = [{ id: 'f1', name: 'chua-tai.png', type: 'image/png', size: PNG.length, path: `${UID}/a/f1.png` }];
      await open(page, { rows: [kit], downloadError: true });
      await expect(page.getByRole('heading', { name: 'Tài liệu của tôi' })).toBeVisible();
      await context.setOffline(true);
      await page.evaluate(() => {
        history.pushState({}, '', '/tai-lieu?customer=sk03-customer');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.getByRole('button', { name: 'Gửi qua Zalo (1 mục · 1 tệp)' }).click();
      await expect(page.getByRole('alert')).toContainText('chua-tai.png chưa có trên máy');
      expect(await page.evaluate(() => (window as Window & { __sk03Shares?: unknown[] }).__sk03Shares?.length)).toBe(0);
    });
  });
}
