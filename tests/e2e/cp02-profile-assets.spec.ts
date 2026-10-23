import { expect, type Page, type TestInfo, test } from '@playwright/test';

// CP-02 (Curtis 23/10/2026): ảnh đại diện/ảnh bìa là khung bấm được, hai nguồn ảnh (máy · clipboard),
// xem đầy đủ object-contain, đổi/xoá có xác nhận; tài liệu nhóm theo loại, chỉ nhóm có tệp.
// Dữ liệu giả + Supabase giả 127.0.0.1. Ảnh chụp trong test-results cho Lead xem.
const NOW = new Date(2026, 9, 23, 9, 30);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXQAAAAASUVORK5CYII=',
  'base64',
);

const emptyId = 'cp02-empty';
const fullId = 'cp02-full';

const documents = [
  {
    id: 'doc-photo',
    customer_id: fullId,
    label: 'Sổ đỏ.jpg',
    kind: 'anh',
    storage_path: 'u/cp02-full/doc-photo.jpg',
    mime: 'image/jpeg',
    size: 2_516_582,
  },
  {
    id: 'doc-pdf',
    customer_id: fullId,
    label: 'Hợp đồng mua bán.pdf',
    kind: 'khac',
    storage_path: 'u/cp02-full/doc-pdf.pdf',
    mime: 'application/pdf',
    size: 512,
  },
  {
    id: 'doc-sheet',
    customer_id: fullId,
    label: 'Bảng lương.xlsx',
    kind: 'khac',
    storage_path: 'u/cp02-full/doc-sheet.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: null,
  },
];

async function open(page: Page, info: TestInfo, theme: 'light' | 'dark', options: { archived?: boolean } = {}) {
  await page.emulateMedia({ colorScheme: theme });
  const userId = `cp02-${info.project.name}-${theme}`;
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/storage/v1/object/public/customer-avatars/')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      return;
    }
    if (url.includes('/rest/v1/documents')) {
      const rows = url.includes(encodeURIComponent(fullId)) || url.includes(fullId) ? documents : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: url.includes('/rest/v1/') ? '[]' : '{}',
    });
  });
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'cp02@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-cp02-token',
        refresh_token: 'synthetic-cp02-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, archived, empty, full }) => {
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
          id: empty,
          owner_id: uid,
          full_name: 'Nguyễn Thị Hưởng',
          phone: '0901234567',
          care_stage: 'Đang chăm sóc',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
          next_tasks: [],
          call_attempts: [],
          notes_manual: [],
        });
        tx.objectStore('customers').put({
          id: full,
          owner_id: uid,
          full_name: 'Trần Văn Đức',
          phone: '0912345678',
          care_stage: 'Xem dự án',
          avatar_path: 'u/cp02-full/avatar.png',
          cover_path: 'u/cp02-full/cover.png',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
          next_tasks: [],
          call_attempts: [],
          notes_manual: [],
          ...(archived ? { archived_at: '2026-10-22T03:00:00.000Z' } : {}),
        });
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      uid: userId,
      archived: !!options.archived,
      empty: emptyId,
      full: fullId,
    },
  );
  return userId;
}

