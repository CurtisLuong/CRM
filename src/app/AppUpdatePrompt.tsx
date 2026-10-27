import { useEffect } from 'react';
import { Button } from '@/ui';
import {
  appUpdateStatusMessage,
  checkAppUpdate,
  openAppUpdateSettings,
  snoozeAppUpdate,
  startAppUpdate,
  useAppUpdateState,
} from './appUpdate';

function versionLabel(versionName?: string) {
  return versionName ? `Có bản app mới ${versionName}` : 'Có bản app mới';
}

/** Tự kiểm tra khi mở app/quay lại; web thường không có cầu nối native nên không hiện. */
export function AppUpdatePrompt() {
  const update = useAppUpdateState();

  useEffect(() => {
    void checkAppUpdate();
    const onResume = () => void checkAppUpdate();
    window.addEventListener('crm:resume', onResume);
    return () => window.removeEventListener('crm:resume', onResume);
  }, []);

  useEffect(() => {
    if (!update.snoozedUntil || update.snoozedUntil <= Date.now()) return;
    const timer = window.setTimeout(() => void checkAppUpdate(), update.snoozedUntil - Date.now());
    return () => window.clearTimeout(timer);
  }, [update.snoozedUntil]);

  const release = update.release;
  if (!release || (update.snoozedUntil !== null && update.snoozedUntil > Date.now())) return null;

  const status = appUpdateStatusMessage(update);
  const busy = update.installState === 'checking' || update.installState === 'downloading';
  const retry = update.installState === 'error';

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Cập nhật ứng dụng Android"
      className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+76px)] z-[55] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-card border border-border bg-surface-3 px-3 py-3 text-text shadow-e3 lg:right-4 lg:bottom-32 lg:left-auto lg:mx-0"
    >
      <div className="min-w-0 flex-1 basis-36">
        <p className="truncate text-body-strong">{versionLabel(release.versionName)}</p>
        {release.notes && (
          <p className="truncate text-small text-text-2" title={release.notes}>
            {release.notes}
          </p>
        )}
        {status && <p className="mt-0.5 text-small text-text-2">{status}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button
          variant="primary"
          loading={busy}
          disabled={busy}
          className="min-h-11 px-3"
          onClick={() => void startAppUpdate()}
        >
          {retry ? 'Thử lại' : 'Cập nhật'}
        </Button>
        {update.installState === 'permission' && (
          <Button variant="secondary" className="min-h-11 px-3" onClick={() => void openAppUpdateSettings()}>
            Mở cài đặt
          </Button>
        )}
        <Button variant="ghost" className="min-h-11 px-3" disabled={busy} onClick={() => snoozeAppUpdate(release)}>
          Để sau
        </Button>
      </div>
    </section>
  );
}
