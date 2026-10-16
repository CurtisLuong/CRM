import { useEffect, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { THEME_OPTIONS, type ThemePref, useThemePref } from '@/app/theme';
import { useRepositoryAccount } from '@/data/hooks';
import { Button, EmptyState, useToast } from '@/ui';
import {
  AI_DEFAULT_STYLE,
  AI_MODELS,
  aiEnabled,
  defaultTemplates,
  localSettingsKey,
  normalizeAiSettings,
  type SettingsTemplate,
  validTemplates,
} from './model';

const FIELD = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text';
type ApkInfo = { versionCode?: number; versionName?: string; url?: string; notes?: string };
type NativeWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    nativePromise?: (plugin: string, method: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
};

function SettingsPage() {
  const account = useRepositoryAccount();
  const { session } = useAppSession();
  const toast = useToast();
  const [theme, setTheme] = useThemePref();
  const userId = account?.sync.local.userId || '';
  const [templates, setTemplates] = useState<SettingsTemplate[]>(defaultTemplates());
  const [ai, setAi] = useState(() => normalizeAiSettings(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [apkState, setApkState] = useState('');
  const [apk, setApk] = useState<ApkInfo | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
  const showAi = aiEnabled(workerUrl, online);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!account || !userId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    try {
      const savedTemplates = localStorage.getItem(localSettingsKey('zalo', userId));
      if (savedTemplates) setTemplates(validTemplates(JSON.parse(savedTemplates)));
      const legacyOwner = localStorage.getItem('crm_ai_settings_user');
      const localAi =
        localStorage.getItem(localSettingsKey('ai', userId)) ||
        (legacyOwner === userId ? localStorage.getItem('crm_ai_settings') : null);
      if (localAi) setAi(normalizeAiSettings(JSON.parse(localAi)));
    } catch {
      /* Remote values below remain the fallback. */
    }
    void Promise.all([account.remote.getZaloTemplatesRemote(), account.remote.getAiSettingsRemote()])
      .then(([remoteTemplates, remoteAi]) => {
        if (!active) return;
        if (Array.isArray(remoteTemplates)) {
          setTemplates(validTemplates(remoteTemplates));
          localStorage.setItem(localSettingsKey('zalo', userId), JSON.stringify(remoteTemplates));
        } else if (remoteTemplates === null) {
          const local = localStorage.getItem(localSettingsKey('zalo', userId));
          if (local) void account.remote.saveZaloTemplatesRemote(validTemplates(JSON.parse(local)));
        }
        if (remoteAi && typeof remoteAi === 'object') {
          setAi(normalizeAiSettings(remoteAi));
          localStorage.setItem(localSettingsKey('ai', userId), JSON.stringify(remoteAi));
          localStorage.setItem('crm_ai_settings', JSON.stringify(remoteAi));
          localStorage.setItem('crm_ai_settings_user', userId);
        } else if (remoteAi === null) {
          const legacyOwner = localStorage.getItem('crm_ai_settings_user');
          const local =
            localStorage.getItem(localSettingsKey('ai', userId)) ||
            (legacyOwner === userId ? localStorage.getItem('crm_ai_settings') : null);
          if (local) void account.remote.saveAiSettingsRemote(normalizeAiSettings(JSON.parse(local)));
        }
      })
      .catch(() => {
        if (active) setMessage('Đang dùng cài đặt đã lưu trên thiết bị.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [account, userId]);

  const save = async () => {
    if (!account || !userId || saving) return;
    setSaving(true);
    setMessage('');
    try {
      localStorage.setItem(localSettingsKey('zalo', userId), JSON.stringify(templates));
      localStorage.setItem(localSettingsKey('ai', userId), JSON.stringify(ai));
      localStorage.setItem('crm_ai_settings', JSON.stringify(ai));
      localStorage.setItem('crm_ai_settings_user', userId);
      const [zaloOk, aiOk] = await Promise.all([
        account.remote.saveZaloTemplatesRemote(templates),
        account.remote.saveAiSettingsRemote(ai),
      ]);
      setMessage(
        zaloOk && aiOk ? 'Đã lưu và đồng bộ cài đặt.' : 'Đã lưu trên thiết bị; đồng bộ sẽ thử lại khi có mạng.',
      );
      toast({ title: 'Đã lưu cài đặt' });
    } catch {
      setMessage('Đã lưu trên thiết bị; chưa đồng bộ được lên tài khoản.');
    } finally {
      setSaving(false);
    }
  };

  const checkApk = async () => {
    const native = (window as NativeWindow).Capacitor;
    if (!native?.isNativePlatform?.() || !native.nativePromise) {
      setApkState('Kiểm tra cập nhật APK chỉ khả dụng trong vỏ Android.');
      return;
    }
    setApkState('Đang kiểm tra…');
    try {
      const current = await native.nativePromise('AppInfo', 'get', {});
      const response = await fetch(`/android-app-version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Chưa tải được thông tin phiên bản.');
      const latest = (await response.json()) as ApkInfo;
      if (Number(latest.versionCode) <= Number(current.versionCode) || !latest.url) {
        setApkState('Ứng dụng đang ở bản mới nhất.');
        setApk(null);
        return;
      }
      setApk(latest);
      setApkState(`Có bản mới ${latest.versionName || ''}${latest.notes ? ` — ${latest.notes}` : ''}`);
    } catch {
      setApkState('Không kiểm tra được. Hãy thử lại khi có mạng.');
      setApk(null);
    }
  };

  const setTemplate = (id: string, patch: Partial<SettingsTemplate>) =>
    setTemplates((all) => all.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addTemplate = () => setTemplates((all) => [...all, { id: `u_${crypto.randomUUID()}`, name: '', text: '' }]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pb-10">
      <header>
        <h1 className="text-title">Cài đặt</h1>
        <p className="text-small text-text-2">Tuỳ chọn tài khoản và thiết bị.</p>
      </header>
      {!account ? <EmptyState title="Chưa đăng nhập" hint="Đăng nhập để đồng bộ cài đặt tài khoản." /> : null}
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-section">Giao diện</h2>
        <fieldset className="mt-3 flex flex-wrap gap-2" aria-label="Giao diện">
          <legend className="sr-only">Giao diện</legend>
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              aria-pressed={theme === option.value}
              variant={theme === option.value ? 'primary' : 'secondary'}
              onClick={() => setTheme(option.value as ThemePref)}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
      </section>
      <section className="rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-section">Mẫu tin Zalo</h2>
            <p className="text-small text-text-2">Lưu theo tài khoản; nội dung chỉ được điền sẵn, không tự gửi.</p>
          </div>
          <Button onClick={addTemplate}>Thêm mẫu</Button>
        </div>
        {loading ? (
          <p className="mt-3 text-small text-text-2">Đang tải cài đặt…</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {templates.map((item) => (
              <fieldset key={item.id} className="flex flex-col gap-2 rounded-control border border-border p-3">
                <legend className="px-1 text-label">{item.name || 'Mẫu mới'}</legend>
                <input
                  className={FIELD}
                  aria-label="Tên mẫu"
                  maxLength={60}
                  value={item.name}
                  onChange={(event) => setTemplate(item.id, { name: event.target.value })}
                  placeholder="Tên mẫu"
                />
                <textarea
                  className={`${FIELD} min-h-28`}
                  aria-label={`Nội dung ${item.name || 'mẫu mới'}`}
                  rows={4}
                  value={item.text}
                  onChange={(event) => setTemplate(item.id, { text: event.target.value })}
                  placeholder="Nội dung tin nhắn"
                />
                {!defaultTemplates().some((template) => template.id === item.id) && (
                  <Button
                    variant="danger"
                    onClick={() => setTemplates((all) => all.filter((entry) => entry.id !== item.id))}
                  >
                    Xoá mẫu
                  </Button>
                )}
              </fieldset>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              if (window.confirm('Khôi phục mẫu mặc định? Mẫu bạn tự thêm sẽ bị xoá khi bấm Lưu.'))
                setTemplates(defaultTemplates());
            }}
          >
            Khôi phục mẫu mặc định
          </Button>
        </div>
      </section>
      {showAi && (
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-section">Cài đặt Trợ lý AI</h2>
          <p className="mt-1 text-small text-text-2">Chỉ cấu hình cách diễn đạt. AI không tự lưu hoặc gửi nội dung.</p>
          <label className="mt-3 flex flex-col gap-1 text-small">
            Model
            <select
              className={FIELD}
              value={String(ai.model)}
              onChange={(event) => setAi((current) => ({ ...current, model: event.target.value }))}
            >
              {AI_MODELS.map((model) => (
                <option value={model.key} key={model.key}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 flex flex-col gap-1 text-small">
            Phong cách viết
            <textarea
              className={`${FIELD} min-h-40`}
              maxLength={2000}
              value={String(ai.style || AI_DEFAULT_STYLE)}
              onChange={(event) => setAi((current) => ({ ...current, style: event.target.value }))}
            />
          </label>
          <Button className="mt-3" onClick={() => setAi((current) => ({ ...current, style: null }))}>
            Khôi phục phong cách mặc định
          </Button>
        </section>
      )}
      {!showAi && (
        <p className="rounded-control bg-surface-2 p-3 text-small text-text-2">
          Cài đặt AI đang ẩn khi Worker chưa cấu hình hoặc thiết bị ngoại tuyến.
        </p>
      )}
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-section">Cập nhật ứng dụng Android</h2>
        <p className="mt-1 text-small text-text-2">Kiểm tra phiên bản APK khi mở bằng vỏ Android.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => void checkApk()}>Kiểm tra cập nhật</Button>
          {apk?.url && (
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = apk.url as string;
              }}
            >
              Tải APK mới
            </Button>
          )}
          <span role="status" className="text-small text-text-2">
            {apkState}
          </span>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={saving} disabled={!account || loading} onClick={() => void save()}>
          Lưu cài đặt
        </Button>
        {message && (
          <p role="status" className="text-small text-text-2">
            {message}
          </p>
        )}
      </div>
      {session && (
        <section className="border-t border-border pt-4">
          <Button onClick={() => void session.auth.signOut()}>Đăng xuất</Button>
        </section>
      )}
    </main>
  );
}

export const route: FeatureRoute = { path: '/cai-dat', element: <SettingsPage />, handle: { title: 'Cài đặt' } };
