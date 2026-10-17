import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { TASK_KINDS } from '@/config/taskKinds';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import { countdownTag } from '@/domain/deadlines';
import { appendPromise, promiseTaskKey, snoozePromise, undoPromiseSnooze } from '@/domain/deadlines/promises';
import { openQuickAction } from '@/features/quick-actions/store';
import { Badge, Button, EmptyState, Loading, Skeleton, type Tone, useToast } from '@/ui';
import { TASK_GROUPS, type TaskGroupId, type TaskRow, type TaskSideFilter, taskRows } from './model';

const FIELD = 'min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text';

function deadlineLabel(row: TaskRow, now: number) {
  const startMs =
    row.type === 'call' ? Date.parse(row.appointment.start) : row.task.due ? Date.parse(row.task.due) : Number.NaN;
  const endMs = row.type === 'call' && row.appointment.end ? Date.parse(row.appointment.end) : startMs;
  const allDay = row.type === 'task' && !!row.task.due_allday;
  const tag = countdownTag(startMs, endMs, allDay, now);
  if (!tag) return null;
  const tone: Tone = tag.state === 'missed' ? 'danger' : tag.state === 'due' ? 'warning' : 'neutral';
  const date = new Date(startMs).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
  return { tone, label: `${tag.text} · ${date}` };
}

