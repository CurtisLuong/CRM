import { expect, type Page, test } from '@playwright/test';

const NOW = new Date('2026-11-08T03:00:00Z');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
  'base64',
);
const image = (name: string, width = 1600, height = 1000) => ({
  name,
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><circle cx="800" cy="500" r="300" fill="black"/></svg>`,
  ),
});

// PDF tự sinh có xref hợp lệ, hai trang; cùng dạng với DV-01.
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

function layoutOf(node: HTMLElement | SVGElement) {
  const element = node as HTMLElement;
  return { width: element.offsetWidth, height: element.offsetHeight };
}
async function demo(page: Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) => route.fulfill({ json: [] }));
  await page.goto('/today');
  await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
  await page.goto('/tai-lieu');
}
async function createItem(
  page: Page,
  title: string,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>,
  project?: string,
) {
  await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
  await page.getByLabel('Tiêu đề', { exact: true }).fill(title);
  if (project) await page.getByLabel('Thuộc nhóm').selectOption(project);
  await page.getByRole('dialog', { name: 'Thêm tài liệu' }).locator('input[type="file"]').setInputFiles(files);
  await page.getByRole('button', { name: 'Lưu tài liệu' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function centered(page: Page) {
  await page.getByRole('dialog').evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished));
  });
}
async function frame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
function touchSession(page: Page) {
  return page
    .context()
    .newCDPSession(page)
    .then((session) => ({
      async dispatch(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) {
        await session.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: points.map((point, index) => ({ ...point, id: index + 1 })),
        });
      },
      detach: () => session.detach(),
    }));
}

for (const theme of ['light', 'dark'] as const) {
  test(`DV-02 ${theme}: tiêu đề theo dự án, mục Chung và dòng phụ loại tệp`, async ({ page }) => {
    const width = page.viewportSize()?.width ?? 1280;
    test.skip(width !== 360 && width !== 1280, 'Nghiệm thu 360px và 1280px.');
    await page.addInitScript((value) => localStorage.setItem('sk-theme', value), theme);
    await demo(page);

    await createItem(
      page,
      'Tổng quan dự án',
      [
        { name: 'IMG_20261028_161949.jpg', mimeType: 'image/png', buffer: PNG },
        { name: 'Scan.pdf', mimeType: 'application/pdf', buffer: pdf() },
      ],
      'Nhà ở xã hội Hải Phòng',
    );
    await createItem(page, 'Tài liệu chung', [{ name: 'ảnh chung.PNG', mimeType: 'image/png', buffer: PNG }]);

    await page.getByRole('button', { name: 'Xem IMG_20261028_161949.jpg' }).click();
    const projectDialog = page.getByRole('dialog', {
      name: 'Nhà ở xã hội Hải Phòng. Tổng quan dự án',
    });
    await expect(projectDialog).toBeVisible();
    await expect(
      projectDialog.getByRole('heading', { name: 'Nhà ở xã hội Hải Phòng. Tổng quan dự án' }),
    ).toHaveAttribute('title', 'IMG_20261028_161949.jpg');
    await expect(projectDialog).toContainText(/JPG · \d+ B/);
    await expect(projectDialog.getByText('1/2')).toBeVisible();
    await projectDialog.getByRole('button', { name: 'Tệp sau' }).click();
    await expect(projectDialog).toContainText(/PDF · \d+ B/);
    await expect(projectDialog.getByText('2/2')).toBeVisible();
    await expect(projectDialog.getByTestId('pdf-page').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await projectDialog.getByRole('button', { name: 'Đóng' }).click();
    await expect(projectDialog).toBeHidden();

    await page.getByRole('button', { name: 'Xem ảnh chung.PNG' }).click();
    const commonDialog = page.getByRole('dialog', { name: 'Tài liệu chung' });
    await expect(commonDialog).toBeVisible();
    await expect(commonDialog).toContainText(/PNG · \d+ B/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test('DV-02 chạm 360px: kéo 1:1, điểm giữa chụm đứng yên, chỉ transform, ảnh nét lại', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) !== 360, 'Cử chỉ chạm kiểm trên 360px.');
  await demo(page);
  await createItem(page, 'Cử chỉ DV-02', [image('Một.svg')]);
  await page.getByRole('button', { name: 'Xem Một.svg' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cử chỉ DV-02' });
  const img = dialog.getByRole('img', { name: 'Một.svg' });
  await expect(img).toBeVisible();
  await centered(page);
  await expect.poll(() => img.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1600);
  const content = page.getByTestId('document-content');
  const initial = await img.boundingBox();
  if (!initial) throw new Error('Không đo được vùng xem');
  const cx = initial.x + initial.width / 2;
  const cy = initial.y + initial.height / 2;
  const session = await touchSession(page);

  const layoutBefore = await content.evaluate(layoutOf);
  await session.dispatch('touchStart', [
    { x: cx - 30, y: cy },
    { x: cx + 30, y: cy },
  ]);
  await session.dispatch('touchMove', [
    { x: cx - 90, y: cy },
    { x: cx + 90, y: cy },
  ]);
  await frame(page);
  await expect.poll(() => content.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
  const layoutDuringPinch = await content.evaluate(layoutOf);
  expect(layoutDuringPinch).toEqual(layoutBefore);
  const pinchBox = await img.boundingBox();
  expect(Math.abs((pinchBox?.x ?? 0) + (pinchBox?.width ?? 0) / 2 - cx)).toBeLessThanOrEqual(2);
  expect(Math.abs((pinchBox?.y ?? 0) + (pinchBox?.height ?? 0) / 2 - cy)).toBeLessThanOrEqual(2);
  await session.dispatch('touchEnd', []);
  await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(initial.width * 2);
  const zoomed = await img.boundingBox();
  expect(Math.abs((zoomed?.x ?? 0) + (zoomed?.width ?? 0) / 2 - cx)).toBeLessThanOrEqual(2);
  expect(Math.abs((zoomed?.y ?? 0) + (zoomed?.height ?? 0) / 2 - cy)).toBeLessThanOrEqual(2);

  // Kéo 100px: nội dung đi đúng 100px, layout không đổi trong lúc kéo (chỉ transform).
  const beforePan = await img.boundingBox();
  const layoutBeforePan = await content.evaluate(layoutOf);
  await session.dispatch('touchStart', [{ x: cx, y: cy }]);
  await session.dispatch('touchMove', [{ x: cx - 100, y: cy }]);
  await frame(page);
  const duringPan = await img.boundingBox();
  expect(Math.abs((duringPan?.x ?? 0) - ((beforePan?.x ?? 0) - 100))).toBeLessThanOrEqual(2);
  expect(await content.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
  expect(await content.evaluate(layoutOf)).toEqual(layoutBeforePan);
  await session.dispatch('touchEnd', []);
  await expect
    .poll(async () => Math.abs(((await img.boundingBox())?.x ?? 0) - ((beforePan?.x ?? 0) - 100)))
    .toBeLessThanOrEqual(2);
  await expect.poll(() => content.evaluate((node) => getComputedStyle(node).transform)).toBe('none');

  // Tới 100% gốc: vẽ thẳng từ ảnh gốc (không phóng bitmap đã thu nhỏ).
  await page.getByRole('button', { name: 'Kích thước gốc' }).click();
  await expect.poll(async () => Math.round((await img.boundingBox())?.width ?? 0)).toBe(1600);
  const sharp = await img.evaluate((node) => {
    const element = node as HTMLImageElement;
    return {
      drawn: element.naturalWidth,
      shown: element.getBoundingClientRect().width,
      dpr: devicePixelRatio,
      source: element.currentSrc,
    };
  });
  expect(sharp.source.startsWith('blob:')).toBe(true);
  expect(sharp.drawn).toBe(1600);
  const needed = Math.min(sharp.shown * sharp.dpr, 1600);
  expect(sharp.drawn).toBeGreaterThanOrEqual(needed - 1);
  await session.detach();
});

test('DV-02 PDF 360px: giữ bitmap khi chụm, thả tay vẽ lại theo DPR', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) !== 360, 'Cử chỉ chạm kiểm trên 360px.');
  await demo(page);
  await createItem(page, 'PDF cử chỉ', [{ name: 'Scan.pdf', mimeType: 'application/pdf', buffer: pdf() }]);
  await page.getByRole('button', { name: 'Xem Scan.pdf' }).click();
  const survey = page.getByRole('dialog', { name: 'PDF cử chỉ' });
  const pages = survey.getByTestId('pdf-page');
  await expect(pages).toHaveCount(2);
  await expect.poll(() => pages.first().evaluate((node) => (node as HTMLCanvasElement).width)).toBeGreaterThan(0);
  const before = await pages.first().evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return { width: canvas.width, cssWidth: canvas.getBoundingClientRect().width, dpr: devicePixelRatio };
  });
  expect(Math.abs(before.width - before.cssWidth * before.dpr)).toBeLessThan(2);
  const pageBox = await pages.first().boundingBox();
  if (!pageBox) throw new Error('Không đo được trang PDF');
  const cx = pageBox.x + pageBox.width / 2;
  const cy = pageBox.y + pageBox.height / 2;
  const session = await touchSession(page);
  await session.dispatch('touchStart', [
    { x: cx - 20, y: cy },
    { x: cx + 20, y: cy },
  ]);
  await session.dispatch('touchMove', [
    { x: cx - 60, y: cy },
    { x: cx + 60, y: cy },
  ]);
  await frame(page);
  // Trong lúc chụm: vẫn dùng bitmap cũ, không vẽ lại canvas.
  expect(await pages.first().evaluate((node) => (node as HTMLCanvasElement).width)).toBe(before.width);
  await session.dispatch('touchEnd', []);
  await expect
    .poll(() => pages.first().evaluate((node) => (node as HTMLCanvasElement).width))
    .toBeGreaterThan(before.width * 2);
  const after = await pages.first().evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return { width: canvas.width, cssWidth: canvas.getBoundingClientRect().width, dpr: devicePixelRatio };
  });
  expect(Math.abs(after.width - after.cssWidth * after.dpr)).toBeLessThan(2);
  await session.detach();
});