async function openProfile(page: Page, info: TestInfo, theme: 'light' | 'dark', id: string, options = {}) {
  const userId = await open(page, info, theme, options);
  await page.goto(`/ho-so/${id}`);
  await expect(page.getByTestId('customer-profile')).toBeVisible();
  return userId;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
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

for (const theme of ['light', 'dark'] as const) {
  test(`CP-02 ${theme}: khung ảnh trống có dấu cộng, đủ 44px, hộp thoại đúng hai nguồn`, async ({ page }, info) => {
    await openProfile(page, info, theme, emptyId);
    await page.getByRole('tab', { name: /Tài liệu/ }).click();
    const avatar = page.getByRole('button', { name: 'Ảnh đại diện' });
    const cover = page.getByRole('button', { name: 'Ảnh bìa' });
    await expect(avatar).toBeVisible();
    await expect(cover).toBeVisible();
    expect(await avatar.locator('svg').count()).toBeGreaterThan(0);
    expect(await cover.locator('svg').count()).toBeGreaterThan(0);
    const avatarBox = await avatar.boundingBox();
    const coverBox = await cover.boundingBox();
    expect(avatarBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(avatarBox?.height || 0).toBeGreaterThanOrEqual(44);
    expect(coverBox?.height || 0).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`cp02-empty-${theme}.png`) });

    await avatar.click();
    const dialog = page.getByRole('dialog', { name: 'Thêm ảnh đại diện' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Chọn từ máy' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Dán từ clipboard' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`cp02-picker-${theme}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await cover.click();
    await expect(page.getByRole('dialog', { name: 'Thêm ảnh bìa' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Thêm ảnh bìa' })).toBeHidden();
  });

  test(`CP-02 ${theme}: chọn từ máy chỉ tải sau thao tác, lưu vào hồ sơ`, async ({ page }, info) => {
    const userId = await openProfile(page, info, theme, emptyId);
    await page.getByRole('tab', { name: /Tài liệu/ }).click();
    let uploads = 0;
    page.on('request', (request) => {
      if (request.url().includes('/storage/v1/object/customer-avatars/')) uploads += 1;
    });
    await page.getByRole('button', { name: 'Ảnh đại diện' }).click();
    expect(uploads).toBe(0);
    await page.locator('input[aria-label="Chọn ảnh đại diện từ máy"]').setInputFiles({
      name: 'dai-dien.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.getByText('Đã thêm ảnh đại diện', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Thêm ảnh đại diện' })).toBeHidden();
    expect(uploads).toBe(1);
    const row = await readCustomer(page, userId, emptyId);
    expect(String(row.avatar_path)).toContain(`${userId}/${emptyId}/avatar-`);
    await expect(page.getByRole('button', { name: 'Ảnh đại diện' }).locator('img')).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`cp02-uploaded-${theme}.png`) });
  });

  test(`CP-02 ${theme}: có ảnh xem object-contain; Đổi ảnh mở hai nguồn; Xoá cần xác nhận`, async ({ page }, info) => {
    await openProfile(page, info, theme, fullId);
    await page.getByRole('tab', { name: /Tài liệu/ }).click();
    await page.getByRole('button', { name: 'Ảnh bìa' }).click();
    const viewer = page.getByRole('dialog', { name: 'Ảnh bìa' });
    await expect(viewer).toBeVisible();
    const image = viewer.locator('[data-testid="photo-viewer-cover"]');
    await expect(image).toBeVisible();
    await expect(image).toHaveClass(/object-contain/);
    await expect(viewer.getByRole('button', { name: 'Đổi ảnh' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Xoá ảnh' })).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`cp02-viewer-${theme}.png`) });

    await viewer.getByRole('button', { name: 'Đổi ảnh' }).click();
    const picker = page.getByRole('dialog', { name: 'Đổi ảnh bìa' });
    await expect(picker.getByRole('button', { name: 'Chọn từ máy' })).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Dán từ clipboard' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();

    await page.getByRole('button', { name: 'Ảnh bìa' }).click();
    await page.getByRole('button', { name: 'Xoá ảnh' }).click();
    const confirm = page.getByRole('dialog', { name: 'Xoá ảnh bìa?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Huỷ' }).click();
    await expect(page.getByRole('dialog', { name: 'Ảnh bìa' })).toBeVisible();
    await expect(page.getByTestId('photo-viewer-cover')).toBeVisible();

    await page.getByRole('button', { name: 'Xoá ảnh' }).click();
    await page.getByRole('dialog', { name: 'Xoá ảnh bìa?' }).getByRole('button', { name: 'Xoá ảnh' }).click();
    await expect(page.getByText('Đã xoá ảnh bìa', { exact: true })).toBeVisible();
    await expect(page.getByText('Ảnh bìa', { exact: true }).first()).toBeVisible();
  });

  test(`CP-02 ${theme}: tài liệu nhóm theo loại, chỉ nhóm có tệp, không lộ storage_path`, async ({ page }, info) => {
    await openProfile(page, info, theme, fullId);
    await page.getByRole('tab', { name: /Tài liệu/ }).click();
    await page.getByRole('tab', { name: /Tài liệu/ }).click();
    await expect(page.getByText('Sổ đỏ.jpg')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^Ảnh chụp/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^PDF/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^Bảng tính/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^Văn bản/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 3, name: /^Khác/ })).toHaveCount(0);
    await expect(page.getByText('Ảnh JPG · 2,4 MB')).toBeVisible();
    await expect(page.getByText('PDF · 512 B')).toBeVisible();
    await expect(page.getByText(/u\/cp02-full\/doc-photo/)).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`cp02-documents-${theme}.png`) });

    await page.locator('input[aria-label="Tải tài liệu"]').setInputFiles({
      name: 'giay-to.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
    });
    await expect(page.getByText('Đã tải tài liệu lên', { exact: true })).toBeVisible();
    await expect(page.getByText('giay-to.pdf')).toBeVisible();
  });

  test(`CP-02 ${theme}: khách lưu trữ chỉ xem ảnh và tài liệu`, async ({ page }, info) => {
    await openProfile(page, info, theme, fullId, { archived: true });
    await page.getByRole('tab', { name: /Tài liệu/ }).click();
    await page.getByRole('button', { name: 'Ảnh đại diện' }).click();
    const viewer = page.getByRole('dialog', { name: 'Ảnh đại diện' });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Đổi ảnh' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Xoá ảnh' })).toHaveCount(0);
    await expect(viewer.getByText('Khách nhóm và khách lưu trữ chỉ xem ảnh.')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Tài liệu/ }).click();
    await expect(page.getByText('Sổ đỏ.jpg')).toBeVisible();
    await expect(page.locator('input[aria-label="Tải tài liệu"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Xoá / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mở' }).first()).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath(`cp02-readonly-${theme}.png`) });
  });
}
