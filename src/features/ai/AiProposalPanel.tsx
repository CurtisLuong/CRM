import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { buildAiContext } from '@/domain/customer/aiContext';
import { AiSurface } from './AiSurface';
import { type AiTask, aiAvailable, getAiSettings, requestAi } from './model';
import { useAiScope } from './useAiScope';

/** Owned presentation primitive. Hosts supply approved context and own explicit persistence. */
export function AiProposalPanel<T>({
  account,
  customer,
  task,
  title,
  extra,
  disabledReason,
  children,
}: {
  account: RepositoryAccount;
  customer?: Customer;
  task: AiTask;
  title: string;
  extra: Record<string, unknown>;
  disabledReason?: string;
  children: (result: T, isCurrent: () => boolean) => React.ReactNode;
}) {
  const identity = JSON.stringify([customer?.id, customer?.updated_at, extra]);
  const requestCurrent = useAiScope(identity, account);
  const latest = useRef({ identity, account });
  latest.current = { identity, account };
  const [result, setResult] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    if (latest.current.identity !== identity || latest.current.account !== account) return;
    setResult(null);
    setBusy(false);
    setError('');
  }, [identity, account]);
  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);
  if (!aiAvailable(import.meta.env.VITE_WORKER_URL, online && account.sync.isOnline())) return null;
  const isCurrent = requestCurrent;
  const generate = async () => {
    if (busy || disabledReason) return;
    setBusy(true);
    setError('');
    try {
      const current = customer ? account.customers.getSnapshot().find((item) => item.id === customer.id) : null;
      if (
        customer &&
        (!current || current.archived_at || (task === 'retarget_msg' && current.contact_prefs?.do_not_contact))
      )
        throw new Error();
      const settings = await getAiSettings(account, account.sync.local.userId);
      const response = await requestAi<T>(account, task, current ? buildAiContext(current) : {}, extra, settings);
      if (isCurrent()) setResult(response.data);
    } catch {
      if (isCurrent()) setError('Chưa tạo được đề xuất. Kiểm tra dữ liệu và thử lại.');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <Card aria-label={title}>
      <CardHeader>
        <CardTitle className="text-title normal-case">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button className="mt-2" variant="primary" disabled={busy || !!disabledReason} onClick={() => void generate()}>
          Tạo đề xuất AI
        </Button>
        {disabledReason && <p className="mt-2 text-label text-soon-text">{disabledReason}</p>}
        {error && (
          <p role="alert" className="mt-2 text-label text-alert-text">
            {error}
          </p>
        )}
        {result && (
          <AiSurface className="mt-3" source="Chỉ dựa trên dữ liệu được cung cấp; cần kiểm tra trước khi dùng">
            {children(result, isCurrent)}
          </AiSurface>
        )}
      </CardContent>
    </Card>
  );
}
