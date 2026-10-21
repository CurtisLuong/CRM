import { useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { CALL_RESULTS, type CallResult } from '@/config/callResults';
import { CARE_STAGE_DEFAULT } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { type Customer, callAttemptsOf } from '@/domain/customer';
import { firstCall } from '@/domain/followup';
import { openQuickAction } from '@/features/quick-actions/store';
import { Button, EmptyState, Sheet } from '@/ui';
import { MetaLeadAdsBanner } from './meta-lead-ads-banner';
import {
  disqualifyLead,
  filterLeads,
  hasTalked,
  LEAD_DROP_REASONS,
  type LeadDropReason,
  type LeadFilter,
  qualifyLead,
  reopenLead,
} from './model';

const FILTERS: { value: LeadFilter; label: string }[] = [
  { value: 'open', label: 'Trong phễu' },
  { value: 'new', label: 'Chưa gọi' },
  { value: 'retry', label: 'Cần gọi lại' },
  { value: 'dropped', label: 'Đã loại' },
  { value: 'all', label: 'Tất cả' },
];
const FIELD = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text';

function LeadSheet({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const account = useRepositoryAccount();
  const [reason, setReason] = useState<LeadDropReason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = !!customer && !!account && customer.owner_id === account.sync.local.userId && !customer.archived_at;
  const attempts = customer ? callAttemptsOf(customer) : [];
  const talked = customer ? hasTalked(customer) : false;
  const suggestion = customer && !attempts.length ? firstCall(customer, Date.now()) : null;
  const run = async (action: () => Promise<unknown>) => {
    if (!account || busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      setReason('');
      setNote('');
      onClose();
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Chưa lưu được thay đổi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={!!customer}
      onOpenChange={(open) => !open && onClose()}
      title={customer?.full_name || 'Khách mới'}
      description={customer?.phone}
    >
      {customer && (
        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-border bg-surface-2 p-3" aria-label="Nhịp gọi">
            <p className="text-body-strong">Nhịp gọi · {attempts.length}/5 lần</p>
            {customer.next_call_at ? (
              <p className="mt-1 text-small text-text-2">
                Hẹn gọi tiếp: {new Date(customer.next_call_at).toLocaleString('vi-VN')}
              </p>
            ) : (
              suggestion && <p className="mt-1 text-small text-text-2">Gợi ý lần 1: {suggestion.label}</p>
            )}
            {attempts.length >= 5 && <p className="mt-1 text-small text-text-2">Đã đủ 5 lần trong nhịp gọi.</p>}
            <Button
              className="mt-3 w-full"
              variant="primary"
              disabled={!editable || !!customer.disqualified_at}
              onClick={() => openQuickAction(customer.id, 'call')}
            >
              Gọi
            </Button>
          </section>

          <section aria-label="Nhật ký gọi">
            <h2 className="text-body-strong">Nhật ký gọi</h2>
            {attempts.length ? (
              <ol className="mt-2 flex flex-col gap-2">
                {attempts.map((attempt, index) => (
                  <li
                    key={`${attempt.at}-${attempt.device_id || attempt.origin || 'manual'}-${attempt.result || 'pending'}-${attempt.note || ''}`}
                    className="rounded-card border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-small text-text-2">
                        Lần {index + 1} · {new Date(attempt.at).toLocaleString('vi-VN')}
                      </span>
                      {!attempt.result && editable && (
                        <Button
                          onClick={() =>
                            openQuickAction(customer.id, 'outcome', {
                              at: attempt.at,
                              editAt: attempt.at,
                              duration: attempt.duration,
                              origin: attempt.origin ?? 'manual',
                              device_id: attempt.device_id ?? undefined,
                              direction: attempt.direction ?? undefined,
                            })
                          }
                        >
                          Ghi kết quả
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 text-body-strong">
                      {attempt.result ? CALL_RESULTS[attempt.result as CallResult] || attempt.result : 'Chưa ghi chú'}
                    </p>
                    {attempt.note && <p className="mt-1 whitespace-pre-wrap text-small text-text-2">{attempt.note}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-small text-text-2">Chưa gọi lần nào.</p>
            )}
          </section>

          {customer.disqualified_at ? (
            <section className="rounded-card border border-border p-3">
              <p className="text-body-strong">
                Đã loại ·{' '}
                {LEAD_DROP_REASONS[customer.disqualify_reason as LeadDropReason] || customer.disqualify_reason}
              </p>
              {customer.disqualify_note && <p className="mt-1 text-small text-text-2">{customer.disqualify_note}</p>}
              <Button
                className="mt-3 w-full"
                disabled={!editable || busy}
                onClick={() => {
                  if (account) void run(() => reopenLead(account.customers, customer.id));
                }}
              >
                Mở lại
              </Button>
            </section>
          ) : (
            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <h2 className="text-body-strong">Phân loại khách</h2>
              <Button
                variant="primary"
                disabled={!editable || !talked || busy}
                onClick={() => {
                  if (account) void run(() => qualifyLead(account.customers, customer.id));
                }}
              >
                Đạt{!talked ? ' · cần nói chuyện được' : ''}
              </Button>
              <label className="flex flex-col gap-1 text-small">
                Lý do loại
                <select
                  className={FIELD}
                  value={reason}
                  onChange={(event) => setReason(event.target.value as LeadDropReason | '')}
                  disabled={!editable}
                >
                  <option value="">Chọn lý do</option>
                  {Object.entries(LEAD_DROP_REASONS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {reason === 'khac' && (
                <label className="flex flex-col gap-1 text-small">
                  Ghi chú lý do khác
                  <textarea
                    className={`${FIELD} min-h-24`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={!editable}
                  />
                </label>
              )}
              <Button
                variant="danger"
                disabled={!editable || !reason || (reason === 'khac' && !note.trim()) || busy}
                onClick={() => {
                  if (account && reason) void run(() => disqualifyLead(account.customers, customer.id, reason, note));
                }}
              >
                Loại khách
              </Button>
            </section>
          )}
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function LeadsPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const [filter, setFilter] = useState<LeadFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mine = customers.filter((c) => account && c.owner_id === account.sync.local.userId);
  const rows = filterLeads(mine, filter).sort((a, b) =>
    (b.registered_at || b.created_at || '').localeCompare(a.registered_at || a.created_at || ''),
  );
  const selected = selectedId ? customers.find((c) => c.id === selectedId) || null : null;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-title">Khách mới</h1>
        <p className="mt-1 text-small text-text-2">Khách vừa đăng ký · gọi và phân loại</p>
      </header>
      <MetaLeadAdsBanner />
      <label className="flex flex-col gap-1 text-small">
        Lọc khách
        <select className={FIELD} value={filter} onChange={(event) => setFilter(event.target.value as LeadFilter)}>
          {FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {rows.length ? (
        <ul className="divide-y divide-border rounded-card border border-border">
          {rows.map((customer) => {
            const attempts = callAttemptsOf(customer);
            return (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(customer.id)}
                  className="flex min-h-16 w-full items-center justify-between gap-3 p-3 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-body-strong">{customer.full_name}</span>
                    <span className="font-data text-mono-data text-small text-text-2">{customer.phone}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {customer.care_stage === CARE_STAGE_DEFAULT && (
                      <span className="rounded-full bg-accent-soft px-2 py-1 text-small text-accent">Đăng ký mới</span>
                    )}
                    <span className="text-small text-text-2">
                      {customer.disqualified_at
                        ? 'Đã loại'
                        : attempts.length
                          ? `Đã gọi ${attempts.length} lần`
                          : 'Chưa gọi'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon="customers"
          title={filter === 'open' ? 'Không có khách mới trong phễu' : 'Không có khách phù hợp'}
          hint="Đổi bộ lọc hoặc thêm khách mới."
        />
      )}
      {!account && (
        <p role="status" className="text-small text-text-2">
          Đang mở dữ liệu trên máy…
        </p>
      )}
      <LeadSheet key={selected?.id || 'closed'} customer={selected} onClose={() => setSelectedId(null)} />
    </main>
  );
}

export const route: FeatureRoute = { path: '/khach-moi', element: <LeadsPage />, handle: { title: 'Khách mới' } };
