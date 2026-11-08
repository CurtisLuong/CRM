import { expect, type Page, test } from '@playwright/test';

const NOW = new Date('2026-11-08T03:00:00Z');
const image = (name: string, width = 1600, height = 1000) => ({
  name,
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><circle cx="800" cy="500" r="300" fill="black"/></svg>`,
  ),
});

// PDF tự sinh có xref hợp lệ, hai trang; không cần thư viện hay fixture ngoài phạm vi.
function pdf() {
  const stream = '0.2 g 20 20 180 260 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 320] /Resources << >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 320] /Resources << >> /Contents 5 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

async function demo(page: Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) => route.fulfill({ json: [] }));
  await page.goto('/today');
  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await page.goto('/tai-lieu');
}
async function create(page: Page, title: string, files: ReturnType<typeof image>[], text = '') {
  await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
  await page.getByLabel('Tiêu đề', { exact: true }).fill(title);
  await page.getByLabel('Nội dung chữ').fill(text);
  await page.getByRole('dialog', { name: 'Thêm tài liệu' }).locator('input[type="file"]').setInputFiles(files);
  await page.getByRole('button', { name: 'Lưu tài liệu' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function centered(page: Page) {
  // Đo sau khi hiệu ứng mở hộp kết thúc, tránh lấy khung trung gian của animate-pop.
  await page.getByRole('dialog').evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished));
  });
  await expect
    .poll(async () => {
      const box = await page.getByRole('dialog').boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport) return Infinity;
      return Math.max(
        Math.abs(box.x + box.width / 2 - viewport.width / 2),
        Math.abs(box.y + box.height / 2 - viewport.height / 2),
      );
    })
    .toBeLessThan(2);
  const box = await page.getByRole('dialog').boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThan(0);
  expect(box.y).toBeGreaterThan(0);
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect(box.width).toBeLessThanOrEqual(960);
  expect(box.height).toBeLessThan(viewport.height);
  if (viewport.width < 640) expect(box.width).toBeGreaterThan(viewport.width - 24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
for (const theme of ['light', 'dark'] as const) {
  test(`DV-01 ${theme}: viewer giữa màn, zoom/pan, kích thước gốc, focus, không cuộn nền`, async ({ page }, info) => {
    await page.addInitScript((value) => localStorage.setItem('sk-theme', value), theme);
    await demo(page);
    await create(page, 'Ảnh thử', [image('Ảnh mẫu.svg')]);
    const trigger = page.getByRole('button', { name: 'Xem Ảnh mẫu.svg', exact: true });
    await trigger.click();
    // DV-02 (Curtis 08/11): tiêu đề trình xem = "{dự án}. {tiêu đề mục}" (mục Chung: tiêu đề mục); ảnh vẫn có alt = tên tệp.
    await expect(page.getByRole('dialog', { name: 'Ảnh thử' })).toBeVisible();
    const img = page.getByRole('dialog').getByRole('img', { name: 'Ảnh mẫu.svg' });
    await expect(img).toBeVisible();
    await centered(page);
    for (const name of ['Đổi tệp', 'Xoá', 'Chia sẻ']) {
      const action = page.getByRole('dialog').getByRole('button', { name, exact: true });
      const box = await action.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
      await expect(action.locator('svg')).toHaveCount(1);
    }
    const initial = await img.boundingBox();
    await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
    await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan((initial?.width ?? 0) * 1.4);
    await page.getByRole('button', { name: 'Vừa màn hình' }).click();
    await expect
      .poll(async () => Math.abs(((await img.boundingBox())?.width ?? 0) - (initial?.width ?? 0)))
      .toBeLessThan(1);
    await page.getByRole('button', { name: 'Kích thước gốc' }).click();
    await expect.poll(async () => (await img.boundingBox())?.width).toBe(1600);
    const surface = page.getByTestId('document-viewport');
    await surface.hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -50);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(1600);
    await page.getByRole('button', { name: 'Vừa màn hình' }).click();
    await img.dblclick();
    await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(initial?.width ?? 0);
    const close = await page.getByRole('button', { name: 'Đóng', exact: true }).boundingBox();
    expect(close?.width).toBeGreaterThanOrEqual(44);
    expect(close?.height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('body').getAttribute('data-scroll-locked')).toBe('1');
    await page.screenshot({ path: info.outputPath(`dv01-${theme}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('DV-01 kho tài liệu: đúng tệp, chia sẻ riêng tệp, đổi giữ vị trí, xoá cả mục có xác nhận', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { shares?: unknown[] }).shares = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as Window & { shares?: unknown[] }).shares?.push({
          text: data.text,
          files: data.files?.map((file) => file.name),
        });
      },
    });
  });
  await demo(page);
  await create(page, 'Hai ảnh', [image('Một.svg'), image('Hai.svg')]);
  await page.getByRole('button', { name: 'Xem Hai.svg' }).click();
  // DV-02 (Curtis 08/11): tiêu đề trình xem = "{dự án}. {tiêu đề mục}" (mục Chung: tiêu đề mục); ảnh vẫn có alt = tên tệp.
  const dialog = page.getByRole('dialog', { name: 'Hai ảnh' });
  await expect(dialog.getByRole('img', { name: 'Hai.svg' })).toBeVisible();
  await expect(dialog.getByText('2/2')).toBeVisible();
  await dialog.getByRole('button', { name: 'Chia sẻ' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { shares?: unknown[] }).shares))
    .toEqual([{ files: ['Hai.svg'] }]);
  await dialog.getByLabel('Chọn tệp thay thế').setInputFiles(image('Mới.svg'));
  await expect(dialog.getByRole('img', { name: 'Mới.svg' })).toBeVisible();
  await expect(dialog.getByText('2/2')).toBeVisible();
  await dialog.getByRole('button', { name: 'Tệp trước' }).click();
  await expect(dialog.getByRole('img', { name: 'Một.svg' })).toBeVisible();
  await expect(dialog.getByText('1/2')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Xem Mới.svg' }).click();
  await expect(page.getByRole('dialog').getByText('2/2')).toBeVisible();
  page.once('dialog', async (confirm) => {
    expect(confirm.message()).toBe('Xoá tệp “Mới.svg”?');
    await confirm.accept();
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(dialog.getByRole('img', { name: 'Một.svg' })).toBeVisible();
  await expect(dialog.getByText('1/1')).toHaveCount(0);
  page.once('dialog', async (confirm) => {
    expect(confirm.message()).toBe('Xoá cả tài liệu “Hai ảnh”?');
    await confirm.dismiss();
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(dialog.getByRole('img', { name: 'Một.svg' })).toBeVisible();
  page.once('dialog', async (confirm) => {
    expect(confirm.message()).toBe('Xoá cả tài liệu “Hai ảnh”?');
    await confirm.accept();
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Hai ảnh' })).toHaveCount(0);
});

test('DV-01 PDF: worker trong bản build, trang vẽ theo DPR, cuộn dọc và zoom', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await demo(page);
  await create(page, 'PDF scan', [{ name: 'Scan.pdf', mimeType: 'application/pdf', buffer: pdf() }]);
  expect(requests.some((url) => /\/pdf-[^/]*\.js/.test(url))).toBe(false);
  await page.getByRole('button', { name: 'Xem Scan.pdf' }).click();
  const pages = page.getByTestId('pdf-page');
  await expect(pages).toHaveCount(2);
  await expect.poll(() => pages.first().evaluate((node) => (node as HTMLCanvasElement).width)).toBeGreaterThan(0);
  expect(requests.some((url) => url.includes('pdf.worker') && new URL(url).hostname === 'localhost')).toBe(true);
  const metrics = await pages.first().evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return {
      width: canvas.width,
      cssWidth: canvas.getBoundingClientRect().width,
      dpr: devicePixelRatio,
      pixel: [...(canvas.getContext('2d')?.getImageData(40, 40, 1, 1).data ?? [])],
    };
  });
  expect(Math.abs(metrics.width - metrics.cssWidth * metrics.dpr)).toBeLessThan(2);
  expect(metrics.pixel[3]).toBe(255);
  const initial = (await pages.first().boundingBox())?.width ?? 0;
  await page.getByRole('button', { name: 'Phóng to' }).click();
  await expect.poll(async () => (await pages.first().boundingBox())?.width ?? 0).toBeGreaterThan(initial);
  const surface = page.getByTestId('document-viewport');
  await surface.evaluate((node) => {
    node.scrollTop = 300;
  });
  await expect.poll(() => surface.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(pages).toHaveCount(0);
});

test('DV-01 mẫu sống: không xem trước được, lỗi và ngoại tuyến đều có chữ', async ({ page }) => {
  await page.goto('/dev/ui-kit');
  await page.getByRole('button', { name: 'Bảng thông tin.docx', exact: true }).click();
  await expect(page.getByText('Chưa xem trước được loại tệp này')).toBeVisible();
  await page.getByRole('button', { name: 'Tệp sau' }).click();
  await expect(page.getByText('Chưa tải được tệp', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await page.getByRole('button', { name: 'Tệp sau' }).click();
  await expect(page.getByText('Cần mạng để tải tệp này')).toBeVisible();
});

test('DV-01 hồ sơ: Mở PDF ngay trong app, không popup/tab ngoài', async ({ page }) => {
  const uid = 'dv01-profile';
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/storage/v1/object/sign/')) {
      await route.fulfill({ json: { signedURL: '/object/signed.pdf' } });
      return;
    }
    if (url.includes('/storage/v1/object/signed.pdf')) {
      await route.fulfill({ contentType: 'application/pdf', body: pdf() });
      return;
    }
    if (url.includes('/rest/v1/documents')) {
      await route.fulfill({
        json: [
          {
            id: 'doc',
            label: 'Hợp đồng.pdf',
            customer_id: 'dv01',
            kind: 'khac',
            mime: 'application/pdf',
            size: 900,
            storage_path: 'u/doc.pdf',
          },
        ],
      });
      return;
    }
    await route.fulfill({ json: url.includes('/rest/v1/') ? [] : {} });
  });
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'dv01@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-dv01',
        refresh_token: 'synthetic-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, uid);
  await page.goto('/');
  await page.evaluate(async (id) => {
    const request = indexedDB.open(`crm_khach_hang__${id}`, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('queue'))
        db.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      tx.objectStore('customers').put({
        id: 'dv01',
        owner_id: id,
        full_name: 'Khách DV',
        phone: '0900000000',
        care_stage: 'Đang chăm sóc',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        next_tasks: [],
        call_attempts: [],
        notes_manual: [],
      });
      tx.objectStore('meta').put({ key: 'legacy-imported', at: '2026-01-01T00:00:00Z' });
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, uid);
  await page.goto('/ho-so/dv01');
  await page.getByRole('tab', { name: /Tài liệu/ }).click();
  await expect(page.getByText('Hợp đồng.pdf', { exact: true })).toBeVisible();
  const popups: Page[] = [];
  page.on('popup', (popup) => popups.push(popup));
  await page.getByRole('button', { name: 'Mở', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Hợp đồng.pdf' })).toBeVisible();
  await expect(page.getByTestId('pdf-page').first()).toBeVisible();
  expect(popups).toHaveLength(0);
  expect(page.context().pages()).toHaveLength(1);
});

test('DV-01 cử chỉ điện thoại: chụm hai ngón, kéo, chạm đúp và vuốt chuyển tệp khi vừa màn hình', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 640, 'Cử chỉ hai ngón kiểm trên viewport điện thoại.');
  await demo(page);
  await create(page, 'Cử chỉ', [image('Một.svg'), image('Hai.svg')]);
  await page.getByRole('button', { name: 'Xem Một.svg' }).click();
  const img = page.getByRole('dialog').getByRole('img', { name: 'Một.svg' });
  await expect(img).toBeVisible();
  await centered(page);
  const initial = (await img.boundingBox())?.width ?? 0;
  const surface = page.getByTestId('document-viewport');
  const box = await surface.boundingBox();
  if (!box) throw new Error('Không có vùng xem');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point, index) => ({ ...point, id: index + 1 })),
    });
  await touch('touchStart', [
    { x: cx - 30, y: cy },
    { x: cx + 30, y: cy },
  ]);
  await touch('touchMove', [
    { x: cx - 60, y: cy },
    { x: cx + 60, y: cy },
  ]);
  await touch('touchEnd', []);
  await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(initial * 1.8);
  const beforePan = await surface.evaluate((node) => node.scrollLeft);
  await touch('touchStart', [{ x: cx, y: cy }]);
  await touch('touchMove', [{ x: cx - 40, y: cy }]);
  await touch('touchEnd', []);
  await expect.poll(() => surface.evaluate((node) => node.scrollLeft)).toBeGreaterThan(beforePan);
  await page.getByRole('button', { name: 'Vừa màn hình' }).click();
  await touch('touchStart', [{ x: cx, y: cy }]);
  await touch('touchEnd', []);
  await touch('touchStart', [{ x: cx, y: cy }]);
  await touch('touchEnd', []);
  await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(initial * 1.8);
  await page.getByRole('button', { name: 'Vừa màn hình' }).click();
  await touch('touchStart', [{ x: cx + 60, y: cy }]);
  await touch('touchMove', [{ x: cx - 60, y: cy }]);
  await touch('touchEnd', []);
  await expect(page.getByRole('dialog', { name: 'Cử chỉ' }).getByRole('img', { name: 'Hai.svg' })).toBeVisible();
  await session.detach();
});
