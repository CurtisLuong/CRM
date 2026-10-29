import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { EmptyState, LeadRow, PageHeader } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { CALL_RESULTS, type CallResult } from '@/config/callResults';
import { CARE_STAGE_DEFAULT } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { type Customer, callAttemptsOf } from '@/domain/customer';
import { firstCall } from '@/domain/followup';
import { openQuickAction } from '@/features/quick-actions/store';
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
const FIELD =
  'min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion';

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
    <Sheet open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-label={customer?.full_name || 'Khách mới'}>
        <SheetHeader>
          <SheetTitle>{customer?.full_name || 'Khách mới'}</SheetTitle>
          <SheetDescription>{customer?.phone}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {customer && (
            <div className="flex flex-col gap-4">
              <section className="rounded-md border border-line bg-surface-200 p-3" aria-label="Nhịp gọi">
                <p className="text-body font-semibold">Nhịp gọi · {attempts.length}/5 lần</p>
                {customer.next_call_at ? (
                  <p className="mt-1 text-caption text-ink-muted">
                    Hẹn gọi tiếp: {new Date(customer.next_call_at).toLocaleString('vi-VN')}
                  </p>
                ) : (
                  suggestion && <p className="mt-1 text-caption text-ink-muted">Gợi ý lần 1: {suggestion.label}</p>
                )}
                {attempts.length >= 5 && (
                  <p className="mt-1 text-caption text-ink-muted">Đã đủ 5 lần trong nhịp gọi.</p>
                )}
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
                <h2 className="text-section-head">Nhật ký gọi</h2>
                {attempts.length ? (
                  <ol className="mt-2 flex flex-col gap-2">
                    {attempts.map((attempt, index) => (
                      <li
                        key={`${attempt.at}-${attempt.device_id || attempt.origin || 'manual'}-${attempt.result || 'pending'}-${attempt.note || ''}`}
                        className="rounded-md border border-line p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-caption text-ink-muted">
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
                        <p className="mt-1 text-body font-semibold">
                          {attempt.result
                            ? CALL_RESULTS[attempt.result as CallResult] || attempt.result
                            : 'Chưa ghi chú'}
                        </p>
                        {attempt.note && (
                          <p className="mt-1 whitespace-pre-wrap text-caption text-ink-muted">{attempt.note}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-caption text-ink-muted">Chưa gọi lần nào.</p>
                )}
              </section>

              {customer.disqualified_at ? (
                <section className="rounded-md border border-line p-3">
                  <p className="text-body font-semibold">
                    Đã loại ·{' '}
                    {LEAD_DROP_REASONS[customer.disqualify_reason as LeadDropReason] || customer.disqualify_reason}
                  </p>
                  {customer.disqualify_note && (
                    <p className="mt-1 text-caption text-ink-muted">{customer.disqualify_note}</p>
                  )}
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
                <section className="flex flex-col gap-3 border-t border-line pt-4">
                  <h2 className="text-section-head">Phân loại khách</h2>
                  <Button
                    variant="primary"
                    disabled={!editable || !talked || busy}
                    onClick={() => {
                      if (account) void run(() => qualifyLead(account.customers, customer.id));
                    }}
                  >
                    Đạt{!talked ? ' · cần nói chuyện được' : ''}
                  </Button>
                  <label className="flex flex-col gap-1 text-label">
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
                    <label htmlFor="lead-disqualify-note" className="flex flex-col gap-1 text-caption">
                      Ghi chú lý do khác
                      <Textarea
                        id="lead-disqualify-note"
                        className={`${FIELD} min-h-24`}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        disabled={!editable}
                      />
                    </label>
                  )}
                  <Button
                    variant="destructive"
                    disabled={!editable || !reason || (reason === 'khac' && !note.trim()) || busy}
                    onClick={() => {
                      if (account && reason)
                        void run(() => disqualifyLead(account.customers, customer.id, reason, note));
                    }}
                  >
                    Loại khách
                  </Button>
                </section>
              )}
              {error && (
                <p role="alert" className="text-caption text-alert-text">
                  {error}
                </p>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function LeadsPage() {
  const navigate = useNavigate();
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const [filter, setFilter] = useState<LeadFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mine = customers.filter((c) => account && c.owner_id === account.sync.local.userId);
  const rows = filterLeads(mine, filter).sort((a, b) =>
    (b.registered_at || b.created_at || '').localeCompare(a.registered_at || a.created_at || ''),
  );
  const allLeads = filterLeads(mine, 'all');
  const selected = selectedId ? customers.find((c) => c.id === selectedId) || null : null;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        title="Khách mới"
        count={rows.length}
        noun="khách"
        subtitle="Khách vừa đăng ký · gọi và phân loại"
        sticky={false}
      />
      <MetaLeadAdsBanner />
      <label htmlFor="lead-filter" className="flex flex-col gap-1 text-label">
        Lọc khách
        <select
          id="lead-filter"
          className={FIELD}
          value={filter}
          onChange={(event) => setFilter(event.target.value as LeadFilter)}
        >
          {FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {rows.length ? (
        <ul aria-label="Danh sách khách mới" className="overflow-hidden rounded-md border border-line">
          {rows.map((customer) => {
            const attempts = callAttemptsOf(customer);
            return (
              <li key={customer.id}>
                <LeadRow
                  name={customer.full_name}
                  phone={customer.phone}
                  onClick={() => setSelectedId(customer.id)}
                  nextStep={[
                    customer.care_stage === CARE_STAGE_DEFAULT ? 'Đăng ký mới' : '',
                    customer.disqualified_at
                      ? 'Đã loại'
                      : attempts.length
                        ? `Đã gọi ${attempts.length} lần`
                        : 'Chưa gọi',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={filter === 'open' ? 'Không có khách mới trong phễu' : 'Không có khách phù hợp'}
          text={
            allLeads.length ? 'Thử trạng thái khách khác trong bộ lọc.' : 'Thêm khách mới để bắt đầu gọi và phân loại.'
          }
          actions={
            allLeads.length ? (
              <Button onClick={() => setFilter('all')}>Xoá lọc</Button>
            ) : (
              <Button variant="primary" onClick={() => navigate('/intake')}>
                Thêm khách
              </Button>
            )
          }
        />
      )}
      {!account && (
        <p role="status" className="text-caption text-ink-muted">
          Đang mở dữ liệu trên máy…
        </p>
      )}
      <LeadSheet key={selected?.id || 'closed'} customer={selected} onClose={() => setSelectedId(null)} />
    </main>
  );
}

export const route: FeatureRoute = { path: '/khach-moi', element: <LeadsPage />, handle: { title: 'Khách mới' } };