function TaskCard({
  customer,
  row,
  group,
  now,
  onComplete,
  onReopen,
  onCall,
  onSnooze,
  busy,
}: {
  customer: ReturnType<typeof useCustomers>[number];
  row: TaskRow;
  group: TaskGroupId;
  now: number;
  onComplete: () => void;
  onReopen: () => void;
  onCall: () => void;
  onSnooze: (due: string, reason: string) => void;
  busy: boolean;
}) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDue, setSnoozeDue] = useState(() => {
    const due = row.type === 'task' ? row.task.due : undefined;
    if (!due) return '';
    const date = new Date(due);
    if (row.type === 'task' && row.task.due_allday) date.setHours(9, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  });
  const [snoozeReason, setSnoozeReason] = useState('Em bận');
  const task = row.type === 'task' ? row.task : null;
  const ownPromise = task ? (task.side || 'me') === 'me' : null;
  const deadline = group === 'done' ? null : deadlineLabel(row, now);
  const kind =
    row.type === 'call'
      ? TASK_KINDS.call.label
      : task?.kind && task.kind in TASK_KINDS
        ? TASK_KINDS[task.kind as keyof typeof TASK_KINDS].label
        : 'Việc';
  const text =
    row.type === 'call'
      ? `Hẹn gọi${row.appointment.reason ? ` · ${row.appointment.reason}` : ''}`
      : task?.text || 'Việc chưa có nội dung';
  return (
    <li className="flex items-start gap-3 p-3 sm:p-4">
      {row.type === 'call' ? (
        <Button aria-label={`Gọi: ${customer.full_name}`} disabled={busy} onClick={onCall} icon="call">
          Gọi
        </Button>
      ) : group === 'done' ? (
        <Button aria-label={`Mở lại: ${row.task.text}`} disabled={busy} onClick={onReopen}>
          Mở lại
        </Button>
      ) : (
        <button
          type="button"
          aria-label={`Hoàn tất: ${row.task.text}`}
          title="Hoàn tất việc"
          disabled={busy}
          onClick={onComplete}
          className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-border-strong bg-surface text-text-2 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <span aria-hidden="true" className="size-4 rounded-full border-2 border-current" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-body-strong ${group === 'done' ? 'text-text-2 line-through' : ''}`}>{text}</p>
          <Badge>{kind}</Badge>
          {ownPromise !== null && (
            <Badge
              variant="status"
              tone={ownPromise ? 'neutral' : 'warning'}
              icon={ownPromise ? 'promise_me' : 'promise_customer'}
            >
              {ownPromise ? 'Em hứa' : 'Khách hẹn'}
            </Badge>
          )}
          {row.type === 'call' && (
            <Badge variant="status" icon="call_sched">
              Lịch hẹn
            </Badge>
          )}
          {deadline && (
            <Badge variant="status" tone={deadline.tone}>
              {deadline.label}
            </Badge>
          )}
          {group === 'done' && row.type === 'task' && (
            <Badge variant="status" tone="success">
              Đã xong{row.task.done_at ? ` · ${new Date(row.task.done_at).toLocaleDateString('vi-VN')}` : ''}
            </Badge>
          )}
        </div>
        <Link
          to={`/khach-hang/${encodeURIComponent(customer.id)}`}
          className="mt-1 inline-flex min-h-11 items-center text-small text-accent hover:underline"
        >
          {customer.full_name || 'Khách chưa có tên'} · {customer.phone}
        </Link>
        {row.type === 'task' && group !== 'done' && (
          <div className="mt-1">
            {!showSnooze ? (
              <Button disabled={busy} onClick={() => setShowSnooze(true)}>
                Dời
              </Button>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!snoozeDue) return;
                  onSnooze(new Date(snoozeDue).toISOString(), snoozeReason);
                  setShowSnooze(false);
                }}
              >
                <label className="flex flex-col gap-1 text-small text-text-2">
                  Hạn mới
                  <input
                    aria-label={`Hạn mới: ${row.task.text}`}
                    className={FIELD}
                    type="datetime-local"
                    required
                    value={snoozeDue}
                    onChange={(event) => setSnoozeDue(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-small text-text-2">
                  Lý do dời
                  <select
                    aria-label={`Lý do dời: ${row.task.text}`}
                    className={FIELD}
                    value={snoozeReason}
                    onChange={(event) => setSnoozeReason(event.target.value)}
                  >
                    <option>Em bận</option>
                    <option>Khách bận</option>
                    <option>Chờ thông tin</option>
                  </select>
                </label>
                <Button type="submit" variant="primary" disabled={busy}>
                  Lưu hạn mới
                </Button>
                <Button type="button" onClick={() => setShowSnooze(false)}>
                  Huỷ
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function TasksPage() {
  const { session, booting, error } = useAppSession();
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const customersRef = useRef(customers);
  customersRef.current = customers;
  const sync = useSyncStatus();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [kind, setKind] = useState('all');
  const [side, setSide] = useState<TaskSideFilter>('all');
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createCustomer, setCreateCustomer] = useState('');
  const [createText, setCreateText] = useState('');
  const [createSide, setCreateSide] = useState<'me' | 'customer'>('me');
  const [createKind, setCreateKind] = useState('other');
  const [createDue, setCreateDue] = useState('');
  const [createError, setCreateError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const rows = useMemo(() => taskRows(customers, now, kind, side), [customers, now, kind, side]);

  if (!account)
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <h1 className="text-title">Công việc</h1>
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
                await session.auth.signIn(loginEmail, password);
                setPassword('');
              } catch (cause) {
                setLoginError(cause instanceof Error ? cause.message : 'Đăng nhập chưa thành công.');
              }
            }}
          >
            <p className="text-small text-text-2">Đăng nhập để xem các cam kết của bạn.</p>
            <label className="flex flex-col gap-1 text-small">
              Email
              <input
                className={FIELD}
                type="email"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Mật khẩu
              <input
                className={FIELD}
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button type="submit" variant="primary">
              Đăng nhập
            </Button>
            {(loginError || error) && (
              <p role="alert" className="text-small text-danger">
                {loginError || error}
              </p>
            )}
          </form>
        )}
      </main>
    );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-title">Công việc</h1>
          <p className="text-small text-text-2">{rows.length} việc · Em hứa và Khách hẹn</p>
        </div>
        <p className="text-small text-text-2">{sync.pending ? `${sync.pending} thay đổi chờ đồng bộ` : 'Đã đồng bộ'}</p>
      </header>
      <section className="rounded-card border border-border bg-surface p-3">
        {!showCreate ? (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            Thêm lời hứa
          </Button>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (createBusy) return;
              setCreateError('');
              const customer = customersRef.current.find(
                (entry) => entry.id === createCustomer && entry.owner_id === account.sync.local.userId,
              );
              const text = createText.trim();
              if (!customer || !text) return;
              setCreateBusy(true);
              try {
                const due = createDue ? new Date(createDue).toISOString() : undefined;
                const key = promiseTaskKey(customer.id, createSide, text, due);
                const list = Array.isArray(customer.next_tasks) ? customer.next_tasks : [];
                const result = appendPromise(list, {
                  text,
                  at: new Date().toISOString(),
                  kind: createKind,
                  side: createSide,
                  source: 'manual',
                  key,
                  ...(due ? { due } : {}),
                });
                if (!result.added) {
                  toast({ title: 'Lời hứa đã có', description: 'Việc cùng nội dung và hạn đã được ghi trước đó.' });
                  return;
                }
                await account.customers.update(customer.id, { next_tasks: result.tasks });
                setCreateText('');
                setCreateDue('');
                setShowCreate(false);
                toast({ title: 'Đã thêm lời hứa', description: `${text} · ${customer.full_name}` });
              } catch (cause) {
                setCreateError(cause instanceof Error ? cause.message : 'Chưa lưu được lời hứa. Thử lại sau.');
              } finally {
                setCreateBusy(false);
              }
            }}
          >
            <label className="flex flex-col gap-1 text-small text-text-2 sm:col-span-2">
              Khách hàng
              <select
                aria-label="Khách hàng của lời hứa"
                required
                className={FIELD}
                value={createCustomer}
                onChange={(event) => setCreateCustomer(event.target.value)}
              >
                <option value="">Chọn khách hàng</option>
                {customers
                  .filter((entry) => entry.owner_id === account.sync.local.userId)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.full_name} · {entry.phone}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small text-text-2 sm:col-span-2">
              Việc cần làm
              <input
                aria-label="Nội dung lời hứa"
                required
                className={FIELD}
                value={createText}
                onChange={(event) => setCreateText(event.target.value)}
                placeholder="Ví dụ: Gửi bảng giá căn 2 phòng ngủ"
              />
            </label>
            <label className="flex flex-col gap-1 text-small text-text-2">
              Cam kết
              <select
                aria-label="Loại lời hứa"
                className={FIELD}
                value={createSide}
                onChange={(event) => setCreateSide(event.target.value as 'me' | 'customer')}
              >
                <option value="me">Em hứa</option>
                <option value="customer">Khách hẹn</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small text-text-2">
              Loại việc
              <select
                aria-label="Loại việc mới"
                className={FIELD}
                value={createKind}
                onChange={(event) => setCreateKind(event.target.value)}
              >
                {Object.entries(TASK_KINDS)
                  .filter(([key]) => key !== 'call')
                  .map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small text-text-2">
              Hạn
              <input
                aria-label="Hạn lời hứa"
                className={FIELD}
                type="datetime-local"
                value={createDue}
                onChange={(event) => setCreateDue(event.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" variant="primary" disabled={createBusy}>
                Lưu lời hứa
              </Button>
              <Button type="button" onClick={() => setShowCreate(false)}>
                Huỷ
              </Button>
            </div>
            {createError && (
              <p role="alert" className="text-small text-danger sm:col-span-2">
                {createError}
              </p>
            )}
          </form>
        )}
      </section>
      <section
        aria-label="Lọc công việc"
        className="grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-small text-text-2">
          Loại việc
          <select
            aria-label="Lọc theo loại việc"
            className={FIELD}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">Tất cả loại</option>
            {Object.entries(TASK_KINDS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-text-2">
          Cam kết
          <select
            aria-label="Lọc theo người hứa"
            className={FIELD}
            value={side}
            onChange={(event) => setSide(event.target.value as TaskSideFilter)}
          >
            <option value="all">Em hứa và Khách hẹn</option>
            <option value="me">Em hứa</option>
            <option value="customer">Khách hẹn</option>
          </select>
        </label>
      </section>
      {rows.length === 0 ? (
        <EmptyState
          title="Không có công việc phù hợp"
          hint={
            customers.length
              ? 'Thử đổi bộ lọc hoặc xem lại sau.'
              : 'Việc mới sẽ xuất hiện tại đây khi được thêm vào hồ sơ khách.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {TASK_GROUPS.map((group) => {
            const grouped = rows.filter((row) => row.group === group.id);
            if (!grouped.length) return null;
            return (
              <section
                key={group.id}
                aria-labelledby={`tasks-${group.id}`}
                className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
              >
                <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-3 sm:px-4">
                  <h2 id={`tasks-${group.id}`} className="text-heading">
                    {group.label}
                  </h2>
                  <Badge variant="count">{grouped.length}</Badge>
                </header>
                <ul className="divide-y divide-border">
                  {grouped.map((row) => {
                    const { customer, group: id } = row;
                    const task = row.type === 'task' ? row.task : null;
                    const key =
                      row.type === 'call'
                        ? `${customer.id}:call:${row.appointment.start}`
                        : `${customer.id}:${task?.at || task?.text}`;
                    const taskAt = task?.at;
                    const canOwn = customer.owner_id === account.sync.local.userId;
                    const editable = canOwn && !!taskAt;
                    return (
                      <TaskCard
                        key={key}
                        customer={customer}
                        row={row}
                        group={id}
                        now={now}
                        busy={busyKey === key || (row.type === 'call' ? !canOwn : !editable)}
                        onComplete={() => {
                          if (row.type !== 'task' || !editable || busyKey || !taskAt) return;
                          setBusyKey(key);
                          void account.customers
                            .completeTask(customer.id, taskAt)
                            .then(() =>
                              toast({
                                title: 'Đã xong việc',
                                description: `${task.text} · ${customer.full_name}`,
                                onUndo: () => {
                                  void account.customers.reopenTask(customer.id, taskAt).catch((cause) =>
                                    toast({
                                      title: 'Chưa hoàn tác được việc',
                                      description: cause instanceof Error ? cause.message : 'Thử lại sau.',
                                      tone: 'error',
                                    }),
                                  );
                                },
                              }),
                            )
                            .catch((cause) =>
                              toast({
                                title: 'Chưa hoàn tất được việc',
                                description: cause instanceof Error ? cause.message : 'Thử lại sau.',
                                tone: 'error',
                              }),
                            )
                            .finally(() => setBusyKey(''));
                        }}
                        onReopen={() => {
                          if (row.type !== 'task' || !editable || busyKey || !taskAt) return;
                          setBusyKey(key);
                          void account.customers
                            .reopenTask(customer.id, taskAt)
                            .catch((cause) =>
                              toast({
                                title: 'Chưa mở lại được việc',
                                description: cause instanceof Error ? cause.message : 'Thử lại sau.',
                                tone: 'error',
                              }),
                            )
                            .finally(() => setBusyKey(''));
                        }}
                        onCall={() => {
                          if (row.type !== 'call' || !canOwn) return;
                          openQuickAction(customer.id, 'call');
                        }}
                        onSnooze={(due, reason) => {
                          if (row.type !== 'task' || !taskAt || busyKey) return;
                          const current = customersRef.current.find((entry) => entry.id === customer.id);
                          if (!current) return;
                          const beforeList = Array.isArray(current.next_tasks) ? current.next_tasks : [];
                          const before = beforeList.find((entry) => entry?.at === taskAt);
                          if (!before) return;
                          const nextList = beforeList.map((entry) =>
                            entry?.at === taskAt ? snoozePromise(entry, due, reason) : entry,
                          );
                          setBusyKey(key);
                          void account.customers
                            .update(customer.id, { next_tasks: nextList })
                            .then(() =>
                              toast({
                                title: 'Đã dời lời hứa',
                                description: `${task?.text} · ${reason}`,
                                onUndo: () => {
                                  const latest = customersRef.current.find((entry) => entry.id === customer.id);
                                  const latestList = Array.isArray(latest?.next_tasks) ? latest.next_tasks : nextList;
                                  const restored = latestList.map((entry) =>
                                    entry?.at === taskAt ? undoPromiseSnooze(entry, before) : entry,
                                  );
                                  void account.customers.update(customer.id, { next_tasks: restored }).catch((cause) =>
                                    toast({
                                      title: 'Chưa hoàn tác được',
                                      description: cause instanceof Error ? cause.message : 'Thử lại sau.',
                                      tone: 'error',
                                    }),
                                  );
                                },
                              }),
                            )
                            .catch((cause) =>
                              toast({
                                title: 'Chưa dời được lời hứa',
                                description: cause instanceof Error ? cause.message : 'Thử lại sau.',
                                tone: 'error',
                              }),
                            )
                            .finally(() => setBusyKey(''));
                        }}
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

export const route: FeatureRoute = { path: '/cong-viec', element: <TasksPage />, handle: { title: 'Công việc' } };
