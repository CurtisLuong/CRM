import { expect, type Page, test } from '@playwright/test';

const dbName = (userId: string) => `crm_khach_hang__${encodeURIComponent(userId)}`;

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
    { name: dbName(userId), id: customerId },
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`PF-01: Nâng cao mặc định đóng, chép ghi cũ vào Bối cảnh sống (${theme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    const userId = `pf01-${testInfo.project.name}-${theme}`;
    const customerId = `pf01-customer-${testInfo.project.name}-${theme}`;
    await page.route('http://127.0.0.1:54321/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.addInitScript((uid) => {
      const user = {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'pf01@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00.000Z',
      };
      localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'synthetic-pf01-token',
          refresh_token: 'synthetic-pf01-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    }, userId);
    await page.goto('/');
    await page.evaluate(
      async ({ uid, id }) => {
        const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
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
            care_stage_updated_at: '2026-10-15T00:00:00.000Z',
            created_at: '2026-10-10T00:00:00.000Z',
            updated_at: '2026-10-15T00:00:00.000Z',
            projects: [],
            next_tasks: [],
            call_attempts: [],
            notes_manual: [],
            advanced: { life_stage: 'Mới cưới', pain_points: 'Nhà thuê chật', must_have: 'Gần trường học', x_old: 1 },
            x_future: { keep: true },
          });
          tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      },
      { uid: userId, id: customerId },
    );

    await page.goto(`/ho-so/${customerId}`);
    await expect(page.getByRole('heading', { name: 'Nguyễn Thị Hưởng' })).toBeVisible();
    await page.getByRole('tab', { name: 'Trí nhớ' }).click();

    // Mặc định đóng: ô gộp chưa hiện.
    await expect(page.getByLabel('Bối cảnh sống')).toHaveCount(0);
    const toggle = page.getByRole('button', { name: 'Nâng cao' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const life = page.getByLabel('Bối cảnh sống');
    await expect(life).toBeVisible();

    // Ghi cũ hiện chỉ đọc, đúng nhãn cũ.
    await expect(page.getByText('Giai đoạn cuộc sống', { exact: true })).toBeVisible();
    await expect(page.getByText('Mới cưới', { exact: true })).toBeVisible();

    // 360px không cuộn ngang khi khu Nâng cao đang mở.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 360, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (viewport) await page.setViewportSize(viewport);

    // Chép ghi cũ: chỉ điền vào ô đang soạn, chưa lưu.
    await page.getByRole('button', { name: 'Chép ghi cũ vào ô' }).click();
    const expected = '- Giai đoạn cuộc sống: Mới cưới\n- Nỗi đau hiện tại: Nhà thuê chật';
    await expect(life).toHaveValue(expected);
    expect((await readCustomer(page, userId, customerId)).advanced).toEqual({
      life_stage: 'Mới cưới',
      pain_points: 'Nhà thuê chật',
      must_have: 'Gần trường học',
      x_old: 1,
    });

    // Rời ô mới ghi DB: giữ nguyên khoá cũ + khoá lạ, thêm life_context.
    await life.blur();
    await expect(page.getByText('Đã lưu trên thiết bị', { exact: true }).first()).toBeVisible();
    await expect
      .poll(async () => (await readCustomer(page, userId, customerId)).advanced)
      .toEqual({
        life_stage: 'Mới cưới',
        pain_points: 'Nhà thuê chật',
        must_have: 'Gần trường học',
        x_old: 1,
        life_context: expected,
      });

    // Bấm lại: đóng, các ô bên trong không hiện.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Bối cảnh sống')).toHaveCount(0);
  });
}
