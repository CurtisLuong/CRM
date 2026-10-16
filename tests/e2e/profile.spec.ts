import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`profile preserves customer facts and calculator context in ${theme} theme`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    const userId = `t35-${testInfo.project.name}-${theme}`;
    const customerId = `customer-${testInfo.project.name}-${theme}`;
    await page.route('http://127.0.0.1:54321/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('https://worker.test/ai', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      expect(body.customer).not.toHaveProperty('phone');
      expect(JSON.stringify(body.customer)).not.toContain('0901234567');
      const data =
        body.task === 'brief'
          ? { tom_tat: 'Tóm tắt AI kiểm thử.', can_hoi: ['Khách cần gì?'], luu_y: '' }
          : { tin_nhan: 'Em chào anh Hưởng, mình trao đổi thêm về hồ sơ nhé?' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data, model: 'qwen' }),
      });
    });
    await page.addInitScript((userId) => {
      const user = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'profile@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: userId, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-profile-token',
          refresh_token: 'synthetic-profile-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    }, userId);
    await page.goto('/');
    await page.evaluate(
      async ({ userId, customerId }) => {
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['customers', 'meta'], 'readwrite');
          tx.objectStore('customers').put({
            id: customerId,
            owner_id: userId,
            full_name: 'Nguyễn Thị Hưởng',
            phone: '0901234567',
            care_stage: 'Booking & Làm hồ sơ',
            apt_code: 'B1201',
            apt_area: 54,
            qualified_at: '2026-10-10T00:00:00.000Z',
            care_stage_updated_at: '2026-10-15T00:00:00.000Z',
            care_stage_history: [
              { stage: 'Đang chăm sóc', at: '2026-10-10T00:00:00.000Z' },
              { stage: 'Booking & Làm hồ sơ', at: '2026-10-15T00:00:00.000Z', x_source: 'import' },
            ],
            created_at: '2026-10-10T00:00:00.000Z',
            updated_at: '2026-10-15T00:00:00.000Z',
            projects: [],
            next_tasks: [],
            call_attempts: [],
            booking_steps: { x_future_step: 'keep' },
            contact_prefs: { channel: 'Zalo', slot: 'Tối', x_extension: { keep: true } },
            advanced: { x_future: { keep: true } },
            x_future: { keep: true },
          });
          tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      },
      { userId, customerId },
    );
    await page.goto(`/ho-so/${customerId}`);
    await expect(page.getByRole('heading', { name: 'Nguyễn Thị Hưởng' })).toBeVisible();
    const briefButton = page.getByRole('button', { name: 'Tạo tóm tắt AI' });
    if (await briefButton.count()) {
      await briefButton.click();
      await expect(page.getByText('Tóm tắt AI kiểm thử.')).toBeVisible();
      await page.getByRole('button', { name: 'Zalo', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Nhắn Zalo/ })).toBeVisible();
      await page.getByRole('button', { name: 'Soạn bằng AI' }).click();
      await expect(page.getByRole('textbox', { name: 'Nội dung tin nhắn' })).toHaveValue(/Em chào anh Hưởng/);
      await expect(page.getByRole('button', { name: 'Sao chép & mở Zalo' })).toBeVisible();
      await page.getByRole('button', { name: 'Đóng' }).click();
      await page.getByRole('button', { name: 'Bỏ nháp' }).click();
    }
    await expect(page.getByText('Chưa biết').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hành động nhanh' })).toBeVisible();
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    await page.getByLabel('Nghề nghiệp').fill('Giáo viên');
    await page.getByLabel('Nghề nghiệp').press('Tab');
    await expect(page.getByText('Đã lưu trên thiết bị', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByLabel('Kênh liên hệ ưu tiên').fill('Điện thoại');
    await page.getByLabel('Kênh liên hệ ưu tiên').press('Tab');
    await expect(page.getByText('Đã lưu trên thiết bị', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByLabel('Khung giờ liên hệ').fill('Sáng');
    await page.getByLabel('Khung giờ liên hệ').press('Tab');
    await expect(page.getByText('Đã lưu trên thiết bị', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const saved = await page.evaluate(
      async ({ userId, customerId }) => {
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const get = db.transaction('customers').objectStore('customers').get(customerId);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        });
        db.close();
        return row;
      },
      { userId, customerId },
    );
    expect(saved).toMatchObject({
      occupation: 'Giáo viên',
      contact_prefs: { channel: 'Điện thoại', slot: 'Sáng', x_extension: { keep: true } },
      x_future: { keep: true },
      advanced: { x_future: { keep: true } },
    });
    await page.getByRole('tab', { name: 'Nhu cầu & căn' }).click();
    await page.getByRole('checkbox', { name: 'Xác nhận cư trú' }).click();
    await expect(page.getByText('Đã cập nhật checklist hồ sơ', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    const afterBookingStep = await page.evaluate(
      async ({ userId, customerId }) => {
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const get = db.transaction('customers').objectStore('customers').get(customerId);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        });
        db.close();
        return row;
      },
      { userId, customerId },
    );
    expect(afterBookingStep.care_stage_updated_at).toBe('2026-10-15T00:00:00.000Z');
    expect(afterBookingStep.care_stage_history).toHaveLength(2);
    expect(afterBookingStep.booking_steps).toMatchObject({ x_future_step: 'keep' });
    await page.getByRole('button', { name: 'Tính vay cho khách này' }).click();
    await expect(page).toHaveURL(new RegExp(`customerId=${customerId}`));
    await expect(page.getByLabel('Mã căn', { exact: true })).toHaveValue('B1201');
    if (testInfo.project.name === 'phone-390') {
      await page.setViewportSize({ width: 430, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}
