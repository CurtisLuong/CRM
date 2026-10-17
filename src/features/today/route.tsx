import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { CLOSE_REASONS, LEAD_DROP_REASONS } from '@/config/reasons';
import { VELOCITY_CONFIG } from '@/config/velocity';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import type { Customer, Task } from '@/domain/customer';
import { snoozePromise, undoPromiseSnooze } from '@/domain/deadlines/promises';
import { forStage } from '@/domain/followup';
import type { Signal } from '@/domain/signals';
import { applySlaPlan, planSlaAutomation, slaPlanMessage } from '@/domain/velocity/automation';
import { QuickActionButtons } from '@/features/quick-actions/QuickActions';
import { Badge, Button, EmptyState, Loading, Skeleton } from '@/ui';
import {
  capacityPlan,
  capacitySnoozeCandidates,
  endOfDaySummary,
  nextCallSlotStart,
  type QueueFilter,
  queueRows,
  visibleQueue,
} from './model';

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'priority', label: 'Ưu tiên' },
  { key: 'new', label: 'Khách mới' },
  { key: 'promise', label: 'Lời hứa' },
  { key: 'opportunity', label: 'Cơ hội' },
];
const formatDue = (due?: number) =>
  due == null ? 'Chưa có hạn' : new Date(due).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const EVIDENCE_LABELS: Record<string, string> = {
  registered_at: 'Ngày đăng ký',
  created_at: 'Ngày tạo',
  sla_anchor_at: 'Mốc tính SLA',
  next_call_at: 'Hẹn gọi',
  next_call_end: 'Kết thúc khung gọi',
  next_call_reason: 'Lý do hẹn gọi',
  care_stage_updated_at: 'Cập nhật bậc',
  care_stage: 'Bậc chăm sóc',
  lastTouch: 'Liên hệ cuối',
  lastInteraction: 'Trao đổi cuối',
  last_touch_at: 'Liên hệ cuối',
  interest_level: 'Mức quan tâm',
  step: 'Bước hồ sơ',
  phase: 'Giai đoạn',
  start: 'Bắt đầu giai đoạn',
  due: 'Hạn',
  due_at: 'Hạn',
  after: 'Ngày retarget',
  reason: 'Lý do',
  project_view_at: 'Ngày xem dự án',
  project_view: 'Lần xem dự án',
  finance: 'Tài chính',
  purpose: 'Mục đích mua',
  decision_maker: 'Người quyết định',
  purchase_timeline: 'Thời điểm mua',
};
const EVIDENCE_DATES = new Set([
  'registered_at',
  'created_at',
  'sla_anchor_at',
  'next_call_at',
  'next_call_end',
  'care_stage_updated_at',
  'lastTouch',
  'lastInteraction',
  'last_touch_at',
  'start',
  'due',
  'due_at',
  'after',
  'project_view_at',
]);

/** Display only evidence with a known label and a readable value; never stringify structured records. */
export function formatSignalEvidence(evidence: Signal['evidence']): string[] {
  return evidence.flatMap(({ field, value }) => {
    const label = EVIDENCE_LABELS[field];
    if (!label || value == null || (typeof value !== 'string' && typeof value !== 'number')) return [];
    let formatted: string;
    if (EVIDENCE_DATES.has(field)) {
      const timestamp = typeof value === 'number' ? value : Date.parse(value);
      if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return [];
      formatted = formatDue(timestamp);
    } else if (field === 'step') {
      const step = VELOCITY_CONFIG.bookingSteps.find((entry) => entry.key === value);
      if (!step) return [];
      formatted = step.label;
    } else if (field === 'phase') {
      const phase = Object.entries(VELOCITY_CONFIG.phases).find(([key]) => key === value)?.[1];
      if (!phase) return [];
      formatted = phase.label;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) return [];
      formatted = `${value.toLocaleString('vi-VN')}${field === 'interest_level' ? '%' : ''}`;
    } else {
      const text = value.trim();
      formatted = field === 'reason' ? CLOSE_REASONS[text] || LEAD_DROP_REASONS[text] || text : text;
      if (!formatted || formatted.includes('[object Object]') || /^\d{4}-\d{2}-\d{2}T/.test(formatted)) return [];
    }
    return [`${label}: ${formatted}`];
  });
}

