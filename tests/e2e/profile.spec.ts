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
            gender: 'Nữ',
            marital_status: 'Độc thân',
            occupation: 'Giáo viên',
            purpose: 'Mua cho thuê',
            care_stage: 'Booking & Làm hồ sơ',
            apt_code: 'B1201',
            apt_area: 54,
            qualified_at: '2026-10-10T00:00:00.000Z',
            care_stage_updated_at: '2026-10-15T00:00:00.000Z',
            care_stage_history: [
              { stage: 'Đang chăm sóc', at: '2026-10-10T00:00:00.000Z' },
              {
                stage: 'Booking & Làm hồ sơ',
                at: '2026-10-15T00:00:00.000Z',
                note: 'Ghi chú bậc cũ',
                x_source: 'import',
              },
            ],
            notes_manual: [{ text: 'Ghi chú hồ sơ cũ', at: '2026-10-16T04:00:00.000Z', x_import_id: 'keep-note' }],
            created_at: '2026-10-10T00:00:00.000Z',
            updated_at: '2026-10-15T00:00:00.000Z',
            projects: [],
            interactions: [
              { at: '2026-10-16T03:00:00.000Z', channel: 'visit', kind: 'project_view', by: userId, origin: 'v2' },
            ],
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
    await expect(page.getByText('16/10/2026', { exact: false }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Dòng thời gian' }).click();
    await expect(page.getByText('Đã xem dự án', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sửa ghi chú hồ sơ' }).click();
    await page.getByRole('textbox', { name: 'Sửa ghi chú' }).fill('Ghi chú hồ sơ đã sửa');
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(
      page.getByRole('tabpanel', { name: 'Dòng thời gian' }).getByText('Ghi chú hồ sơ đã sửa').first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sửa ghi chú lịch sử bậc' }).click();
    await page.getByRole('textbox', { name: 'Sửa ghi chú' }).fill('Ghi chú bậc đã sửa');
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(
      page.getByRole('tabpanel', { name: 'Dòng thời gian' }).getByText('Ghi chú bậc đã sửa').first(),
    ).toBeVisible();
    const editedHistory = await page.evaluate(async (userId) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(userId)}`, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const tx = db.transaction('customers', 'readonly');
        const get = tx.objectStore('customers').getAll();
        get.onsuccess = () => resolve(get.result[0] as Record<string, unknown>);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return data;
    }, userId);
    expect((editedHistory.notes_manual as Array<Record<string, unknown>>)[0]).toMatchObject({
      text: 'Ghi chú hồ sơ đã sửa',
      x_import_id: 'keep-note',
    });
    expect((editedHistory.care_stage_history as Array<Record<string, unknown>>)[1]).toMatchObject({
      note: 'Ghi chú bậc đã sửa',
      x_source: 'import',
    });
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
    await expect(page.getByLabel('Giới tính')).toHaveValue('Nữ');
    await expect(page.getByLabel('Tình trạng hôn nhân')).toHaveValue('Độc thân');
    await expect(page.getByLabel('Nghề nghiệp')).toHaveValue('Giáo viên');
    const profileViewport = page.viewportSize();
    for (const width of testInfo.project.name === 'phone-390' ? [390, 430] : [profileViewport?.width || 1280]) {
      await page.setViewportSize({ width, height: profileViewport?.height || 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByLabel('Giới tính').scrollIntoViewIfNeeded();
      await page
        .getByRole('tabpanel', { name: 'Trí nhớ' })
        .locator('section')
        .first()
        .screenshot({
          path: testInfo.outputPath(`profile-choices-${theme}-${width}.png`),
        });
    }
    if (profileViewport) await page.setViewportSize(profileViewport);

    const savedToast = page.getByText('Đã lưu trên thiết bị', { exact: true }).first();
    await page.getByLabel('Giới tính').selectOption('nữ');
    await expect(savedToast).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByLabel('Tình trạng hôn nhân').selectOption('đã kết hôn');
    await expect(savedToast).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByLabel('Nghề nghiệp').selectOption('Công ty, DN');
    await expect(savedToast).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Nhu cầu & căn' }).click();
    await expect(page.getByLabel('Mục đích mua')).toHaveValue('Mua cho thuê');
    await page.getByLabel('Mục đích mua').selectOption('Đầu tư');
    await expect(savedToast).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();
    await page.getByLabel('Kênh liên hệ ưu tiên').fill('Điện thoại');
    await page.getByLabel('Kênh liên hệ ưu tiên').press('Tab');
    await expect(page.getByText('Đã lưu trên thiết bị', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByLabel('Khung giờ liên hệ').fill('Sáng');
    await page.getByLabel('Khung giờ liên hệ').press('Tab');
    await expect(page.getByText('Đã lưu trên thiết bị', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Dự án quan tâm mới').fill('Dự án thứ hai');
    await page.getByRole('button', { name: 'Thêm đợt' }).click();
    await expect(page.getByText('Đã thêm đợt quan tâm', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByLabel('Tên người cùng quyết định').fill('Anh Minh');
    await page.getByLabel('Vai trò người cùng quyết định').fill('Chồng');
    await page.getByRole('button', { name: 'Thêm người' }).click();
    await expect(page.getByText('Đã thêm người cùng quyết định', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    const doNotContact = page.getByRole('checkbox', { name: /Không liên hệ/ });
    await doNotContact.click();
    await expect(doNotContact).toBeChecked();
    await page.waitForTimeout(300);
    await page.getByLabel('Lý do không liên hệ').fill('Khách xin tạm dừng');
    await page.getByLabel('Lý do không liên hệ').press('Tab');
    await expect(page.getByText('Đã lưu trên thiết bị', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Zalo', exact: true }).click();
    await expect(page.getByText('Khách yêu cầu không liên hệ', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Nhắn Zalo/ })).toHaveCount(0);
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
      gender: 'nữ',
      marital_status: 'đã kết hôn',
      occupation: 'Công ty, DN',
      purpose: 'Đầu tư',
      contact_prefs: {
        channel: 'Điện thoại',
        slot: 'Sáng',
        do_not_contact: true,
        dnc_reason: 'Khách xin tạm dừng',
        x_extension: { keep: true },
      },
      interests: [expect.objectContaining({ project: 'Dự án thứ hai', status: 'open', source: 'sale' })],
      household: [expect.objectContaining({ name: 'Anh Minh', role: 'Chồng' })],
      field_meta: {
        gender: expect.objectContaining({ by: 'sale', confirmed: true }),
        marital_status: expect.objectContaining({ by: 'sale', confirmed: true }),
        occupation: expect.objectContaining({ by: 'sale', confirmed: true }),
        purpose: expect.objectContaining({ by: 'sale', confirmed: true }),
        contact_prefs: expect.objectContaining({ by: 'sale', confirmed: true }),
        interests: expect.objectContaining({ by: 'sale', confirmed: true }),
        household: expect.objectContaining({ by: 'sale', confirmed: true }),
      },
      x_future: { keep: true },
      advanced: { x_future: { keep: true } },
    });
    // The long memory form leaves tabs pinned: they must remain below the app header.
    await page.getByRole('tab', { name: 'Nhu cầu & căn' }).scrollIntoViewIfNeeded();
    const tabTop = await page.getByRole('tablist', { name: 'Nội dung hồ sơ khách' }).boundingBox();
    const headerBox = await page.locator('header').first().boundingBox();
    expect(tabTop?.y).toBeGreaterThanOrEqual((headerBox?.y || 0) + (headerBox?.height || 0) - 1);
    await page.screenshot({ path: testInfo.outputPath(`profile-tabs-${theme}.png`) });
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
