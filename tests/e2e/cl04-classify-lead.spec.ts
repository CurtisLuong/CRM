import { expect, type Page, test } from '@playwright/test';

// CL-04 (Curtis 06/11): "Đã nói chuyện — chờ phân loại" khó hiểu và không có nút Đạt/Loại; hồ sơ không có chỗ
// chuyển Khách mới → Tiềm năng. Giờ: thẻ Hôm nay mở hộp Phân loại, hồ sơ khách mới có Chuyển tiềm năng / Loại / Giao (một hàng đáy thẻ, phương án A), hộp kết quả
// cuộc gọi "Nói chuyện được" có Phân loại khách (Để sau / Đạt / Loại).
const USER = 'cl04-user';
const DB = `crm_khach_hang__${encodeURIComponent(USER)}`;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const lead = (id: string, name: string, calls: { at: string; result: string }[]) => ({
  id,
  owner_id: USER,
  full_name: name,
  phone: `09032${id.slice(-5).padStart(5, '0')}`,
  care_stage: 'Mới',
  registered_at: ago(5),
  created_at: ago(5),
  updated_at: ago(5),
  call_attempts: calls.map((c) => ({ ...c, origin: 'manual' })),
  next_tasks: [],
  contact_prefs: {},
});

async function readCustomer(page: Page, id: string) {
  return page.evaluate(
    async ({ name, id }) => {
      const request = indexedDB.open(name, 2);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const get = db.transaction('customers').objectStore('customers').get(id);
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return row;
    },
    { name: DB, id },
  );
}

async function seed(page: Page, rows: Record<string, unknown>[]) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'curtis@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-cl04-token',
        refresh_token: 'synthetic-cl04-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, USER);
  await page.goto('/');
  await page.evaluate(
    async ({ name, rows }) => {
      const request = indexedDB.open(name, 2);
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
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: DB, rows },
  );
}

test('CL-04: thẻ Hôm nay "Đã nói chuyện" mở hộp Phân loại → Đạt chuyển sang Tiềm năng', async ({ page }) => {
  await seed(page, [lead('cl04-a', 'Cường Vũ', [{ at: ago(2), result: 'talked' }])]);
  await page.goto('/today');
  const section = page.locator('section[aria-label="Đã nói chuyện — chọn Đạt hay Loại"]');
  await expect(section).toHaveCount(1);
  await section
    .getByRole('button', { name: /^Phân loại Cường Vũ/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Phân loại · Cường Vũ' })).toBeVisible();
  await page.getByRole('button', { name: 'Đạt → Tiềm năng' }).click();
  await expect.poll(async () => (await readCustomer(page, 'cl04-a')).qualified_at).toBeTruthy();
  expect((await readCustomer(page, 'cl04-a')).care_stage).toBe('Đang chăm sóc');
  await expect(section).toHaveCount(0);
});

test('CL-04: hồ sơ khách mới có Chuyển tiềm năng / Loại; chưa nói chuyện thì Chuyển khoá, Loại cần lý do; tuổi cạnh tên', async ({
  page,
}) => {
  // Sinh 01/01 của năm (nay − 36) → luôn 36 tuổi.
  const dob = `${new Date().getFullYear() - 36}-01-01`;
  await seed(page, [
    { ...lead('cl04-b', 'Trần Phúc', [{ at: ago(1), result: 'busy' }]), dob },
    lead('cl04-d', 'Không Năm Sinh', []),
  ]);
  await page.goto('/ho-so/cl04-b');
  await expect(page.getByRole('heading', { level: 1, name: 'Trần Phúc' })).toBeVisible();
  // Tuổi cạnh tên: cỡ bằng SĐT (14px), nét mảnh hơn SĐT một bậc.
  const age = page.getByText('36 tuổi', { exact: true });
  await expect(age).toBeVisible();
  const style = await age.evaluate((el) => ({
    size: getComputedStyle(el).fontSize,
    weight: getComputedStyle(el).fontWeight,
  }));
  const phoneStyle = await page
    .locator('header p.font-mono')
    .first()
    .evaluate((el) => ({ size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight }));
  expect(style.size).toBe(phoneStyle.size);
  expect(Number(style.weight)).toBe(Number(phoneStyle.weight) - 100);

  // Một hàng đáy thẻ: Chuyển tiềm năng · Loại (khách mới, nhóm 1 người nên không có Giao).
  const promote = page.getByRole('button', { name: 'Chuyển tiềm năng', exact: true });
  const dropOpen = page.getByRole('button', { name: 'Loại', exact: true });
  await expect(promote).toBeDisabled();
  const a = await promote.boundingBox();
  const b = await dropOpen.boundingBox();
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThanOrEqual(1);
  expect(a?.width ?? 0).toBeGreaterThan(b?.width ?? 0);
  await dropOpen.click();
  const drop = page.getByRole('dialog').getByRole('button', { name: 'Loại', exact: true });
  await expect(drop).toBeDisabled();
  await page.getByLabel('Lý do loại').selectOption('gia_cao');
  await drop.click();
  await expect.poll(async () => (await readCustomer(page, 'cl04-b')).disqualify_reason).toBe('gia_cao');
  await expect(page.getByRole('button', { name: 'Chuyển tiềm năng', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Chưa có năm sinh → không hiện tuổi.
  await page.goto('/ho-so/cl04-d');
  await expect(page.getByRole('heading', { level: 1, name: 'Không Năm Sinh' })).toBeVisible();
  await expect(page.getByText(/^\d+ tuổi$/)).toHaveCount(0);
});

test('CL-04: ghi "Nói chuyện được" cho khách mới → chọn Đạt ngay trong hộp kết quả', async ({ page }) => {
  await seed(page, [lead('cl04-c', 'Lương Phương', [])]);
  await page.goto('/ho-so/cl04-c');
  await expect(page.getByRole('heading', { level: 1, name: 'Lương Phương' })).toBeVisible();
  const bar = page.getByRole('navigation', { name: 'Hành động nhanh' }).filter({ visible: true }).first();
  await bar.getByRole('button', { name: 'Ghi chú' }).click();
  await page.getByRole('button', { name: 'Đã gọi' }).click();
  // Chưa chọn "Nói chuyện được" thì chưa hỏi phân loại.
  await expect(page.getByRole('group', { name: 'Phân loại khách' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Nói chuyện được' }).click();
  const classify = page.getByRole('group', { name: 'Phân loại khách' });
  await expect(classify.getByRole('radio', { name: 'Để sau' })).toBeChecked();
  await classify.getByRole('radio', { name: 'Đạt → Tiềm năng' }).check();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(async () => (await readCustomer(page, 'cl04-c')).qualified_at).toBeTruthy();
  const row = await readCustomer(page, 'cl04-c');
  expect((row.call_attempts as { result: string }[]).at(-1)?.result).toBe('talked');
  await expect(page.getByRole('button', { name: 'Chuyển tiềm năng', exact: true })).toHaveCount(0);
});