function SignalActions({ signal, customer }: { signal: Signal; customer: Customer }) {
  const account = useRepositoryAccount();
  const [failure, setFailure] = useState('');
  const taskEvidence = signal.evidence.find((entry) => entry.field === 'task')?.value as Partial<Task> | undefined;
  const task = (Array.isArray(customer.next_tasks) ? customer.next_tasks : []).find(
    (entry) =>
      entry &&
      !entry.done_at &&
      ((!!taskEvidence?.key && entry.key === taskEvidence.key) ||
        (!!taskEvidence?.at && entry.at === taskEvidence.at) ||
        (!taskEvidence?.key &&
          !taskEvidence?.at &&
          entry.due === taskEvidence?.due &&
          entry.text === taskEvidence?.text)),
  );
  const taskAt = task?.at;
  const canComplete = !!account && account.sync.local.userId === customer.owner_id && !!taskAt;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuickActionButtons customer={customer} />
      {signal.actions.includes('complete') && canComplete && (
        <Button
          onClick={() => {
            if (!account || !taskAt) return;
            void account.customers
              .completeTask(customer.id, taskAt)
              .catch((error) => setFailure(error instanceof Error ? error.message : 'Chưa hoàn tất được việc.'));
          }}
        >
          Xong
        </Button>
      )}
      {failure && (
        <p role="alert" className="text-small text-danger">
          {failure}
        </p>
      )}
    </div>
  );
}

