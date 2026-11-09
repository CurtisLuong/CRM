import { LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { buildAiContext } from '@/domain/customer/aiContext';
import { type AiZalo, aiAvailable, getAiSettings, requestAi } from './model';
import { redactAiText } from './privacy';
import { useAiScope } from './useAiScope';

export function AiZaloDraft({
  account,
  customer,
  onDraft,
  template,
}: {
  account: RepositoryAccount;
  customer: Customer;
  onDraft: (text: string) => void;
  template?: string;
}) {
  const goalId = useId();
  const identity = JSON.stringify([customer.id, customer.updated_at, customer.contact_prefs, template]);
  const requestCurrent = useAiScope(identity, account);
  const latest = useRef({ identity, account });
  latest.current = { identity, account };
  useEffect(() => {
    if (latest.current.identity !== identity || latest.current.account !== account) return;
    setBusy(false);
    setError('');
  }, [identity, account]);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
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
  if (customer.contact_prefs?.do_not_contact) {
    return (
      <p role="alert" className="text-label text-alert-text">
        Khách yêu cầu không liên hệ. Đã chặn tạo bản nháp Zalo.
      </p>
    );
  }
  const available = aiAvailable(workerUrl, online && account.sync.isOnline());
  const generate = async () => {
    if (busy || !available || customer.contact_prefs?.do_not_contact) return;
    const current = requestCurrent;
    setBusy(true);
    setError('');
    try {
      const settings = await getAiSettings(account, account.sync.local.userId);
      const latestCustomer = account.customers.getSnapshot().find((item) => item.id === customer.id) || customer;
      if (latestCustomer.contact_prefs?.do_not_contact)
        throw new Error('Khách yêu cầu không liên hệ. Đã chặn tạo bản nháp Zalo.');
      const response = await requestAi<AiZalo>(
        account,
        'zalo',
        buildAiContext(latestCustomer),
        { goal: redactAiText(goal, 300), template },
        settings,
      );
      if (!response.data.tin_nhan?.trim()) throw new Error('AI chưa tạo được nội dung tin nhắn.');
      const finalCustomer = account.customers.getSnapshot().find((item) => item.id === customer.id);
      if (!current() || !finalCustomer || finalCustomer.archived_at || finalCustomer.contact_prefs?.do_not_contact)
        return;
      onDraft(response.data.tin_nhan.trim());
    } catch (e) {
      if (current())
        setError(
          !navigator.onLine
            ? 'Mất mạng. Kết nối lại để soạn tin.'
            : e instanceof TypeError
              ? 'Chưa soạn được tin. Thử lại.'
              : e instanceof Error
                ? e.message
                : 'Chưa tạo được bản nháp Zalo.',
        );
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={goalId} className="flex flex-col gap-1 text-label">
        Mục đích tin (tuỳ chọn)
        <Input id={goalId} value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={300} />
      </label>
      <Button aria-busy={busy || undefined} disabled={busy || !available} onClick={() => void generate()}>
        {busy && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
        Soạn bằng AI
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-label text-alert-text">
          {error}
        </p>
      )}
    </div>
  );
}
