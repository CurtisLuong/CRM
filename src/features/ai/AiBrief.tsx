import { useEffect, useRef, useState } from 'react';
import { useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { buildAiContext } from '@/domain/customer/aiContext';
import { AIBlock, Button } from '@/ui';
import { type AiBriefResult, aiAvailable, getAiSettings, requestAi, vietnamDay } from './model';
import { useAiScope } from './useAiScope';

export function AiBrief({ customer, signal }: { customer: Customer; signal?: { code: string; reason: string } }) {
  const account = useRepositoryAccount();
  const identity = JSON.stringify([customer.id, customer.updated_at, signal]);
  const requestCurrent = useAiScope(identity, account);
  const latest = useRef({ identity, account });
  latest.current = { identity, account };
  useEffect(() => {
    if (latest.current.identity !== identity || latest.current.account !== account) return;
    setBrief(null);
    setError('');
    setBusy(false);
  }, [identity, account]);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brief, setBrief] = useState<AiBriefResult | null>(null);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
  if (!account || !aiAvailable(workerUrl, online && account.sync.isOnline())) return null;
  const generate = async () => {
    if (!account || busy) return;
    const current = requestCurrent;
    setBusy(true);
    setError('');
    try {
      const settings = await getAiSettings(account, account.sync.local.userId);
      const response = await requestAi<AiBriefResult>(
        account,
        'brief',
        buildAiContext(customer),
        { today: vietnamDay(), signal },
        settings,
      );
      if (current()) setBrief(response.data);
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : 'Chưa tạo được Brief AI.');
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <section className="rounded-card border border-border bg-surface p-4" aria-label="Brief AI">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section">Brief AI</h2>
        {!brief && (
          <Button variant="ai" loading={busy} onClick={() => void generate()}>
            Tạo tóm tắt AI
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
      {brief && (
        <AIBlock source={brief.nguon || 'Dựa trên ngữ cảnh hồ sơ đã lọc'} className="mt-3">
          <p>{brief.tom_tat || 'Chưa đủ dữ liệu để tóm tắt.'}</p>
          {!!brief.loi_hua_mo?.length && (
            <div className="mt-2">
              <b>Lời hứa còn mở</b>
              <ul className="list-inside list-disc">
                {[...new Set(brief.loi_hua_mo)].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {!!brief.can_hoi?.length && (
            <ul className="mt-2 list-inside list-disc">
              {brief.can_hoi.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {brief.luu_y && <p className="mt-2 text-small text-text-2">Lưu ý: {brief.luu_y}</p>}
          <Button className="mt-2" onClick={() => setBrief(null)}>
            Tạo lại
          </Button>
        </AIBlock>
      )}
    </section>
  );
}