export function TodayPage() {
  const { session, booting, error } = useAppSession();
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const sync = useSyncStatus();
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<QueueFilter>('priority');
  const [sessionIndex, setSessionIndex] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [loginError, setLoginError] = useState('');
  const processedSla = useRef(new WeakSet<object>());
  const customersRef = useRef(customers);
  customersRef.current = customers;
  const [snoozeBusy, setSnoozeBusy] = useState(false);
  const [snoozeUndo, setSnoozeUndo] = useState<(() => void) | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!account || !customers.length || processedSla.current.has(account)) return;
    processedSla.current.add(account);
    const plan = planSlaAutomation(customers, now, account.sync.local.userId, (customer, stage) => {
      const schedule = forStage(customer, stage, now);
      return schedule ? { start: schedule.start, end: schedule.end, reason: schedule.reason } : null;
    });
    if (plan.changes.length)
      void applySlaPlan(plan, account.customers).then((result) => {
        const message = slaPlanMessage({
          changes: result.applied,
          counts: {
            drop: result.applied.filter((change) => change.type === 'drop').length,
            nurture: result.applied.filter((change) => change.type === 'nurture').length,
          },
        });
        setNotice(
          [message, result.failed.length ? `${result.failed.length} khách chưa tự chuyển được` : '']
            .filter(Boolean)
            .join(' · '),
        );
      });
  }, [account, customers, now]);

  const rows = useMemo(
    () => (account ? queueRows(customers, now, account.sync.local.userId) : []),
    [account, customers, now],
  );
  const shown = visibleQueue(rows, filter);
  const plan = capacityPlan(rows, now);
  const snoozeCandidates = capacitySnoozeCandidates(plan.suggested, now);
  const summary = endOfDaySummary(customers, now);
  const lateCount = rows.filter((row) => row.signal.due != null && row.signal.due < now).length;
  const sessionRows = rows.filter((row) => row.signal.actions.includes('call'));
  const activeCall = sessionIndex == null ? null : (sessionRows[sessionIndex] ?? null);
  const nbaEvidence = formatSignalEvidence(rows[0]?.signal.evidence ?? []);
  const afterEvening = new Date(now).getHours() >= 20 && new Date(now).getMinutes() >= 45;

  if (!account) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <h1 className="text-title">Hôm nay</h1>
        {booting ? (
          <Loading label="Đang mở dữ liệu trên máy">
            <Skeleton className="h-28 w-full" />
          </Loading>
        ) : !session ? (
          <EmptyState title="Chưa cấu hình kết nối" hint={error || 'Cần cấu hình Supabase để đăng nhập.'} />
        ) : (
          <form
            className="flex max-w-md flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setLoginError('');
              try {
                await session.auth.signIn(email, password);
                setPassword('');
              } catch (cause) {
                setLoginError(cause instanceof Error ? cause.message : 'Đăng nhập chưa thành công.');
              }
            }}
          >
            <p className="text-small text-text-2">Đăng nhập để mở hàng đợi khách của bạn.</p>
            <label className="flex flex-col gap-1 text-small">
              Email
              <input
                className="min-h-11 rounded-control border border-border-strong bg-surface px-3"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Mật khẩu
              <input
                className="min-h-11 rounded-control border border-border-strong bg-surface px-3"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit" variant="primary">
              Đăng nhập
            </Button>
            {(loginError || error) && (
              <p role="alert" className="text-danger text-small">
                {loginError || error}
              </p>
            )}
          </form>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-title">Hôm nay</h1>
          <p className="text-small text-text-2">
            {rows.length} việc · ~{plan.minutes} phút · {lateCount} quá hạn
          </p>
        </div>
        <p className="text-small text-text-2">{sync.pending ? `${sync.pending} thay đổi chờ đồng bộ` : 'Đã đồng bộ'}</p>
      </header>
      {notice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 p-3 text-small"
        >
          <span>{notice}</span>
          {snoozeUndo && <Button onClick={() => snoozeUndo()}>Hoàn tác</Button>}
        </div>
      )}
      {rows[0] ? (
        <section aria-labelledby="nba-title" className="rounded-card border border-border bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="status" tone={rows[0].signal.priority === 'P0' ? 'danger' : 'warning'}>
              {rows[0].signal.priority}
            </Badge>
            <span className="text-label text-text-2">Next Best Action</span>
          </div>
          <h2 id="nba-title" className="mt-2 text-heading">
            {rows[0].customer.full_name} · {rows[0].signal.title}
          </h2>
          <p className="mt-1 text-small">{rows[0].signal.reason}</p>
          {nbaEvidence.length > 0 && (
            <p className="mt-1 text-small text-text-2">Bằng chứng: {nbaEvidence.join(' · ')}</p>
          )}
          <p className="mt-1 text-small text-text-2">
            Hạn: {formatDue(rows[0].signal.due)} · Brief: {rows[0].customer.notes || rows[0].signal.reason}
          </p>
          <div className="mt-3">
            <SignalActions signal={rows[0].signal} customer={rows[0].customer} />
          </div>
        </section>
      ) : (
        <EmptyState
          icon="task"
          title="Đã xử lý các việc ưu tiên"
          hint="Chưa có tín hiệu cần hành động. Không tạo việc giả."
        />
      )}

      <section className="rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-heading">Sức làm</h2>
            <p className="text-small text-text-2">
              {plan.slot
                ? `Khung ${plan.slot.name} còn ${plan.slot.remaining} phút`
                : 'Hiện không trong khung gọi đã cấu hình'}{' '}
              · hàng đợi ước {plan.minutes} phút
            </p>
          </div>
        </div>
        {plan.overflow > 0 && (
          <p className="mt-2 text-small">
            Quá tải khoảng {plan.overflow} phút. Gợi ý dời {plan.suggested.length} việc P2 sang khung kế
            {plan.suggested.length ? `: ${plan.suggested.map((row) => row.customer.full_name).join(', ')}` : ''}. Đây là
            đề xuất xem trước; lịch và hạn gốc chưa thay đổi.
          </p>
        )}
        {plan.overflow > 0 && snoozeCandidates.length > 0 && account && (
          <Button
            className="mt-3"
            variant="primary"
            disabled={snoozeBusy}
            onClick={async () => {
              const earliestDue = Math.max(
                ...snoozeCandidates.map(({ task }) => {
                  const dayAfter = new Date(Date.parse(task.due || ''));
                  dayAfter.setHours(24, 0, 0, 0);
                  return dayAfter.getTime();
                }),
              );
              const due = new Date(nextCallSlotStart(now, earliestDue)).toISOString();
              const reason = 'Em bận';
              const before = snoozeCandidates.map(({ customer, task }) => ({ customerId: customer.id, task }));
              setSnoozeBusy(true);
              try {
                const byCustomer = new Map<string, { list: (Task | null)[]; touched: number }>();
                for (const { customer, task } of snoozeCandidates) {
                  const current = customersRef.current.find((entry) => entry.id === customer.id);
                  if (!current) continue;
                  const list = Array.isArray(current.next_tasks) ? current.next_tasks : [];
                  const existing = byCustomer.get(customer.id) || { list: [...list], touched: 0 };
                  existing.list = existing.list.map((entry) =>
                    entry && entry.at === task.at ? snoozePromise(entry, due, reason) : entry,
                  );
                  existing.touched++;
                  byCustomer.set(customer.id, existing);
                }
                for (const [customerId, update] of byCustomer) {
                  await account.customers.update(customerId, { next_tasks: update.list });
                }
                setNotice(`Đã dời ${before.length} việc sang ${new Date(due).toLocaleString('vi-VN')} · ${reason}`);
                const undo = () => {
                  void (async () => {
                    try {
                      const restores = new Map<string, (Task | null)[]>();
                      for (const { customerId, task } of before) {
                        const current = customersRef.current.find((entry) => entry.id === customerId);
                        if (!current) continue;
                        const list = restores.get(customerId) || [
                          ...(Array.isArray(current.next_tasks) ? current.next_tasks : []),
                        ];
                        restores.set(
                          customerId,
                          list.map((entry) => (entry && entry.at === task.at ? undoPromiseSnooze(entry, task) : entry)),
                        );
                      }
                      for (const [customerId, next_tasks] of restores) {
                        await account.customers.update(customerId, { next_tasks });
                      }
                      setNotice('Đã hoàn tác việc dời hạn.');
                    } catch (cause) {
                      setNotice(`Chưa hoàn tác được: ${cause instanceof Error ? cause.message : 'Thử lại sau.'}`);
                    } finally {
                      setSnoozeUndo(null);
                    }
                  })();
                };
                setSnoozeUndo(() => undo);
                window.setTimeout(() => setSnoozeUndo(null), 5000);
              } catch (cause) {
                setNotice(`Chưa dời được các việc: ${cause instanceof Error ? cause.message : 'Thử lại sau.'}`);
              } finally {
                setSnoozeBusy(false);
              }
            }}
          >
            Dời {snoozeCandidates.length} việc P2 sang khung kế
          </Button>
        )}
      </section>

      <section aria-labelledby="queue-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="queue-title" className="text-heading">
            Hàng đợi
          </h2>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Lọc hàng đợi</legend>
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                variant={filter === item.key ? 'primary' : 'secondary'}
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </fieldset>
        </div>
        {shown.length ? (
          <ul className="mt-2 divide-y divide-border rounded-card border border-border bg-surface">
            {shown.map(({ signal, customer, minutes }) => (
              <li
                key={signal.dedupeKey}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="status"
                      tone={signal.priority === 'P0' ? 'danger' : signal.priority === 'P1' ? 'warning' : 'neutral'}
                    >
                      {signal.priority}
                    </Badge>
                    <h3 className="text-body-strong">{customer.full_name}</h3>
                  </div>
                  <p className="mt-1 text-small">
                    {signal.title} · {signal.reason}
                  </p>
                  <p className="text-small text-text-2">
                    Hạn {formatDue(signal.due)} · ~{minutes} phút
                  </p>
                  {signal.secondaryReasons?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {signal.secondaryReasons.map((other) => (
                        <Badge key={other.id}>{other.reason}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <SignalActions signal={signal} customer={customer} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Không có việc trong bộ lọc này" hint="Thử bộ lọc khác hoặc quay lại hàng Ưu tiên." />
        )}
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-heading">Phiên gọi</h2>
        {sessionIndex == null ? (
          <>
            <p className="mt-1 text-small text-text-2">
              Bắt đầu với {sessionRows.length} khách · khoảng {sessionRows.reduce((sum, row) => sum + row.minutes, 0)}{' '}
              phút.
            </p>
            <Button
              className="mt-3"
              variant="primary"
              disabled={!sessionRows.length}
              onClick={() => setSessionIndex(0)}
            >
              Bắt đầu phiên gọi
            </Button>
          </>
        ) : activeCall ? (
          <>
            <p className="mt-1 text-small">
              {sessionIndex + 1}/{sessionRows.length} · Brief: {activeCall.signal.reason}
            </p>
            <h3 className="mt-1 text-body-strong">{activeCall.customer.full_name}</h3>
            <div className="mt-2">
              <SignalActions signal={activeCall.signal} customer={activeCall.customer} />
            </div>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => setSessionIndex((i) => (i ?? 0) + 1)}>Bỏ qua khách</Button>
              <Button onClick={() => setSessionIndex(null)}>Dừng phiên</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-small">Đã hết khách trong phiên.</p>
            <Button className="mt-2" onClick={() => setSessionIndex(null)}>
              Đóng phiên
            </Button>
          </>
        )}
      </section>

      {(afterEvening || showSummary) && (
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-heading">Tổng kết ngày</h2>
          <p className="mt-2 text-small">
            Lời hứa đã giữ: {summary.kept} · lời hứa trễ: {summary.late} · cuộc gọi chưa ghi kết quả:{' '}
            {summary.unrecorded} · việc ngày mai: {summary.tomorrow} · thay đổi chờ đồng bộ: {sync.pending}
          </p>
        </section>
      )}
      {!afterEvening && !showSummary && (
        <Button className="self-start" variant="ghost" onClick={() => setShowSummary(true)}>
          Xem tổng kết ngày
        </Button>
      )}
      {!customers.length && (
        <EmptyState
          icon="customers"
          title="Chưa có khách trên thiết bị"
          hint="Hàng đợi sẽ xuất hiện sau lần đồng bộ đầu tiên."
        />
      )}
    </main>
  );
}

export const route: FeatureRoute = { path: '/today', element: <TodayPage />, handle: { title: 'Hôm nay' } };
