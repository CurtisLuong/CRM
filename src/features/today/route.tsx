import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { startDemo, useAppSession } from '@/app/session';
import { ActionItem, EmptyState, SlaMeter, StatTile } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SIGNALS_CONFIG } from '@/config/signals';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import { isDemoAvailable } from '@/data/supabase';
import type { Task } from '@/domain/customer';
import { snoozePromise, undoPromiseSnooze } from '@/domain/deadlines/promises';
import { forStage } from '@/domain/followup';
import { applySlaPlan, planSlaAutomation, slaPlanMessage } from '@/domain/velocity/automation';
import { openQuickAction } from '@/features/quick-actions/store';
import { ACTION_BY_ID, type ActionId, NOTIF_TYPES, slaMeterFor } from '@/lib/crm';
import {
  capacityPlan,
  capacitySnoozeCandidates,
  endOfDaySummary,
  formatSignalEvidence,
  groupQueue,
  nextCallSlotStart,
  type QueueRow,
  queueRows,
  rowGroup,
  signalTask,
  todayCard,
  todayUrgencyCounts,
  urgencyForRow,
} from './model';

function CallSessionBar({
  title,
  sub,
  duration,
  onStart,
}: {
  title: string;
  sub: string;
  duration: number;
  onStart: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface-100 p-3">
      <div className="min-w-0 flex-1">
        <b className="block text-body font-semibold">{title}</b>
        <span className="block text-caption text-ink-muted">{sub}</span>
      </div>
      <Button variant="primary" size="sm" aria-label="Bắt đầu" onClick={onStart}>
        Bắt đầu · ~{duration} phút
      </Button>
    </div>
  );
}

