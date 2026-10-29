import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { ActionItem, ChipGroup, EmptyState } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CALL_APPOINTMENT, TASK_KINDS, taskKindOf } from '@/config/taskKinds';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import { fmtClock } from '@/domain/deadlines';
import { appendPromise, promiseTaskKey, snoozePromise, undoPromiseSnooze } from '@/domain/deadlines/promises';
import { fmt as formatDuration } from '@/domain/velocity/engine';
import { openQuickAction } from '@/features/quick-actions/store';
import { signalFor } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { useToast } from '@/ui/Toast';
import { TASK_GROUPS, type TaskGroupId, type TaskRow, type TaskSideFilter, taskRows, taskTiming } from './model';

const FIELD = 'min-h-11 rounded-md border border-line bg-surface-100 px-3 text-body text-ink';
const FILTER_SELECT =
  'min-h-11 rounded-md border border-input bg-surface-100 px-3 text-body text-ink hover:border-ink-muted focus-visible:border-ion focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ion';
/** Nút phụ trong thẻ (Sửa/Dời): nhỏ, không chiếm chỗ của hành động chính. */
const SMALL_ACTION =
  'inline-flex min-h-11 items-center rounded-md px-3 text-label text-ink-muted hover:bg-surface-200 disabled:opacity-50';

function deadlineLabel(row: TaskRow, group: TaskGroupId, now: number) {
  if (group === 'done') return null;
  const timing = taskTiming(row, now);
  if (!timing) return null;
  const due = row.type === 'call' ? row.appointment.start : row.task.due;
  const level =
    timing.state === 'missed'
      ? 'alert'
      : timing.state === 'due'
        ? 'soon'
        : due
          ? signalFor(due, now, { allDay: timing.allDay })
          : 'ok';
  const dueDate = new Date(timing.startMs);
  const today = new Date(now);
  const sameDay = dueDate.toDateString() === today.toDateString();
  const date = `${dueDate.getDate()}/${dueDate.getMonth() + 1}`;
  const clock = fmtClock(timing.startMs);
  const shortClock = clock.endsWith(':00') ? `${clock.slice(0, 2)}h` : clock;
  const stamp = timing.allDay
    ? date
    : `${sameDay ? '' : `${date} `}${timing.state === 'far' || timing.state === 'soon' ? shortClock : clock}`;
  const elapsedFrom = row.type === 'call' ? timing.endMs : timing.startMs;
  const text =
    timing.allDay && timing.state === 'missed'
      ? `Quá hạn · ${stamp}`
      : timing.state === 'missed'
        ? `Quá ${formatDuration(now - elapsedFrom)} · ${stamp}`
        : timing.state === 'due'
          ? `Đến hạn · ${stamp}`
          : stamp;
  return {
    tone: level === 'alert' ? 'over' : level === 'soon' ? 'soon' : undefined,
    level,
    text,
  };
}

function toLocalDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
  onSaveEdit,
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
  onSaveEdit: (text: string, due: string) => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const [showSnooze, setShowSnooze] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editText, setEditText] = useState<string>(row.type === 'task' ? (row.task.text ?? '') : '');
  const [editDue, setEditDue] = useState(() => (row.type === 'task' ? toLocalDateTime(row.task.due ?? undefined) : ''));
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
  const deadline = deadlineLabel(row, group, now);
  const kind = row.type === 'call' ? CALL_APPOINTMENT : taskKindOf(task?.kind);
  const text =
    row.type === 'call'
      ? `Hẹn gọi${row.appointment.reason ? ` · ${row.appointment.reason}` : ''}`
      : task?.text || 'Việc chưa có nội dung';
  const done = group === 'done' && row.type === 'task';
  return (
    <li data-card data-tone={deadline?.tone} className="min-w-0">
      <div className="min-w-0 flex-1">
        <ActionItem
          level={deadline?.level ?? 'ok'}
          title={
            <>
              {text}
              {ownPromise !== null && (
                <span className="ml-1 text-caption font-medium text-ink-muted">
                  {ownPromise ? 'Em hứa' : 'Khách hẹn'}
                </span>
              )}
              {done && row.type === 'task' && row.task.done_at && (
                <span className="ml-1 text-caption font-medium text-ink-muted">
                  Đã xong · {new Date(row.task.done_at).toLocaleDateString('vi-VN')}
                </span>
              )}
            </>
          }
          customer={customer.full_name || 'Khách chưa có tên'}
          context={kind.label}
          time={deadline?.text ?? (done ? 'Đã xong' : 'Chưa có hạn')}
          actionLabel={row.type === 'call' ? 'Gọi' : done ? 'Mở lại' : 'Xong'}
          actionAriaLabel={
            row.type === 'call'
              ? `Gọi: ${customer.full_name}`
              : done
                ? `Mở lại: ${row.task.text}`
                : `Hoàn tất: ${row.task.text}`
          }
          disabled={busy}
          compact
          wrapTime
          onAction={row.type === 'call' ? onCall : done ? onReopen : onComplete}
          onOpen={() => navigate(`/khach-hang/${customer.id}`)}
        />
        {row.type === 'task' && !done && (
          <div className="mt-1">
            {!showEdit && !showSnooze && (
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" disabled={busy} onClick={() => setShowEdit(true)} className={SMALL_ACTION}>
                  Sửa
                </button>
                <button type="button" disabled={busy} onClick={() => setShowSnooze(true)} className={SMALL_ACTION}>
                  Dời
                </button>
              </div>
            )}
            {showEdit && (
              <form
                className="flex min-w-0 flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const cleanText = editText.trim();
                  if (!cleanText) return;
                  onSaveEdit(cleanText, editDue);
                  setShowEdit(false);
                }}
              >
                <label className="flex min-w-0 flex-col gap-1 text-label text-ink-muted">
                  Nội dung việc
                  <input
                    aria-label={`Sửa nội dung: ${row.task.text}`}
                    className={cn(FIELD, 'w-full min-w-0')}
                    required
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-label text-ink-muted">
                  Hạn (để trống nếu không hạn)
                  <input
                    aria-label={`Sửa hạn: ${row.task.text}`}
                    className={cn(FIELD, 'w-full min-w-0')}
                    type="datetime-local"
                    value={editDue}
                    onChange={(event) => setEditDue(event.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="submit" variant="primary" disabled={busy} className="min-h-9">
                    Lưu sửa
                  </Button>
                  <Button type="button" disabled={busy} className="min-h-9" onClick={() => setShowEdit(false)}>
                    Huỷ
                  </Button>
                </div>
              </form>
            )}
            {/* Delete stays unavailable until v1 can read a tombstone without treating it as completed. */}
            {showSnooze && (
              <form
                className="flex min-w-0 flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!snoozeDue) return;
                  onSnooze(new Date(snoozeDue).toISOString(), snoozeReason);
                  setShowSnooze(false);
                }}
              >
                <label className="flex min-w-0 flex-col gap-1 text-label text-ink-muted">
                  Hạn mới
                  <input
                    aria-label={`Hạn mới: ${row.task.text}`}
                    className={cn(FIELD, 'w-full min-w-0')}
                    type="datetime-local"
                    required
                    value={snoozeDue}
                    onChange={(event) => setSnoozeDue(event.target.value)}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-label text-ink-muted">
                  Lý do dời
                  <select
                    aria-label={`Lý do dời: ${row.task.text}`}
                    className={cn(FIELD, 'w-full min-w-0')}
                    value={snoozeReason}
                    onChange={(event) => setSnoozeReason(event.target.value)}
                  >
                    <option>Em bận</option>
                    <option>Khách bận</option>
                    <option>Chờ thông tin</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="submit" variant="primary" disabled={busy} className="min-h-9">
                    Lưu hạn mới
                  </Button>
                  <Button type="button" className="min-h-9" onClick={() => setShowSnooze(false)}>
                    Huỷ
                  </Button>
                </div>
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
          <div role="status" aria-label="Đang mở dữ liệu trên máy" className="flex flex-col gap-3">
            <span className="text-label text-ink-muted">Đang mở dữ liệu trên máy</span>
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !session ? (
          <EmptyState title="Chưa cấu hình kết nối" text={error || 'Cần cấu hình Supabase để đăng nhập.'} />
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
            <p className="text-label text-ink-muted">Đăng nhập để xem các cam kết của bạn.</p>
            <label className="flex flex-col gap-1 text-label">
              Email
              <input
                className={FIELD}
                type="email"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-label">
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
              <p role="alert" className="text-label text-alert-text">
                {loginError || error}
              </p>
            )}
          </form>
        )}
      </main>
    );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-2 px-1">
        <p className="text-caption text-ink-muted">{rows.length} việc · Em hứa và Khách hẹn</p>
        <p className="text-caption text-ink-muted">
          {sync.pending ? `${sync.pending} thay đổi chờ đồng bộ` : 'Đã đồng bộ'}
        </p>
      </header>
      <section className="rounded-md border border-line bg-surface-100 p-3">
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
            <label className="flex flex-col gap-1 text-label text-ink-muted sm:col-span-2">
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
            <label className="flex flex-col gap-1 text-label text-ink-muted sm:col-span-2">
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
            <label className="flex flex-col gap-1 text-label text-ink-muted">
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
            <label className="flex flex-col gap-1 text-label text-ink-muted">
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
            <label className="flex flex-col gap-1 text-label text-ink-muted">
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
              <p role="alert" className="text-label text-alert-text sm:col-span-2">
                {createError}
              </p>
            )}
          </form>
        )}
      </section>
      <section
        aria-label="Lọc công việc"
        className="grid grid-cols-1 gap-3 rounded-md border border-line bg-surface-100 p-3 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-label text-ink-muted">
          Loại việc
          <select
            aria-label="Lọc theo loại việc"
            className={FILTER_SELECT}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">Tất cả loại</option>
            {Object.entries(TASK_KINDS).map(([key, value]) => (
              <option key={key} value={key}>
                {key === 'call' ? CALL_APPOINTMENT.label : value.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 text-label text-ink-muted">
          <span>Cam kết</span>
          <ChipGroup
            label="Lọc theo người hứa"
            value={side}
            allowEmpty={false}
            onChange={(value) => value && setSide(value as TaskSideFilter)}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'me', label: 'Em hứa' },
              { value: 'customer', label: 'Khách hẹn' },
            ]}
          />
        </div>
      </section>
      {rows.length === 0 ? (
        <EmptyState
          title="Không có công việc phù hợp"
          text={
            customers.length
              ? 'Thử đổi bộ lọc hoặc xem lại sau.'
              : 'Việc mới sẽ xuất hiện tại đây khi được thêm vào hồ sơ khách.'
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {TASK_GROUPS.map((group) => {
            const grouped = rows.filter((row) => row.group === group.id);
            if (!grouped.length) return null;
            return (
              <section key={group.id} aria-labelledby={`tasks-${group.id}`} className="flex flex-col gap-2">
                <header className="flex items-center justify-between gap-2 px-1">
                  <h2 id={`tasks-${group.id}`} className="text-section-head">
                    {group.label}
                  </h2>
                  <span className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-surface-200 px-1.5 text-caption text-ink-muted">
                    {grouped.length}
                  </span>
                </header>
                <ul className="flex flex-col gap-2">
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
                        onSaveEdit={(text, dueValue) => {
                          if (row.type !== 'task' || !editable || !taskAt || busyKey) return;
                          const current = customersRef.current.find((entry) => entry.id === customer.id);
                          if (!current) return;
                          const beforeList = Array.isArray(current.next_tasks) ? current.next_tasks : [];
                          const target = beforeList.find((entry) => entry?.at === taskAt);
                          if (!target || target.done_at) return;
                          const due = dueValue ? new Date(dueValue).toISOString() : '';
                          const nextList = beforeList.map((entry) => {
                            if (entry?.at !== taskAt) return entry;
                            const updated = { ...entry, text };
                            if (due) updated.due = due;
                            else delete updated.due;
                            if (!due || !entry.due_allday) delete updated.due_allday;
                            return updated;
                          });
                          setBusyKey(key);
                          void account.customers
                            .update(customer.id, { next_tasks: nextList })
                            .then(() => toast({ title: 'Đã sửa việc', description: `${text} · ${customer.full_name}` }))
                            .catch((cause) =>
                              toast({
                                title: 'Chưa sửa được việc',
                                description: cause instanceof Error ? cause.message : 'Thử lại sau.',
                                tone: 'error',
                              }),
                            )
                            .finally(() => setBusyKey(''));
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
