import { useSyncExternalStore } from 'react';

export const APP_RELEASES_URL =
  'https://nrqccwamwctihivpxjww.supabase.co/storage/v1/object/public/app-releases/latest.json';
export const APP_UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
export const APP_UPDATE_SNOOZE_INTERVAL = 24 * 60 * 60 * 1000;

const LEGACY_RELEASE_URL = '/android-app-version.json';
const CHECKED_AT_KEY = 'sk-app-update-checked-at';
const RELEASE_CACHE_KEY = 'sk-app-update-latest';
const SNOOZE_KEY_PREFIX = 'sk-app-update-snooze-';
const RELEASE_HOST = 'nrqccwamwctihivpxjww.supabase.co';

export type AppRelease = {
  versionCode: number;
  versionName?: string;
  url: string;
  sha256?: string;
  size?: number;
  notes?: string;
  publishedAt?: string;
};

type NativeResult = Record<string, unknown>;
type NativeMethod = (args: Record<string, unknown>) => Promise<NativeResult>;
type NativePlugin = {
  [method: string]: unknown;
  addListener?: (
    eventName: string,
    listener: (event: { downloaded?: number; total?: number }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};
export type NativeBridge = {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, args: Record<string, unknown>) => Promise<NativeResult>;
  Plugins?: Record<string, NativePlugin | undefined>;
};

export type InstallState = 'idle' | 'checking' | 'downloading' | 'ready' | 'permission' | 'error';
export type AppUpdateState = {
  release: AppRelease | null;
  currentVersionCode: number | null;
  checking: boolean;
  checkMessage: string;
  installState: InstallState;
  progress: number | null;
  errorCode: string | null;
  snoozedUntil: number | null;
};

export type CheckResult =
  | { status: 'available'; release: AppRelease }
  | { status: 'up-to-date' | 'failed' | 'not-native' | 'throttled' };

const INITIAL_STATE: AppUpdateState = {
  release: null,
  currentVersionCode: null,
  checking: false,
  checkMessage: '',
  installState: 'idle',
  progress: null,
  errorCode: null,
  snoozedUntil: null,
};

let state = INITIAL_STATE;
let lastCheckInMemory: number | null = null;
let cachedReleaseInMemory: AppRelease | null = null;
let activeCheck: Promise<CheckResult> | null = null;
const subscribers = new Set<() => void>();

function publish(next: AppUpdateState) {
  state = next;
  subscribers.forEach((subscriber) => {
    subscriber();
  });
}

export function getAppUpdateState() {
  return state;
}

export function subscribeAppUpdate(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function useAppUpdateState() {
  return useSyncExternalStore(subscribeAppUpdate, getAppUpdateState, getAppUpdateState);
}

export function isNewerRelease(latestVersionCode: number, installedVersionCode: number) {
  return (
    Number.isFinite(latestVersionCode) &&
    Number.isFinite(installedVersionCode) &&
    latestVersionCode > installedVersionCode
  );
}

export function isSafeAppUpdateUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === RELEASE_HOST &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443')
    );
  } catch {
    return false;
  }
}

export function parseAppRelease(value: unknown): AppRelease | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const versionCode = Number(candidate.versionCode);
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  if (!Number.isInteger(versionCode) || versionCode < 1 || !isSafeAppUpdateUrl(url)) return null;
  return {
    versionCode,
    versionName: typeof candidate.versionName === 'string' ? candidate.versionName : undefined,
    url,
    sha256: typeof candidate.sha256 === 'string' ? candidate.sha256 : undefined,
    size: typeof candidate.size === 'number' ? candidate.size : undefined,
    notes: typeof candidate.notes === 'string' ? candidate.notes.trim() : undefined,
    publishedAt: typeof candidate.publishedAt === 'string' ? candidate.publishedAt : undefined,
  };
}

export async function fetchLatestAppRelease(fetcher: typeof fetch = fetch): Promise<AppRelease | null> {
  for (const url of [APP_RELEASES_URL, LEGACY_RELEASE_URL]) {
    try {
      const response = await fetcher(url, { cache: 'no-store' });
      if (!response.ok) continue;
      const release = parseAppRelease(await response.json());
      if (release) return release;
    } catch {
      // Nguồn chính lỗi thì thử bản dự phòng; cả hai lỗi thì không báo phiên bản.
    }
  }
  return null;
}

export function shouldCheckAppUpdate(lastCheckedAt: number | null, now: number) {
  return (
    lastCheckedAt === null ||
    !Number.isFinite(lastCheckedAt) ||
    (now >= lastCheckedAt && now - lastCheckedAt >= APP_UPDATE_CHECK_INTERVAL)
  );
}

