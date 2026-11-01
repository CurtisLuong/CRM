import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
  const identity = JSON.stringify([customer.id, customer.updated_at, customer.contact_prefs, template]);
  const requestCurrent = useAiScope(identity, account);
  const latest = useRef({ identity, account });
  latest.current = { identity, account };
  const [evidence, setEvidence] = useState('');
  useEffect(() => {
    if (latest.current.identity !== identity || latest.current.account !== account) return;
    setBusy(false);
    setError('');
    setEvidence('');
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
  if (!aiAvailable(workerUrl, online && account.sync.isOnline())) return null;
  const generate = async () => {
    if (busy || customer.contact_prefs?.do_not_contact) return;
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
      setEvidence(response.data.chi_tiet_dung || '');
      onDraft(response.data.tin_nhan.trim());
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : 'Chưa tạo được bản nháp Zalo.');
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <section className="rounded-sm border border-ion/30 bg-ion-tint p-3" aria-label="Soạn Zalo bằng AI">
      <label className="flex flex-col gap-1 text-label">
        Mục đích tin (tuỳ chọn)
        <input
          className="min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          maxLength={300}
        />
      </label>
      <Button className="mt-2" variant="primary" disabled={busy} onClick={() => void generate()}>
        Soạn bằng AI
      </Button>
      <p className="mt-1 text-label text-ink-muted">
        AI chỉ điền bản nháp. Hãy kiểm tra, rồi tự chọn sao chép và mở Zalo.
      </p>
      {evidence && <p className="mt-2 text-label text-ink-muted">Chi tiết đã dùng: {evidence}</p>}
      {error && (
        <p role="alert" className="mt-1 text-label text-alert-text">
          {error}
        </p>
      )}
    </section>
  );
}