export function TodayPage() {
  const { session, booting, error } = useAppSession();
  const demoAvailable = isDemoAvailable();
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const sync = useSyncStatus();
  const navigate = useNavigate();
  const [readState, setReadState] = useState<{
    account: typeof account;
    status: 'loading' | 'ready' | 'error';
    error?: string;
  }>({ account: null, status: 'loading' });
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [sessionIndex, setSessionIndex] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [openCollapsed, setOpenCollapsed] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [loginError, setLoginError] = useState('');
  const processedSla = useRef(new WeakSet<object>());
  const customersRef = useRef(customers);
  customersRef.current = customers;
  const [snoozeBusy, setSnoozeBusy] = useState(false);
  const [snoozeUndo, setSnoozeUndo] = useState<(() => void) | null>(null);
  const refreshCustomers = useCallback(async () => {
    if (!account) return;
    setReadState({ account, status: 'loading' });
    try {
      await account.customers.refresh();
      setReadState({ account, status: 'ready' });
    } catch (cause) {
      setReadState({
        account,
        status: 'error',
        error: cause instanceof Error ? cause.message : 'Không tải được dữ liệu khách.',
      });
    }
  }, [account]);
  useEffect(() => {
    if (account) void refreshCustomers();
  }, [account, refreshCustomers]);
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
  const plan = capacityPlan(rows, now);
  const snoozeCandidates = capacitySnoozeCandidates(plan.suggested, now);
  const summary = endOfDaySummary(customers, now);
  // Một định nghĩa quá hạn (D-010) và một quy tắc hành động (kể cả tín hiệu phụ) — cùng nguồn với thẻ.
  const cards = new Map(rows.map((row) => [row, todayCard(row, now)]));
  const counts = todayUrgencyCounts(rows, now);
  const sessionRows = rows.filter((row) => cards.get(row)?.action === 'call');
  const sessionMinutes = sessionRows.reduce((sum, row) => sum + row.minutes, 0);
  const activeCall = sessionIndex == null ? null : (sessionRows[sessionIndex] ?? null);
  const afterEvening = new Date(now).getHours() >= 20 && new Date(now).getMinutes() >= 45;
  const currentReadState = readState.account === account ? readState : { account, status: 'loading' as const };

  if (!account) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <h1 className="text-title">Hôm nay</h1>
        {booting ? (
          <div role="status" aria-label="Đang mở dữ liệu trên máy" className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !session && !demoAvailable ? (
          <EmptyState title="Chưa cấu hình kết nối" text={error || 'Cần cấu hình Supabase để đăng nhập.'} />
        ) : (
          <form
            className="flex max-w-md flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setLoginError('');
              if (!session) {
                setLoginError(error || 'Chưa cấu hình kết nối để đăng nhập.');
                return;
              }
              try {
                await session.auth.signIn(email, password);
                setPassword('');
              } catch (cause) {
                setLoginError(cause instanceof Error ? cause.message : 'Đăng nhập chưa thành công.');
              }
            }}
          >
            <p className="text-body text-ink-muted">Đăng nhập để mở hàng đợi khách của bạn.</p>
            <label htmlFor="today-email" className="flex flex-col gap-1 text-label">
              <span>Email</span>
              <Input id="today-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label htmlFor="today-password" className="flex flex-col gap-1 text-label">
              <span>Mật khẩu</span>
              <Input
                id="today-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit" variant="primary">
              Đăng nhập
            </Button>
            {demoAvailable && (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void startDemo().catch((cause) =>
                      setLoginError(cause instanceof Error ? cause.message : 'Không mở được dữ liệu mẫu.'),
                    )
                  }
                >
                  Xem bằng dữ liệu mẫu
                </Button>
                <p className="text-caption text-ink-muted">Chỉ để xem thử, không cần tài khoản</p>
              </div>
            )}
            {(loginError || error) && (
              <p role="alert" className="text-alert-text text-label">
                {loginError || error}
              </p>
            )}
          </form>
        )}
      </main>
    );
  }

  if (currentReadState.status === 'loading') {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-3 p-4 pb-24" aria-label="Hôm nay">
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  if (currentReadState.status === 'error') {
    return (
      <main className="mx-auto flex max-w-3xl flex-col p-4 pb-24">
        <EmptyState
          kind="error"
          title="Không tải được hàng đợi"
          text={currentReadState.error || 'Dữ liệu trên máy chưa đọc được.'}
          actions={
            <Button variant="primary" onClick={() => void refreshCustomers()}>
              Thử lại
            </Button>
          }
        />
      </main>
    );
  }

  const renderCard = (row: QueueRow, compact = false) => {
    const { signal, customer } = row;
    const card = todayCard(row, now);
    const level = urgencyForRow(row, now);
    const writable = account.sync.local.userId === customer.owner_id && !customer.archived_at;
    const open = () => navigate(`/ho-so/${customer.id}`);
    const task = signalTask(signal, customer);
    const group = rowGroup(signal);
    const notification = NOTIF_TYPES[group ?? 'system'];
    const actionId: ActionId | undefined =
      card.action === 'call' ? 'call' : card.action === 'outcome' ? 'note' : undefined;
    const actionLabel =
      card.action === 'call'
        ? ACTION_BY_ID.call.short
        : card.action === 'complete'
          ? 'Xong'
          : card.action === 'outcome'
            ? 'Ghi kết quả'
            : 'Mở';
    const actionAriaLabel = `${actionLabel} ${customer.full_name}${level === 'alert' ? ' · Làm ngay' : ''}`;
    const title =
      task?.text ||
      (card.action === 'call'
        ? ACTION_BY_ID.call.label
        : card.action === 'complete'
          ? 'Hoàn tất việc'
          : card.action === 'outcome'
            ? 'Ghi kết quả cuộc gọi'
            : notification.title);
    const onAction =
      card.action === 'call'
        ? () => openQuickAction(customer.id, 'call')
        : card.action === 'complete'
          ? () => {
              const task = signalTask(signal, customer);
              if (!task?.at) return;
              void account.customers
                .completeTask(customer.id, task.at)
                .catch(() => setNotice('Chưa hoàn tất được việc.'));
            }
          : card.action === 'outcome'
            ? () => openQuickAction(customer.id, 'outcome')
            : open;
    const meter = slaMeterFor(customer, now);
    return (
      <ActionItem
        key={signal.dedupeKey}
        level={level}
        title={title}
        customer={customer.full_name}
        context={card.detail || undefined}
        time={card.when?.text}
        action={card.action === 'complete' ? undefined : actionId}
        actionLabel={actionLabel}
        actionAriaLabel={actionAriaLabel}
        disabled={card.action !== 'open' && !writable}
        onAction={onAction}
        onOpen={open}
        compact={compact}
        dataCard
        tone={level === 'alert' ? 'over' : level === 'soon' ? 'soon' : undefined}
      >
        {!compact && (
          <div className="flex flex-col gap-2">
            {card.facts.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {card.facts.map((fact) => (
                  <div key={fact.label} className="min-w-0">
                    <dt className="text-caption text-ink-muted">{fact.label}</dt>
                    <dd className="break-words text-label font-medium">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {card.note && <p className="m-0 break-words text-label text-ink-muted">“{card.note}”</p>}
            {card.sla && (
              <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                <span>{card.sla.text}</span>
                {meter && <SlaMeter {...meter} compact />}
              </div>
            )}
          </div>
        )}
      </ActionItem>
    );
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col p-4 pt-3 pb-24">
      <section className="grid grid-cols-3 gap-2" aria-label="Tổng quan mức gấp">
        <StatTile compact level="alert" label="Quá hạn" value={counts.alert} />
        <StatTile compact level="soon" label="Đến giờ hôm nay" value={counts.soon} />
        <StatTile compact level="ok" label="Đúng hẹn" value={counts.ok} />
      </section>
      {sessionRows.length === 0 && (
        <div className="mt-2 text-caption text-ink-muted">
          {rows.length} việc · ~{plan.minutes} phút
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-200 p-3 text-label"
        >
          <span>{notice}</span>
          {snoozeUndo && <Button onClick={() => snoozeUndo()}>Hoàn tác</Button>}
        </div>
      )}
      {plan.overflow > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-200 p-3 text-label">
          <span>Quá tải khoảng {plan.overflow} phút</span>
          {snoozeCandidates.length > 0 && (
            <Button
              variant="secondary"
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
                            list.map((entry) =>
                              entry && entry.at === task.at ? undoPromiseSnooze(entry, task) : entry,
                            ),
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
        </div>
      )}

      {sessionIndex == null ? (
        sessionRows.length > 0 && (
          <div className="mt-3">
            <CallSessionBar
              title={`Gọi lần lượt ${sessionRows.length} khách`}
              sub={`${rows.length} việc · ~${plan.minutes} phút`}
              duration={sessionMinutes}
              onStart={() => setSessionIndex(0)}
            />
          </div>
        )
      ) : activeCall ? (
        <div className="mt-3 flex flex-col gap-2">
          {renderCard(activeCall)}
          <p className="text-label text-ink-muted">
            {sessionIndex + 1}/{sessionRows.length}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setSessionIndex((i) => (i ?? 0) + 1)}>Bỏ qua khách</Button>
            <Button onClick={() => setSessionIndex(null)}>Dừng phiên</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-label text-ink-muted">Đã hết khách trong phiên.</p>
          <Button className="self-start" onClick={() => setSessionIndex(null)}>
            Đóng phiên
          </Button>
        </div>
      )}

      {groupQueue(rows).map((group) => {
        if (group.collapsed) {
          const opened = !!openCollapsed[group.key];
          return (
            <section key={group.key} aria-label={group.title} className="mt-2">
              <button
                type="button"
                aria-expanded={opened}
                onClick={() => setOpenCollapsed((prev) => ({ ...prev, [group.key]: !opened }))}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-md border border-line bg-surface-100 px-4 text-left text-label font-semibold"
              >
                <span>
                  {group.title} <span className="text-ink-muted">{group.rows.length}</span>
                </span>
                <span aria-hidden>{opened ? '⌄' : '›'}</span>
              </button>
              {opened && (
                <div className="mt-2 flex flex-col gap-2">{group.rows.map((row) => renderCard(row, true))}</div>
              )}
            </section>
          );
        }
        const showAll = group.full || !!expandedGroups[group.key];
        const shownRows = showAll ? group.rows : group.rows.slice(0, SIGNALS_CONFIG.todayCompactLimit);
        const remaining = group.rows.length - shownRows.length;
        return (
          <section key={group.key} aria-label={group.title} className="mt-2">
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <h2 className="text-label font-semibold">{group.title}</h2>
              <span className="text-caption text-ink-muted tabular-nums">{group.rows.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {shownRows.map((row) => renderCard(row, !group.full))}
              {remaining > 0 && (
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: true }))}
                >
                  Xem thêm {remaining}
                </Button>
              )}
            </div>
          </section>
        );
      })}

      {!rows.length && (
        <EmptyState
          kind="done"
          title="Đã xử lý các việc ưu tiên"
          text="Chưa có tín hiệu cần hành động. Không tạo việc giả."
        />
      )}

      {(afterEvening || showSummary) && (
        <section className="mt-3 rounded-md border border-line bg-surface-100 p-4">
          <h2 className="text-title">Tổng kết ngày</h2>
          <p className="mt-2 text-label text-ink-muted">
            Lời hứa đã giữ: {summary.kept} · lời hứa trễ: {summary.late} · cuộc gọi chưa ghi kết quả:{' '}
            {summary.unrecorded} · việc ngày mai: {summary.tomorrow} · thay đổi chờ đồng bộ: {sync.pending}
          </p>
        </section>
      )}
      {!afterEvening && !showSummary && (
        <Button className="mt-2 self-start" variant="ghost" onClick={() => setShowSummary(true)}>
          Xem tổng kết ngày
        </Button>
      )}
    </main>
  );
}

export const route: FeatureRoute = { path: '/today', element: <TodayPage />, handle: { title: 'Hôm nay' } };

export { formatSignalEvidence };
