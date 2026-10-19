import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { SIGNALS_CONFIG } from '@/config/signals';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Task } from '@/domain/customer';
import { snoozePromise, undoPromiseSnooze } from '@/domain/deadlines/promises';
import { forStage } from '@/domain/followup';
import { applySlaPlan, planSlaAutomation, slaPlanMessage } from '@/domain/velocity/automation';
import { openQuickAction } from '@/features/quick-actions/store';
import {
  Button,
  CardGroup,
  CustomerCard,
  type CustomerCardAction,
  EmptyState,
  Icon,
  Loading,
  SessionBar,
  Skeleton,
} from '@/ui';
import {
  capacityPlan,
  capacitySnoozeCandidates,
  endOfDaySummary,
  formatSignalEvidence,
  groupQueue,
  nextCallSlotStart,
  type QueueRow,
  queueRows,
  signalTask,
  todayCard,
} from './model';

export function TodayPage() {
  const { session, booting, error } = useAppSession();
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const navigate = useNavigate();
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
  const lateCount = rows.filter((row) => row.signal.due != null && row.signal.due < now).length;
  const sessionRows = rows.filter((row) => row.signal.actions.includes('call'));
  const activeCall = sessionIndex == null ? null : (sessionRows[sessionIndex] ?? null);
  const sessionMinutes = sessionRows.reduce((sum, row) => sum + row.minutes, 0);
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

  const renderCard = (row: QueueRow, compact = false) => {
    const { signal, customer } = row;
    const card = todayCard(row, now);
    const writable = account.sync.local.userId === customer.owner_id && !customer.archived_at;
    const open = () => navigate(`/ho-so/${customer.id}`);
    const action: CustomerCardAction =
      card.action === 'call'
        ? { label: 'Gọi', icon: 'call', onClick: () => openQuickAction(customer.id, 'call'), disabled: !writable }
        : card.action === 'complete'
          ? {
              label: 'Xong',
              icon: 'done',
              disabled: !writable,
              onClick: () => {
                const task = signalTask(signal, customer);
                if (!task?.at) return;
                void account.customers
                  .completeTask(customer.id, task.at)
                  .catch(() => setNotice('Chưa hoàn tất được việc.'));
              },
            }
          : card.action === 'outcome'
            ? {
                label: 'Ghi kết quả',
                icon: 'note',
                onClick: () => openQuickAction(customer.id, 'outcome'),
                disabled: !writable,
              }
            : { label: 'Mở', icon: 'open', onClick: open };
    const sub = card.when ? (
      <>
        <span
          className={
            card.when.state === 'over'
              ? 'font-semibold text-danger'
              : card.when.state === 'soon'
                ? 'font-semibold text-warning'
                : 'font-data'
          }
        >
          {card.when.text}
        </span>
        {card.detail ? ` · ${card.detail}` : ''}
      </>
    ) : (
      card.detail
    );
    return (
      <CustomerCard
        key={signal.dedupeKey}
        name={customer.full_name}
        tone={card.tone}
        sub={sub}
        onOpen={open}
        action={action}
        compact={compact}
        facts={compact ? undefined : card.facts}
        note={compact ? undefined : card.note}
        sla={compact ? undefined : card.sla}
      />
    );
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col p-4 pb-24">
      <div className="flex items-center justify-between gap-2 text-small">
        <span>
          {rows.length} việc · ~{plan.minutes} phút
        </span>
        {lateCount > 0 && <span className="font-semibold text-danger">{lateCount} quá hạn</span>}
      </div>
      {notice && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 p-3 text-small"
        >
          <span>{notice}</span>
          {snoozeUndo && <Button onClick={() => snoozeUndo()}>Hoàn tác</Button>}
        </div>
      )}
      {plan.overflow > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card-sm bg-surface-2 p-3 text-small">
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
          <SessionBar
            className="mt-3"
            title={`Gọi lần lượt ${sessionRows.length} khách`}
            sub={`~${sessionMinutes} phút`}
            onStart={() => setSessionIndex(0)}
          />
        )
      ) : activeCall ? (
        <div className="mt-3 flex flex-col gap-2">
          {renderCard(activeCall)}
          <p className="text-small">
            {sessionIndex + 1}/{sessionRows.length}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setSessionIndex((i) => (i ?? 0) + 1)}>Bỏ qua khách</Button>
            <Button onClick={() => setSessionIndex(null)}>Dừng phiên</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-small">Đã hết khách trong phiên.</p>
          <Button className="self-start" onClick={() => setSessionIndex(null)}>
            Đóng phiên
          </Button>
        </div>
      )}

      {groupQueue(rows).map((group) => {
        if (group.collapsed) {
          const opened = !!openCollapsed[group.key];
          return (
            <section key={group.key} aria-label={group.title} className="mt-3.5">
              <button
                type="button"
                aria-expanded={opened}
                onClick={() => setOpenCollapsed((prev) => ({ ...prev, [group.key]: !opened }))}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-card-sm border border-hairline bg-surface px-4 text-left"
              >
                <span>
                  {group.title} <span className="text-text-3">{group.rows.length}</span>
                </span>
                <Icon name={opened ? 'expand' : 'open'} />
              </button>
              {opened && (
                <div className="mt-2 flex flex-col gap-2.5">{group.rows.map((row) => renderCard(row, true))}</div>
              )}
            </section>
          );
        }
        const showAll = group.full || !!expandedGroups[group.key];
        const shownRows = showAll ? group.rows : group.rows.slice(0, SIGNALS_CONFIG.todayCompactLimit);
        const remaining = group.rows.length - shownRows.length;
        return (
          <CardGroup key={group.key} title={group.title} count={group.rows.length}>
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
          </CardGroup>
        );
      })}

      {!rows.length && (
        <EmptyState
          icon="task"
          title="Đã xử lý các việc ưu tiên"
          hint="Chưa có tín hiệu cần hành động. Không tạo việc giả."
        />
      )}

      {(afterEvening || showSummary) && (
        <section className="mt-3 rounded-card border border-border bg-surface p-4">
          <h2 className="text-heading">Tổng kết ngày</h2>
          <p className="mt-2 text-small">
            Lời hứa đã giữ: {summary.kept} · lời hứa trễ: {summary.late} · cuộc gọi chưa ghi kết quả:{' '}
            {summary.unrecorded} · việc ngày mai: {summary.tomorrow}
          </p>
        </section>
      )}
      {!afterEvening && !showSummary && (
        <Button className="mt-2 self-start" variant="ghost" onClick={() => setShowSummary(true)}>
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

export { formatSignalEvidence };
