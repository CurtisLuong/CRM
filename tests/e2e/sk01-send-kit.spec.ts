import { expect, test } from '@playwright/test';

for (const viewport of [360, 1280]) {
  test(`SK-01 lưu tài liệu và chia sẻ đúng tệp ở ${viewport}px`, async ({ page }) => {
    test.skip(page.viewportSize()?.width !== viewport, 'Chỉ chạy trên viewport nghiệm thu 360px và 1280px.');
    await page.addInitScript(() => {
      const state = window as Window & {
        __sendPayloads?: { text?: string; files?: string[] }[];
        __abortNextShare?: boolean;
        __clipboardText?: string;
      };
      state.__sendPayloads = [];
      state.__abortNextShare = false;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            state.__clipboardText = text;
          },
        },
      });
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: ({ files }: ShareData) => !!files?.length,
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          state.__sendPayloads?.push({ text: data.text, files: (data.files ?? []).map((file) => file.name) });
          if (state.__abortNextShare) {
            state.__abortNextShare = false;
            throw new DOMException('User cancelled', 'AbortError');
          }
        },
      });
    });
    await page.goto('/today');
    await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
    await page.goto('/tai-lieu');
    await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
    await page.getByLabel('Tiêu đề').fill('Điều kiện mua');
    await page.getByLabel('Nội dung chữ').fill('Chào {ten}, đây là điều kiện mua.');
    await page.getByLabel('Nội dung chữ').press('Tab');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Lưu tài liệu' }).click();
    await expect(page.getByRole('heading', { name: 'Điều kiện mua' })).toBeVisible();

    await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
    await page.getByLabel('Tiêu đề').fill('Ảnh dự án Hải Phòng');
    await page.getByLabel('Thuộc nhóm').selectOption('Nhà ở xã hội Hải Phòng');
    await page.locator('input[type="file"]').setInputFiles([
      {
        name: 'mat-tien.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
          'base64',
        ),
      },
      {
        name: 'can-ho.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
          'base64',
        ),
      },
    ]);
    await page.getByRole('button', { name: 'Lưu tài liệu' }).click();

    await page.goto('/tai-lieu?customer=dm01-05');
    await expect(page.getByRole('heading', { name: 'Gia Hân · Khách mới' })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Gửi qua Zalo (2 mục · 2 tệp)' })).toBeEnabled();
    await page.getByRole('button', { name: 'Gửi qua Zalo (2 mục · 2 tệp)' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __sendPayloads?: unknown[] }).__sendPayloads?.length))
      .toBe(1);
    const payload = await page.evaluate(() => ({
      sent: (window as Window & { __sendPayloads?: { text?: string; files?: string[] }[] }).__sendPayloads?.[0],
      clipboard: (window as Window & { __clipboardText?: string }).__clipboardText,
    }));
    expect(payload.sent?.files).toEqual(['mat-tien.png', 'can-ho.png']);
    expect(payload.sent?.text).toContain('Chào mới, đây là điều kiện mua.');
    expect(payload.clipboard).toContain('Chào mới, đây là điều kiện mua.');

    const historyAfterSuccess = await page.evaluate(async () => {
      const request = indexedDB.open('crm_khach_hang__dm01-preview', 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const customer = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const get = db.transaction('customers').objectStore('customers').get('dm01-05');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return customer.interactions as { template?: string }[];
    });
    expect(historyAfterSuccess[0]?.template).toContain('Đã gửi tài liệu: Điều kiện mua, Ảnh dự án Hải Phòng');

    await page.evaluate(() => {
      (window as Window & { __abortNextShare?: boolean }).__abortNextShare = true;
    });
    await page.getByRole('button', { name: 'Gửi qua Zalo (2 mục · 2 tệp)' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __sendPayloads?: unknown[] }).__sendPayloads?.length))
      .toBe(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const historyAfterCancel = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('crm_khach_hang__dm01-preview', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<{ interactions: unknown[] }>((resolve, reject) => {
        const get = db.transaction('customers').objectStore('customers').get('dm01-05');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return rows.interactions;
    });
    expect(historyAfterCancel).toHaveLength(historyAfterSuccess.length);

    await page.reload();
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  });
}
