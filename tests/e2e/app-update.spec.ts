import { expect, type Page, test } from '@playwright/test';

const RELEASE_URL = 'https://nrqccwamwctihivpxjww.supabase.co/storage/v1/object/public/app-releases/latest.json';
const APK_URL = 'https://nrqccwamwctihivpxjww.supabase.co/storage/v1/object/public/app-releases/SoKhach-1.7.apk';

async function mockNativeAppUpdate(page: Page, initiallyAllowed: boolean) {
  await page.route(RELEASE_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        versionCode: 8,
        versionName: '1.7',
        url: APK_URL,
        sha256: 'a'.repeat(64),
        notes: 'Cập nhật trong app, giữ dữ liệu khách hàng.',
      }),
    }),
  );
  await page.addInitScript((allowed) => {
    const bridge = window as Window & {
      __updateAllowed?: boolean;
      __updateProgress?: (progress: { downloaded: number; total: number }) => void;
      __updateInstallArgs?: Record<string, unknown>;
      __updateSettingsOpened?: boolean;
      Capacitor?: {
        isNativePlatform: () => boolean;
        nativePromise: (
          plugin: string,
          method: string,
          args: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
        Plugins: {
          AppUpdate: {
            addListener: (
              name: string,
              callback: (progress: { downloaded: number; total: number }) => void,
            ) => Promise<{ remove: () => Promise<void> }>;
            canInstall: () => Promise<{ allowed: boolean }>;
            openInstallSettings: () => Promise<void>;
            install: (args: Record<string, unknown>) => Promise<{ started: boolean }>;
          };
        };
      };
    };
    bridge.__updateAllowed = allowed;
    bridge.Capacitor = {
      isNativePlatform: () => true,
      nativePromise: async (plugin, method) => {
        if (plugin === 'AppInfo' && method === 'get') return { versionCode: 7, versionName: '1.6' };
        throw new Error('not implemented');
      },
      Plugins: {
        AppUpdate: {
          addListener: async (_name, callback) => {
            bridge.__updateProgress = callback;
            return {
              remove: async () => {
                bridge.__updateProgress = undefined;
              },
            };
          },
          canInstall: async () => ({ allowed: bridge.__updateAllowed === true }),
          openInstallSettings: async () => {
            bridge.__updateSettingsOpened = true;
            bridge.__updateAllowed = true;
          },
          install: async (args) => {
            bridge.__updateInstallArgs = args;
            setTimeout(() => bridge.__updateProgress?.({ downloaded: 420, total: 1000 }), 100);
            setTimeout(() => bridge.__updateProgress?.({ downloaded: 1000, total: 1000 }), 220);
            await new Promise((resolve) => setTimeout(resolve, 320));
            return { started: true };
          },
        },
      },
    };
  }, initiallyAllowed);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`cập nhật APK ${scheme === 'light' ? 'sáng' : 'tối'}`, () => {
    test.use({ colorScheme: scheme });

    test('banner hiện và tiến độ tải trên 360px/1280px', async ({ page }) => {
      test.skip(![360, 1280].includes(page.viewportSize()?.width ?? 0), 'chỉ kiểm 360px và 1280px');
      await mockNativeAppUpdate(page, true);
      await page.goto('/');

      const banner = page.getByRole('status', { name: 'Cập nhật ứng dụng Android' });
      await expect(banner).toContainText('Có bản app mới 1.7');
      await expect(banner).toContainText('Cập nhật trong app, giữ dữ liệu khách hàng.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if ((page.viewportSize()?.width ?? 0) < 1024) {
        const bannerBox = await banner.boundingBox();
        const navBox = await page.getByRole('navigation', { name: 'Điều hướng chính' }).boundingBox();
        expect(bannerBox && navBox && bannerBox.y + bannerBox.height <= navBox.y).toBe(true);
      }

      await banner.getByRole('button', { name: 'Cập nhật' }).click();
      await expect(banner).toContainText('Đang tải 42%', { timeout: 5000 });
      await expect(banner).toContainText('Bấm Cài đặt trên hộp thoại Android.', { timeout: 5000 });
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as Window & { __updateInstallArgs?: Record<string, unknown> }).__updateInstallArgs,
          ),
        )
        .toMatchObject({ url: APK_URL, sha256: 'a'.repeat(64), versionCode: 8 });
      await expect(banner.getByRole('button', { name: 'Cập nhật' })).toBeVisible();
    });

    test('khi chưa cho phép cài thì hiện hướng dẫn và mở lại được', async ({ page }) => {
      test.skip(![360, 1280].includes(page.viewportSize()?.width ?? 0), 'chỉ kiểm 360px và 1280px');
      await mockNativeAppUpdate(page, false);
      await page.goto('/');

      const banner = page.getByRole('status', { name: 'Cập nhật ứng dụng Android' });
      await expect(banner).toContainText('Có bản app mới 1.7');
      await banner.getByRole('button', { name: 'Cập nhật' }).click();
      await expect(banner).toContainText('Cần cho phép Sổ Khách cài bản cập nhật.');
      await banner.getByRole('button', { name: 'Mở cài đặt' }).click();
      await expect
        .poll(() =>
          page.evaluate(() => (window as Window & { __updateSettingsOpened?: boolean }).__updateSettingsOpened),
        )
        .toBe(true);

      await banner.getByRole('button', { name: 'Cập nhật' }).click();
      await expect(banner).toContainText('Đang tải 42%', { timeout: 5000 });
    });

    test('Cài đặt dùng cùng nguồn phát hành và nút Cập nhật', async ({ page }) => {
      test.skip(![360, 1280].includes(page.viewportSize()?.width ?? 0), 'chỉ kiểm 360px và 1280px');
      await mockNativeAppUpdate(page, true);
      await page.goto('/cai-dat');

      const settings = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Cập nhật ứng dụng Android' }) });
      await settings.getByRole('button', { name: 'Kiểm tra cập nhật' }).click();
      await expect(settings).toContainText('Có bản app mới 1.7');
      await settings.getByRole('button', { name: 'Cập nhật', exact: true }).click();
      await expect(settings).toContainText('Đang tải 42%', { timeout: 5000 });
    });
  });
}
