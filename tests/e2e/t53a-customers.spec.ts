import { expect, type Page, test } from '@playwright/test';

async function seedCustomers(page: Page) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript(() => {
    const user = {
      id: 't53a-customers',
      aud: 'authenticated',
      role: 'authenticated',
      email: 't53a@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify(user));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-t53a-token',
        refresh_token: 'synthetic-t53a-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const request = indexedDB.open('crm_khach_hang__t53a-customers', 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'meta'], 'readwrite');
      for (let i = 0; i < 500; i++) {
        tx.objectStore('customers').put({
          id: `t53a-${i}`,
          owner_id: 't53a-customers',
          full_name: `Nguyễn Thị Ánh ${String(i).padStart(3, '0')}`,
          phone: `090000${String(i).padStart(4, '0')}`,
          care_stage: 'Đang chăm sóc',
          qualified_at: '2026-10-10T00:00:00.000Z',
          created_at: '2026-10-10T00:00:00.000Z',
          updated_at: '2026-10-15T00:00:00.000Z',
        });
      }
      tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto('/khach-hang');
  await expect(page.getByLabel('Lọc trạng thái')).toBeVisible();
  await page.getByLabel('Lọc trạng thái').selectOption('all');
  await expect(page.getByRole('button', { name: 'Xuất 500' })).toBeVisible();
}

async function wheelToBoundary(page: Page, direction: 1 | -1) {
  for (let gesture = 0; gesture < 40; gesture++) {
    const before = await page.evaluate(() => window.scrollY);
    const atBoundary = await page.evaluate((direction) => {
      const root = document.documentElement;
      return direction === -1 ? window.scrollY <= 0 : window.scrollY + window.innerHeight >= root.scrollHeight - 1;
    }, direction);
    if (atBoundary) return;
    await page.mouse.wheel(0, direction * 1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
  }
  throw new Error('Page did not reach its scroll boundary after 40 gestures');
}

for (const theme of ['light', 'dark'] as const) {
  // Explicit 375x812 reproduction plus the mobile acceptance bounds and desktop.
  for (const width of [360, 375, 430, 1280]) {
    test(`customer list scroll reaches filters with 500 customers (${width}px, ${theme})`, async ({ page }, info) => {
      test.skip(info.project.name !== 'phone-360', 'Viewport matrix is covered once, independently of projects.');
      await page.setViewportSize({ width, height: 812 });
      await page.emulateMedia({ colorScheme: theme });
      await seedCustomers(page);
      const list = page.getByRole('region', { name: 'Danh sách khách', exact: true });
      const heading = page.getByRole('heading', { name: 'Danh sách khách', exact: true });
      const items = list.getByRole('listitem');
      await expect(items.first()).toBeAttached();
      expect(await items.count()).toBeLessThan(25);
      const filtersScreenshot = info.outputPath(`customers-${width}-${theme}-filters.png`);
      await page.screenshot({ path: filtersScreenshot });
      await info.attach('filters', { path: filtersScreenshot, contentType: 'image/png' });
      // Use wheel input over the list, including after reaching its top. No scrollIntoView
      // or programmatic scrollTo can rescue a trapped nested scroll surface here.
      await list
        .evaluate((node) => node.getBoundingClientRect().top)
        .then(async (top) => {
          await page.mouse.move(width / 2, 500);
          await page.mouse.wheel(0, top - 100);
        });
      await expect.poll(() => list.evaluate((node) => node.getBoundingClientRect().top)).toBeLessThan(150);
      await page.mouse.move(width / 2, 400);
      await wheelToBoundary(page, 1);
      await expect(list.getByText('Nguyễn Thị Ánh 499', { exact: true })).toBeInViewport();
      // Wheel scrolling is asynchronous in Chromium. Capture only after scrolling
      // stops, rather than between the main-thread layout and compositor paint.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const finish = () => {
              window.removeEventListener('scroll', settled);
              resolve();
            };
            let timer = window.setTimeout(finish, 200);
            const settled = () => {
              window.clearTimeout(timer);
              timer = window.setTimeout(finish, 200);
            };
            window.addEventListener('scroll', settled, { passive: true });
          }),
      );
      await expect(list.getByText('Nguyễn Thị Ánh 499', { exact: true })).toBeInViewport();
      expect(await items.count()).toBeLessThan(25);
      const lastScreenshot = info.outputPath(`customers-${width}-${theme}-last.png`);
      await page.screenshot({ path: lastScreenshot });
      await info.attach('last customer', { path: lastScreenshot, contentType: 'image/png' });
      await page.mouse.move(width / 2, 200);
      await wheelToBoundary(page, -1);
      await expect(heading).toBeInViewport();
      await expect(page.getByLabel('Lọc trạng thái')).toBeInViewport();
      await expect(list.getByText('Nguyễn Thị Ánh 000', { exact: true })).toBeAttached();
      expect(await items.count()).toBeLessThan(25);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const archive = page.getByRole('link', { name: 'Khách đã lưu trữ', exact: true });
      await expect(archive).toBeAttached();
      await archive.click();
      await expect(
        page.getByTestId('archived-customers').getByRole('heading', { name: 'Khách đã lưu trữ' }),
      ).toBeVisible();
    });
  }
}
