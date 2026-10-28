import { expect, test } from '@playwright/test';

const PROJECT_A = 'Nhà ở xã hội Hải Phòng';

for (const viewport of [360, 1280]) {
  test(`SK-02 lọc dự án, tìm kiếm và gửi nhiều dự án ở ${viewport}px`, async ({ page }, testInfo) => {
    test.skip(page.viewportSize()?.width !== viewport, 'Chỉ chạy trên viewport nghiệm thu 360 và 1280px.');
    await page.addInitScript((databaseName) => {
      const state = window as Window & {
        __sendPayloads?: { text?: string; files?: string[] }[];
        __clipboardText?: string;
      };
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = ((name: string, version?: number) =>
        open(name === 'crm_send_kit__dm01-preview' ? databaseName : name, version)) as typeof indexedDB.open;
      state.__sendPayloads = [];
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
        },
      });
    }, `crm_send_kit__sk02-${testInfo.project.name}`);
    await page.goto('/today');
    await page.getByRole('button', { name: 'Xem bằng dữ liệu mẫu' }).click();
    await page.goto('/tai-lieu');
    const projectSelect = page.getByLabel('Dự án');
    await expect(projectSelect).toHaveValue('__all__');
    await expect(projectSelect.locator('option', { hasText: PROJECT_A })).toHaveCount(1);
    const projectB = await projectSelect.locator('option').evaluateAll((options, projectA) => {
      const candidate = options.find((option) => {
        const value = (option as HTMLOptionElement).value;
        return value !== '__all__' && value !== projectA;
      });
      return candidate?.getAttribute('value') ?? null;
    }, PROJECT_A);
    expect(projectB).toBeTruthy();

    const addTextItem = async (title: string, body: string, project = '') => {
      await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
      await page.getByLabel('Tiêu đề').fill(title);
      await page.getByLabel('Nội dung chữ').fill(body);
      if (project) await page.getByLabel('Thuộc nhóm').selectOption(project);
      await page.getByRole('button', { name: 'Lưu tài liệu' }).click();
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    };
    const addFileItem = async (title: string, project: string, filename: string) => {
      await page.getByRole('button', { name: 'Thêm tài liệu' }).first().click();
      await page.getByLabel('Tiêu đề').fill(title);
      await page.getByLabel('Nội dung chữ').fill('Thông tin gửi khách {ten}.');
      await page.getByLabel('Thuộc nhóm').selectOption(project);
      await page.locator('input[type="file"]').setInputFiles({
        name: filename,
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      await page.getByRole('button', { name: 'Lưu tài liệu' }).click();
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    };

    await addTextItem('Điều kiện mua', 'Nội dung điều kiện mua');
    await addTextItem('Giấy tờ cần chuẩn bị', 'Danh sách giấy tờ');
    await addFileItem('Ảnh A', PROJECT_A, 'anh-a.png');
    await addFileItem('Bảng giá A', PROJECT_A, 'gia-a.png');
    await addFileItem('Video B', projectB as string, 'video-b.png');

    await projectSelect.selectOption(PROJECT_A);
    await expect(page.getByRole('heading', { name: 'Video B' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ảnh A' })).toBeVisible();
    await page.getByLabel('Tìm tài liệu').fill('bang gia a');
    await expect(page.getByRole('heading', { name: 'Bảng giá A' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ảnh A' })).toHaveCount(0);
    await page.getByLabel('Tìm tài liệu').fill('khong co ket qua');
    await expect(page.getByText('Không có tài liệu khớp')).toBeVisible();
    await page.getByRole('button', { name: 'Xoá tìm kiếm' }).click();
    await expect(page.getByRole('heading', { name: 'Ảnh A' })).toBeVisible();

    await page.goto('/tai-lieu?customer=dm01-05');
    await expect(page.getByLabel('Dự án')).toHaveValue(PROJECT_A);
    await expect(page.getByText('Đã chọn 4 mục · 2 tệp')).toBeVisible();
    await page.getByLabel('Dự án').selectOption(projectB as string);
    await expect(page.getByText('Đã chọn 5 mục · 3 tệp')).toBeVisible();
    await expect(page.getByText('Video B', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Gửi qua Zalo (5 mục · 3 tệp)' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __sendPayloads?: unknown[] }).__sendPayloads?.length))
      .toBe(1);
    const sent = await page.evaluate(
      () => (window as Window & { __sendPayloads?: { text?: string; files?: string[] }[] }).__sendPayloads?.[0],
    );
    expect(sent?.files).toEqual(['anh-a.png', 'gia-a.png', 'video-b.png']);
    expect(sent?.text).toContain('Thông tin gửi khách mới.');
    await expect(
      page.getByText('Zalo không kèm chữ khi gửi nhiều tệp. Chữ đã chép sẵn — trong Zalo giữ ô chat → Dán → Gửi.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chép lại chữ' })).toBeVisible();
    await page.waitForTimeout(6100);
    await expect(page.getByRole('button', { name: 'Chép lại chữ' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  });
}
