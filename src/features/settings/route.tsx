import { useEffect, useRef, useState } from 'react';
import {
  appUpdateStatusMessage,
  checkAppUpdate,
  openAppUpdateSettings,
  startAppUpdate,
  useAppUpdateState,
} from '@/app/appUpdate';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { THEME_OPTIONS, type ThemePref, useThemePref } from '@/app/theme';
import { EmptyState, SelectField } from '@/components/crm';
import { Button, Card, Textarea, toast } from '@/components/ui';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { CampaignCostsSection } from './campaign-costs';
import { CampaignProjectsSection } from './campaign-projects';
import { MetaLeadAdsSection } from './meta-lead-ads';
import { AI_DEFAULT_STYLE, AI_MODELS, aiEnabled, localSettingsKey, normalizeAiSettings } from './model';

const FIELD = 'min-h-11 w-full rounded-sm border border-input bg-surface-100 px-3 py-2 text-body text-ink';

export function SettingsPage() {
  const account = useRepositoryAccount();
  const { session, isDemo, exitDemo } = useAppSession();
  const [theme, setTheme] = useThemePref();
  const userId = account?.sync.local.userId || '';
  const customers = useCustomers((customer) => !!account && customer.owner_id === userId);
  const [ai, setAi] = useState(() => normalizeAiSettings(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [apkState, setApkState] = useState('');
  const appUpdate = useAppUpdateState();
  const [online, setOnline] = useState(() => !isDemo && (typeof navigator === 'undefined' || navigator.onLine));
  const pendingSync = useRef(false);
  const syncBusy = useRef(false);
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
  const showAi = aiEnabled(workerUrl, online);

  useEffect(() => {
    const update = () => setOnline(!isDemo && navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [isDemo]);

  useEffect(() => {
    if (!online || syncBusy.current || !pendingSync.current || !account || !userId) return;
    let active = true;
    syncBusy.current = true;
    setSaving(true);
    void account.remote
      .saveAiSettingsRemote(aiRef.current)
      .then((aiOk) => {
        if (!active) return;
        pendingSync.current = !aiOk;
        if (aiOk) setMessage('Đã đồng bộ cài đặt đã lưu trên thiết bị.');
      })
      .catch(() => {
        pendingSync.current = true;
      })
      .finally(() => {
        syncBusy.current = false;
        if (active) setSaving(false);
      });
    return () => {
      active = false;
    };
  }, [online, account, userId]);

  useEffect(() => {
    if (!account || !userId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    try {
      const legacyOwner = isDemo ? null : localStorage.getItem('crm_ai_settings_user');
      const localAi =
        localStorage.getItem(localSettingsKey('ai', userId)) ||
        (!isDemo && legacyOwner === userId ? localStorage.getItem('crm_ai_settings') : null);
      if (localAi) setAi(normalizeAiSettings(JSON.parse(localAi)));
    } catch {
      /* Remote values below remain the fallback. */
    }
    if (isDemo) {
      setLoading(false);
      setMessage('Đã dùng cài đặt mẫu lưu trên trình duyệt. Tính năng cần mạng không có trong dữ liệu mẫu.');
      return () => {
        active = false;
      };
    }
    void account.remote
      .getAiSettingsRemote()
      .then((remoteAi) => {
        if (!active) return;
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
  }, [account, userId, isDemo]);

  const save = async () => {
    if (!account || !userId || saving) return;
    syncBusy.current = true;
    setSaving(true);
    setMessage('');
    try {
      localStorage.setItem(localSettingsKey('ai', userId), JSON.stringify(ai));
      if (!isDemo) {
        localStorage.setItem('crm_ai_settings', JSON.stringify(ai));
        localStorage.setItem('crm_ai_settings_user', userId);
      }
      if (isDemo) {
        setMessage('Đã lưu trên trình duyệt. Cài đặt cần mạng không có trong dữ liệu mẫu.');
        toast.success('Đã lưu cài đặt');
        return;
      }
      const aiOk = await account.remote.saveAiSettingsRemote(ai);
      pendingSync.current = !aiOk;
      setMessage(aiOk ? 'Đã lưu và đồng bộ cài đặt.' : 'Đã lưu trên thiết bị; đồng bộ sẽ thử lại khi có mạng.');
      toast.success('Đã lưu cài đặt');
    } catch {
      setMessage('Đã lưu trên thiết bị; chưa đồng bộ được lên tài khoản.');
    } finally {
      syncBusy.current = false;
      setSaving(false);
    }
  };

  const checkApk = async () => {
    setApkState('Đang kiểm tra…');
    const result = await checkAppUpdate(true);
    switch (result.status) {
      case 'available':
        setApkState('');
        break;
      case 'up-to-date':
        setApkState('Ứng dụng đang ở bản mới nhất.');
        break;
      case 'not-native':
        setApkState('Kiểm tra cập nhật APK chỉ khả dụng trong vỏ Android.');
        break;
      default:
        setApkState('Không kiểm tra được. Hãy thử lại khi có mạng.');
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pb-10">
      <header>
        <h1 className="text-title">Cài đặt</h1>
        <p className="text-caption text-ink-muted">Tuỳ chọn tài khoản và thiết bị.</p>
      </header>
      {!account ? <EmptyState title="Chưa đăng nhập" text="Đăng nhập để đồng bộ cài đặt tài khoản." /> : null}
      {isDemo && (
        <p role="status" className="rounded-md bg-ion-tint p-3 text-caption text-ink">
          Một số tính năng cần mạng không có trong dữ liệu mẫu.
        </p>
      )}
      {/* Chỉ khi tài khoản có client máy chủ mới có dòng tình trạng để đọc; chưa đăng nhập không hiện thẻ. */}
      {!isDemo && account?.sync?.client ? <MetaLeadAdsSection /> : null}
      {!isDemo && <CampaignProjectsSection customers={customers} account={account} />}
      {!isDemo && <CampaignCostsSection customers={customers} account={account} />}
      <Card className="p-4">
        <h2 className="text-section-head">Giao diện</h2>
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
      </Card>
      {showAi && (
        <section className="rounded-lg border border-line bg-surface-100 p-4">
          <h2 className="text-section-head">Cài đặt Trợ lý AI</h2>
          <p className="mt-1 text-caption text-ink-muted">
            Chỉ cấu hình cách diễn đạt. AI không tự lưu hoặc gửi nội dung.
          </p>
          <div className="mt-3">
            <SelectField
              label="Model"
              value={String(ai.model)}
              options={AI_MODELS.map((model) => ({ value: model.key, label: model.name }))}
              onValueChange={(value) => setAi((current) => ({ ...current, model: value }))}
            />
          </div>
          <label className="mt-3 flex flex-col gap-1 text-caption" htmlFor="settings-ai-style">
            Phong cách viết
            <Textarea
              id="settings-ai-style"
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
        <p className="rounded-md bg-surface-200 p-3 text-caption text-ink-muted">
          Cài đặt AI đang ẩn khi Worker chưa cấu hình hoặc thiết bị ngoại tuyến.
        </p>
      )}
      <section className="rounded-lg border border-line bg-surface-100 p-4">
        <h2 className="text-section-head">Cập nhật ứng dụng Android</h2>
        <p className="mt-1 text-caption text-ink-muted">Kiểm tra phiên bản APK khi mở bằng vỏ Android.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button disabled={isDemo} onClick={() => void checkApk()}>
            Kiểm tra cập nhật
          </Button>
          {appUpdate.release && (
            <>
              <Button
                variant="primary"
                disabled={appUpdate.installState === 'checking' || appUpdate.installState === 'downloading'}
                onClick={() => void startAppUpdate()}
              >
                {appUpdate.installState === 'error' ? 'Thử lại' : 'Cập nhật'}
              </Button>
              {appUpdate.installState === 'permission' && (
                <Button onClick={() => void openAppUpdateSettings()}>Mở cài đặt</Button>
              )}
              <div className="min-w-0 basis-full text-caption text-ink-muted">
                <p className="text-body-strong text-ink">Có bản app mới {appUpdate.release.versionName || ''}</p>
                {appUpdate.release.notes && <p className="truncate">{appUpdate.release.notes}</p>}
              </div>
            </>
          )}
          <span role="status" className="text-caption text-ink-muted">
            {appUpdate.release && appUpdate.installState !== 'idle'
              ? appUpdateStatusMessage(appUpdate)
              : apkState || (appUpdate.release ? '' : appUpdate.checkMessage)}
          </span>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!account || loading || saving} onClick={() => void save()}>
          Lưu cài đặt
        </Button>
        {message && (
          <p role="status" className="text-caption text-ink-muted">
            {message}
          </p>
        )}
      </div>
      {isDemo ? (
        <section className="border-t border-border pt-4">
          <Button variant="secondary" onClick={() => void exitDemo()}>
            Thoát dữ liệu mẫu
          </Button>
        </section>
      ) : session ? (
        <section className="border-t border-border pt-4">
          <Button onClick={() => void session.auth.signOut()}>Đăng xuất</Button>
        </section>
      ) : null}
    </main>
  );
}

export const route: FeatureRoute = { path: '/cai-dat', element: <SettingsPage />, handle: { title: 'Cài đặt' } };
