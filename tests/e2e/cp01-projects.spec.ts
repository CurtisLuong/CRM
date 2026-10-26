import { expect, type Page, type TestInfo, test } from '@playwright/test';

// CP-01 (Curtis 23/10/2026): Nhu cầu & căn là tab đầu/mặc định; dự án chọn nhiều từ catalog,
// thêm/lưu trữ mềm ngay trong hồ sơ; ô trống ẩn sau Bổ sung. Dữ liệu giả + Supabase giả 127.0.0.1.
const NOW = new Date(2026, 9, 23, 9, 30);
const LONG_PROJECT = 'Dự án Nhà ở xã hội Tràng Duệ - giai đoạn 2 (tên dài kiểm tra xuống dòng)';
type ProjectRow = { id: string; name: string; archived_at?: string | null };
type Write = { method: string; url: string; body: string };

async function open(
  page: Page,
  info: TestInfo,
  theme: 'light' | 'dark',
  projectNames: string[],
  customerProjects: string[] = ['Dự án A', 'D cũ'],
) {
  await page.emulateMedia({ colorScheme: theme });
  const userId = `cp01-${info.project.name}-${theme}`;
  const customerId = `cp01-customer-${info.project.name}-${theme}`;
  const serverProjects: ProjectRow[] = projectNames.map((name, index) => ({ id: `p-${index + 1}`, name }));
  const writes: Write[] = [];
  let failInsert = false;

  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/rest/v1/projects')) {
      const method = request.method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Access-Control-Expose-Headers': 'Content-Range',
            'Content-Range': `0-${Math.max(0, serverProjects.filter((row) => !row.archived_at).length - 1)}/${serverProjects.filter((row) => !row.archived_at).length}`,
          },
          body: JSON.stringify(serverProjects.filter((row) => !row.archived_at)),
        });
        return;
      }
      if (method === 'POST') {
        writes.push({ method, url, body: request.postData() || '' });
        if (failInsert) {
          await route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ code: '42501', message: 'RLS từ chối' }),
          });
          return;
        }
        const parsed = JSON.parse(request.postData() || '{}');
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const created = rows.map((row: { name?: string }, index: number) => ({
          id: `p-new-${serverProjects.length + index + 1}`,
          name: String(row.name || ''),
        }));
        serverProjects.push(...created);
        const wantsObject = String(request.headers().accept || '').includes('vnd.pgrst.object');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(wantsObject ? created[0] : created),
        });
        return;
      }
      if (method === 'PATCH') {
        writes.push({ method, url, body: request.postData() || '' });
        const id = new URL(url).searchParams.get('id')?.replace('eq.', '') || '';
        const patch = JSON.parse(request.postData() || '{}');
        for (const row of serverProjects) if (row.id === id) Object.assign(row, patch);
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      if (method === 'DELETE') {
        writes.push({ method, url, body: request.postData() || '' });
        await route.fulfill({ status: 204, body: '' });
        return;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: /\/rest\/v1\/(buildings|units|project_apt_types|building_apt_types)\?/.test(url)
        ? { 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '*/0' }
        : {},
      body: url.includes('/rest/v1/') ? '[]' : '{}',
    });
  });

  await page.addInitScript(
    ({ uid, projects }) => {
      const user = {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'cp01@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-cp01-token',
          refresh_token: 'synthetic-cp01-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      // Cache catalog để mở hồ sơ khi mất mạng vẫn thấy dự án.
      localStorage.setItem(
        `crm_catalog_v2:${uid}`,
        JSON.stringify({ projects, buildings: [], units: [], projectTypes: [], buildingTypes: [] }),
      );
    },
    { uid: userId, projects: serverProjects },
  );

  await page.goto('/');
  await page.evaluate(
    async ({ uid, id, projects: seededProjects }) => {
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
        tx.objectStore('customers').put({
          id,
          owner_id: uid,
          full_name: 'Nguyễn Thị Hưởng',
          phone: '0901234567',
          gender: 'Nữ',
          care_stage: 'Đang chăm sóc',
          purpose: 'Ở',
          apt_area: 0,
          projects: seededProjects,
          created_at: '2026-10-10T00:00:00.000Z',
          updated_at: '2026-10-15T00:00:00.000Z',
          next_tasks: [],
          call_attempts: [],
          notes_manual: [],
          advanced: { x_future: { keep: true }, must_have: 'Gần trường học' },
          x_future: { keep: true },
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, id: customerId, projects: customerProjects },
  );
  await page.goto(`/ho-so/${customerId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Nguyễn Thị Hưởng' })).toBeVisible();
  return {
    userId,
    customerId,
    writes,
    failInsert: (value: boolean) => {
      failInsert = value;
    },
  };
}

async function readCustomer(page: Page, userId: string, customerId: string) {
  return page.evaluate(
    async ({ name, id }) => {
      const request = indexedDB.open(name, 2);
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
    { name: `crm_khach_hang__${encodeURIComponent(userId)}`, id: customerId },
  );
}

const noHorizontalScroll = async (page: Page) => {
  const view = await page.evaluate(() => ({ vw: innerWidth, sw: document.documentElement.scrollWidth }));
  expect(view.sw, `${view.vw}px`).toBeLessThanOrEqual(view.vw);
};

for (const theme of ['light', 'dark'] as const) {
  test(`CP-01 ${theme}: mặc định Nhu cầu & căn, Bổ sung gọn, ô ngắn 2/hàng, không tràn ngang`, async ({
    page,
  }, info) => {
    await open(page, info, theme, [LONG_PROJECT, 'Dự án B'], [LONG_PROJECT]);
    await noHorizontalScroll(page);

    await expect(page.getByRole('tab', { name: 'Nhu cầu & căn' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Mục đích mua')).toHaveValue('Ở');
    await expect(page.getByLabel('Diện tích (m²)')).toHaveValue('0');
    await expect(page.getByLabel('Loại căn')).toHaveCount(0);
    // PC-01 (Curtis 26/10): Dự án quan tâm mặc định là ô gọn hiện tên đã chọn; danh mục chỉ xổ ra khi bấm.
    const projectsBox = page.getByRole('button', { name: /^Dự án quan tâm/ });
    await expect(projectsBox).toContainText(LONG_PROJECT);
    await expect(page.getByRole('list', { name: 'Dự án trong danh mục' })).toHaveCount(0);

    // Ô ngắn 2 ô một hàng ở 360/390; 3 ô cùng hàng khi đủ chỗ desktop.
    const purpose = await page.getByLabel('Mục đích mua').boundingBox();
    const area = await page.getByLabel('Diện tích (m²)').boundingBox();
    expect(Math.abs((purpose?.y ?? -999) - (area?.y ?? 999))).toBeLessThanOrEqual(2);
    const list = await projectsBox.boundingBox();
    expect(list?.width || 0).toBeGreaterThan((purpose?.width || 0) * 1.5);

    await page.getByLabel('Mục đích mua').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`cp01-needs-default-${theme}.png`) });

    const supplement = page.getByRole('button', { name: /^(Bổ sung|Thu gọn)/ });
    await expect(supplement).toHaveAttribute('aria-expanded', 'false');
    await supplement.click();
    await expect(supplement).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Loại căn')).toBeVisible();
    const expandedPurpose = await page.getByLabel('Mục đích mua').boundingBox();
    const type = await page.getByLabel('Loại căn').boundingBox();
    const expandedArea = await page.getByLabel('Diện tích (m²)').boundingBox();
    const finance = await page.getByLabel('Tài chính sẵn có (VNĐ)').boundingBox();
    expect(Math.abs((expandedPurpose?.y ?? -999) - (type?.y ?? 999))).toBeLessThanOrEqual(2);
    expect(Math.abs((expandedArea?.y ?? -999) - (finance?.y ?? 999))).toBeLessThanOrEqual(2);
    if (info.project.name === 'desktop-1280') {
      // 4 ô ngắn cùng hàng khi đủ chỗ.
      expect(Math.abs((expandedPurpose?.y ?? -999) - (expandedArea?.y ?? 999))).toBeLessThanOrEqual(2);
      expect(Math.abs((type?.y ?? -999) - (finance?.y ?? 999))).toBeLessThanOrEqual(2);
    }

    // Sở thích BĐS nằm trong cùng nút Nâng cao với Nhu cầu theo đợt + Người cùng quyết định.
    await expect(page.getByText('Sở thích bất động sản')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nâng cao' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Nâng cao' }).click();
    await expect(page.getByText('Sở thích bất động sản')).toBeVisible();
    await expect(page.getByLabel('Khu vực')).toBeVisible();
    await expect(page.getByText('Nhu cầu theo đợt')).toBeVisible();
    await expect(page.getByLabel('Tên người cùng quyết định')).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByText('Sở thích bất động sản').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`cp01-needs-expanded-${theme}.png`) });
  });

  test(`CP-01 ${theme}: chọn A+B, thêm C, huỷ/xác nhận lưu trữ B`, async ({ page }, info) => {
    const { userId, customerId, writes } = await open(page, info, theme, ['Dự án A', 'Dự án B']);
    await page.getByRole('button', { name: /^Dự án quan tâm/ }).click(); // PC-01: ô gọn, bấm mới mở
    await expect(page.getByRole('checkbox', { name: 'Dự án A' })).toBeChecked();
    await expect(page.getByRole('list', { name: 'Dự án cũ trong hồ sơ' })).toContainText('D cũ');

    await page.getByRole('checkbox', { name: 'Dự án B' }).click();
    await expect(page.getByText('Đã cập nhật dự án quan tâm', { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await readCustomer(page, userId, customerId)).projects)
      .toEqual(['Dự án A', 'D cũ', 'Dự án B']);

    await page.getByRole('button', { name: 'Thêm mới' }).click();
    await page.getByRole('textbox', { name: 'Tên dự án mới' }).fill('  Dự án C  ');
    await page.getByRole('button', { name: 'Thêm dự án' }).click();
    await expect(page.getByText('Đã thêm dự án', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Dự án C' })).toBeChecked();
    await expect.poll(async () => (await readCustomer(page, userId, customerId)).projects).toContain('Dự án C');
    expect(writes.filter((write) => write.method === 'POST' && write.url.includes('/projects'))).toHaveLength(1);

    const patches = writes.filter((write) => write.method === 'PATCH' && write.url.includes('/projects')).length;
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Lưu trữ dự án Dự án B' }).click();
    await page.waitForTimeout(200);
    expect(writes.filter((write) => write.method === 'PATCH' && write.url.includes('/projects'))).toHaveLength(patches);
    await expect(page.getByRole('checkbox', { name: 'Dự án B' })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Lưu trữ dự án Dự án B' }).click();
    await expect(page.getByText('Đã lưu trữ dự án', { exact: true })).toBeVisible();
    await expect
      .poll(() => writes.filter((write) => write.method === 'PATCH' && write.url.includes('/projects')).length)
      .toBe(patches + 1);
    const archiveWrite = writes.find((write) => write.method === 'PATCH' && write.url.includes('/projects'));
    expect(JSON.parse(archiveWrite?.body || '{}')).toEqual({ archived_at: expect.any(String) });
    expect(writes.filter((write) => write.method === 'DELETE' && write.url.includes('/projects'))).toHaveLength(0);
    expect((await readCustomer(page, userId, customerId)).projects).toEqual(['Dự án A', 'D cũ', 'Dự án B', 'Dự án C']);
    await expect(page.getByRole('list', { name: 'Dự án cũ trong hồ sơ' })).toContainText('Dự án B');
    await expect(page.getByRole('checkbox', { name: 'Dự án B' })).toHaveCount(0);

    await noHorizontalScroll(page);
    await page.getByRole('list', { name: 'Dự án cũ trong hồ sơ' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`cp01-projects-archived-${theme}.png`) });
  });

  test(`CP-01 ${theme}: offline vẫn chọn/lưu; lỗi thêm dự án không mất dữ liệu`, async ({ page, context }, info) => {
    const { userId, customerId, failInsert } = await open(page, info, theme, ['Dự án A', 'Dự án B']);
    await page.getByRole('button', { name: /^Dự án quan tâm/ }).click(); // PC-01: ô gọn, bấm mới mở

    await context.setOffline(true);
    await expect(page.getByText(/Cần mạng để thêm hoặc lưu trữ dự án/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm mới' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Lưu trữ dự án Dự án B' })).toBeDisabled();

    await page.getByRole('checkbox', { name: 'Dự án B' }).click();
    await expect
      .poll(async () => (await readCustomer(page, userId, customerId)).projects)
      .toEqual(['Dự án A', 'D cũ', 'Dự án B']);

    await context.setOffline(false);
    failInsert(true);
    await expect(page.getByText(/Cần mạng để thêm hoặc lưu trữ dự án/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Thêm mới' }).click();
    await page.getByRole('textbox', { name: 'Tên dự án mới' }).fill('Dự án C');
    await page.getByRole('button', { name: 'Thêm dự án' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'RLS' })).toBeVisible();
    expect((await readCustomer(page, userId, customerId)).projects).toEqual(['Dự án A', 'D cũ', 'Dự án B']);
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`cp01-projects-error-${theme}.png`) });
  });
}