export function getAppUpdateErrorCode(error: unknown): string {
  const value =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object'
        ? String(
            (error as { code?: unknown; message?: unknown }).code ?? (error as { message?: unknown }).message ?? '',
          )
        : String(error ?? '');
  for (const code of ['install_not_allowed', 'download_failed', 'checksum_mismatch', 'busy']) {
    if (value.includes(code)) return code;
  }
  return 'download_failed';
}

export function appUpdateErrorMessage(code: string | null) {
  switch (code) {
    case 'install_not_allowed':
      return 'Cần cho phép Sổ Khách cài bản cập nhật.';
    case 'checksum_mismatch':
      return 'Bản tải về không khớp. Hãy thử lại khi có mạng.';
    case 'busy':
      return 'Đang có cập nhật khác chạy. Hãy thử lại sau.';
    default:
      return 'Tải không được, thử lại khi có mạng.';
  }
}

export function hasNativeAppUpdatePlugin(bridge: NativeBridge | null | undefined) {
  return !!bridge?.Plugins?.AppUpdate;
}

function safeStorageRead(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageWrite(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Khi bộ nhớ trình duyệt bị khoá, bộ nhớ trong phiên vẫn giữ được kết quả.
  }
}

function safeStorageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Không ảnh hưởng tới phiên hiện tại.
  }
}

function nativeBridge(): NativeBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { Capacitor?: NativeBridge }).Capacitor ?? null;
}

function callNative(bridge: NativeBridge, pluginName: string, method: string, args: Record<string, unknown>) {
  const direct = bridge.Plugins?.[pluginName]?.[method];
  if (typeof direct === 'function') return (direct as NativeMethod).call(bridge.Plugins?.[pluginName], args);
  if (bridge.nativePromise) return bridge.nativePromise(pluginName, method, args);
  return Promise.reject(new Error('not available'));
}

function readLastCheckedAt() {
  const fromStorage = Number(safeStorageRead(CHECKED_AT_KEY));
  if (Number.isFinite(fromStorage) && fromStorage > 0) return fromStorage;
  return lastCheckInMemory;
}

function writeLastCheckedAt(time: number) {
  lastCheckInMemory = time;
  safeStorageWrite(CHECKED_AT_KEY, String(time));
}

function readCachedRelease() {
  const raw = safeStorageRead(RELEASE_CACHE_KEY);
  if (raw) {
    try {
      const release = parseAppRelease(JSON.parse(raw));
      if (release) {
        cachedReleaseInMemory = release;
        return release;
      }
    } catch {
      // Bỏ cache lỗi và giữ nhánh xử lý như chưa có thông tin.
    }
  }
  return cachedReleaseInMemory;
}

function writeCachedRelease(release: AppRelease | null) {
  cachedReleaseInMemory = release;
  if (release) safeStorageWrite(RELEASE_CACHE_KEY, JSON.stringify(release));
  else safeStorageRemove(RELEASE_CACHE_KEY);
}

function snoozeKey(versionCode: number) {
  return `${SNOOZE_KEY_PREFIX}${versionCode}`;
}

export function getAppUpdateSnoozeUntil(versionCode: number, now = Date.now()) {
  const until = Number(safeStorageRead(snoozeKey(versionCode)));
  if (!Number.isFinite(until) || until <= now) {
    if (until) safeStorageRemove(snoozeKey(versionCode));
    return null;
  }
  return until;
}

export function snoozeAppUpdate(release: AppRelease, now = Date.now()) {
  const until = now + APP_UPDATE_SNOOZE_INTERVAL;
  safeStorageWrite(snoozeKey(release.versionCode), String(until));
  publish({ ...state, snoozedUntil: until });
}

function installedVersionCode(value: NativeResult) {
  const versionCode = Number(value.versionCode);
  return Number.isInteger(versionCode) && versionCode > 0 ? versionCode : null;
}

