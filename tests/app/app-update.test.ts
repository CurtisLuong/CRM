import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_RELEASES_URL,
  APP_UPDATE_CHECK_INTERVAL,
  APP_UPDATE_SNOOZE_INTERVAL,
  type AppRelease,
  appUpdateErrorMessage,
  fetchLatestAppRelease,
  getAppUpdateErrorCode,
  getAppUpdateSnoozeUntil,
  hasNativeAppUpdatePlugin,
  isNewerRelease,
  isSafeAppUpdateUrl,
  shouldCheckAppUpdate,
  snoozeAppUpdate,
} from '@/app/appUpdate';

const release: AppRelease = {
  versionCode: 8,
  versionName: '1.7',
  url: 'https://nrqccwamwctihivpxjww.supabase.co/storage/v1/object/public/app-releases/SoKhach-1.7.apk',
};

describe('cập nhật Android', () => {
  beforeEach(() => localStorage.clear());

  it('chỉ báo bản có versionCode lớn hơn bản đang cài', () => {
    expect(isNewerRelease(8, 7)).toBe(true);
    expect(isNewerRelease(8, 8)).toBe(false);
    expect(isNewerRelease(7, 8)).toBe(false);
  });

  it('chỉ nhận URL HTTPS thuộc host Supabase phát hành', () => {
    expect(isSafeAppUpdateUrl(release.url)).toBe(true);
    expect(isSafeAppUpdateUrl('http://nrqccwamwctihivpxjww.supabase.co/app.apk')).toBe(false);
    expect(isSafeAppUpdateUrl('https://example.com/app.apk')).toBe(false);
    expect(isSafeAppUpdateUrl('https://nrqccwamwctihivpxjww.supabase.co.evil.test/app.apk')).toBe(false);
  });

  it('dùng nguồn dự phòng nếu latest.json lỗi', async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input) === APP_RELEASES_URL) throw new Error('offline');
      return { ok: true, json: async () => ({ ...release, sha256: undefined }) } as Response;
    };

    expect(await fetchLatestAppRelease(fetcher)).toMatchObject({ versionCode: 8, versionName: '1.7' });
    expect(calls).toEqual([APP_RELEASES_URL, '/android-app-version.json']);
  });

  it('không báo phiên bản nếu cả hai nguồn đều lỗi', async () => {
    const fetcher = async () => {
      throw new Error('offline');
    };

    expect(await fetchLatestAppRelease(fetcher)).toBeNull();
  });

  it('hoãn đúng versionCode trong 24 giờ', () => {
    const now = 1_800_000_000_000;
    snoozeAppUpdate(release, now);

    expect(getAppUpdateSnoozeUntil(8, now)).toBe(now + APP_UPDATE_SNOOZE_INTERVAL);
    expect(getAppUpdateSnoozeUntil(9, now)).toBeNull();
    expect(getAppUpdateSnoozeUntil(8, now + APP_UPDATE_SNOOZE_INTERVAL)).toBeNull();
  });

  it('chỉ kiểm tra lại sau mỗi 6 giờ', () => {
    const now = 1_800_000_000_000;
    expect(shouldCheckAppUpdate(null, now)).toBe(true);
    expect(shouldCheckAppUpdate(now - APP_UPDATE_CHECK_INTERVAL + 1, now)).toBe(false);
    expect(shouldCheckAppUpdate(now - APP_UPDATE_CHECK_INTERVAL, now)).toBe(true);
  });

  it('nhận diện APK có và không có plugin AppUpdate', () => {
    expect(hasNativeAppUpdatePlugin({ Plugins: { AppUpdate: {} } })).toBe(true);
    expect(hasNativeAppUpdatePlugin({ Plugins: {} })).toBe(false);
    expect(hasNativeAppUpdatePlugin(null)).toBe(false);
  });

  it('đổi mã lỗi của plugin thành câu tiếng Việt', () => {
    expect(getAppUpdateErrorCode({ message: 'checksum_mismatch' })).toBe('checksum_mismatch');
    expect(getAppUpdateErrorCode('busy')).toBe('busy');
    expect(appUpdateErrorMessage('install_not_allowed')).toBe('Cần cho phép Sổ Khách cài bản cập nhật.');
    expect(appUpdateErrorMessage('download_failed')).toBe('Tải không được, thử lại khi có mạng.');
  });
});