async function performCheck(force: boolean): Promise<CheckResult> {
  const bridge = nativeBridge();
  if (!bridge?.isNativePlatform?.() || (!bridge.nativePromise && !bridge.Plugins?.AppInfo)) {
    return { status: 'not-native' };
  }

  publish({ ...state, checking: true, checkMessage: force ? 'Đang kiểm tra…' : state.checkMessage });
  try {
    const current = await callNative(bridge, 'AppInfo', 'get', {});
    const currentVersionCode = installedVersionCode(current);
    if (currentVersionCode === null) throw new Error('version_unavailable');

    const now = Date.now();
    let latest: AppRelease | null;
    if (force || shouldCheckAppUpdate(readLastCheckedAt(), now)) {
      writeLastCheckedAt(now);
      latest = await fetchLatestAppRelease();
      writeCachedRelease(latest);
      if (!latest) {
        publish({ ...state, release: null, currentVersionCode, checking: false, checkMessage: '' });
        return { status: 'failed' };
      }
    } else {
      latest = readCachedRelease();
    }

    if (!latest) {
      publish({ ...state, release: null, currentVersionCode, checking: false, checkMessage: '' });
      return { status: 'throttled' };
    }
    if (!isNewerRelease(latest.versionCode, currentVersionCode)) {
      publish({
        ...state,
        release: null,
        currentVersionCode,
        checking: false,
        checkMessage: force ? 'Ứng dụng đang ở bản mới nhất.' : '',
        snoozedUntil: null,
      });
      return { status: 'up-to-date' };
    }

    const snoozedUntil = getAppUpdateSnoozeUntil(latest.versionCode, now);
    publish({ ...state, release: latest, currentVersionCode, checking: false, checkMessage: '', snoozedUntil });
    return { status: 'available', release: latest };
  } catch {
    publish({ ...state, checking: false, release: null, checkMessage: '' });
    return { status: 'failed' };
  }
}

export function checkAppUpdate(force = false): Promise<CheckResult> {
  if (activeCheck) return activeCheck;
  activeCheck = performCheck(force).finally(() => {
    activeCheck = null;
  });
  return activeCheck;
}

export async function startAppUpdate() {
  const release = state.release;
  const bridge = nativeBridge();
  if (!release || !bridge?.isNativePlatform?.()) return;

  if (!hasNativeAppUpdatePlugin(bridge)) {
    window.location.href = release.url;
    return;
  }
  if (state.installState === 'checking' || state.installState === 'downloading') return;

  publish({ ...state, installState: 'checking', progress: null, errorCode: null });
  let listener: { remove: () => Promise<void> } | undefined;
  try {
    const permission = await callNative(bridge, 'AppUpdate', 'canInstall', {});
    if (permission.allowed !== true) {
      publish({ ...state, installState: 'permission', progress: null, errorCode: 'install_not_allowed' });
      return;
    }

    const plugin = bridge.Plugins?.AppUpdate;
    if (plugin?.addListener) {
      listener = await plugin.addListener('progress', ({ downloaded, total }) => {
        const progress =
          typeof downloaded === 'number' && typeof total === 'number' && total > 0
            ? Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100)))
            : null;
        publish({ ...state, installState: 'downloading', progress, errorCode: null });
      });
    }
    publish({ ...state, installState: 'downloading', progress: null, errorCode: null });
    const result = await callNative(bridge, 'AppUpdate', 'install', {
      url: release.url,
      ...(release.sha256 ? { sha256: release.sha256 } : {}),
      versionCode: release.versionCode,
    });
    if (result.started !== true) throw new Error('download_failed');
    publish({ ...state, installState: 'ready', progress: 100, errorCode: null });
  } catch (error) {
    const errorCode = getAppUpdateErrorCode(error);
    publish({
      ...state,
      installState: errorCode === 'install_not_allowed' ? 'permission' : 'error',
      progress: null,
      errorCode,
    });
  } finally {
    if (listener) await listener.remove().catch(() => undefined);
  }
}

export async function openAppUpdateSettings() {
  const bridge = nativeBridge();
  if (!bridge?.isNativePlatform?.() || !hasNativeAppUpdatePlugin(bridge)) return;
  try {
    await callNative(bridge, 'AppUpdate', 'openInstallSettings', {});
  } catch (error) {
    const errorCode = getAppUpdateErrorCode(error);
    publish({ ...state, installState: 'error', errorCode });
  }
}

export function appUpdateStatusMessage(update: AppUpdateState) {
  switch (update.installState) {
    case 'checking':
      return 'Đang chuẩn bị cập nhật…';
    case 'downloading':
      return update.progress === null ? 'Đang tải…' : `Đang tải ${update.progress}%`;
    case 'ready':
      return 'Bấm Cài đặt trên hộp thoại Android.';
    case 'permission':
      return appUpdateErrorMessage('install_not_allowed');
    case 'error':
      return appUpdateErrorMessage(update.errorCode);
    default:
      return update.checkMessage;
  }
}
