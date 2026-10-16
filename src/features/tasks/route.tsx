import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { TASK_KINDS } from '@/config/taskKinds';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import type { Task } from '@/domain/customer';
import { countdownTag } from '@/domain/deadlines';
import { Badge, Button, EmptyState, Loading, Skeleton, type Tone, useToast } from '@/ui';
import { TASK_GROUPS, type TaskGroupId, type TaskSideFilter, taskRows } from './model';

const FIELD = 'min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text';

function deadlineLabel(task: Task, now: number) {
  const dueMs = task.due ? Date.parse(task.due) : Number.NaN;
  const tag = countdownTag(dueMs, dueMs, !!task.due_allday, now);
  if (!tag) return null;
  const tone: Tone = tag.state === 'missed' ? 'danger' : tag.state === 'due' ? 'warning' : 'neutral';
  const date = new Date(dueMs).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    ...(task.due_allday ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
  return { tone, label: `${tag.text} · ${date}` };
}

function TaskCard({
  customer,
  task,
  group,
  now,
  onComplete,
  onReopen,
  busy,
}: {
  customer: ReturnType<typeof useCustomers>[number];
  task: Task;
  group: TaskGroupId;
  now: number;
  onComplete: () => void;
  onReopen: () => void;
  busy: boolean;
}) {
  const ownPromise = (task.side || 'me') === 'me';
  const deadline = group === 'done' ? null : deadlineLabel(task, now);
  const kind = task.kind && task.kind in TASK_KINDS ? TASK_KINDS[task.kind as keyof typeof TASK_KINDS].label : 'Việc';
  return (
    <li className="flex items-start gap-3 p-3 sm:p-4">
      {group === 'done' ? (
        <Button aria-label={`Mở lại: ${task.text}`} disabled={busy} onClick={onReopen}>
          Mở lại
        </Button>
      ) : (
        <button
          type="button"
          aria-label={`Hoàn tất: ${task.text}`}
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
          <p className={`text-body-strong ${group === 'done' ? 'text-text-2 line-through' : ''}`}>
            {task.text || 'Việc chưa có nội dung'}
          </p>
          <Badge>{kind}</Badge>
          <Badge
            variant="status"
            tone={ownPromise ? 'neutral' : 'warning'}
            icon={ownPromise ? 'promise_me' : 'promise_customer'}
          >
            {ownPromise ? 'Em hứa' : 'Khách hẹn'}
          </Badge>
          {deadline && (
            <Badge variant="status" tone={deadline.tone}>
              {deadline.label}
            </Badge>
          )}
          {group === 'done' && (
            <Badge variant="status" tone="success">
              Đã xong{task.done_at ? ` · ${new Date(task.done_at).toLocaleDateString('vi-VN')}` : ''}
            </Badge>
          )}
        </div>
        <Link
          to={`/khach-hang/${encodeURIComponent(customer.id)}`}
          className="mt-1 inline-flex min-h-11 items-center text-small text-accent hover:underline"
        >
          {customer.full_name || 'Khách chưa có tên'} · {customer.phone}
        </Link>
      </div>
    </li>
  );
}

function TasksPage() {
  const { session, booting, error } = useAppSession();
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const sync = useSyncStatus();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [kind, setKind] = useState('all');
  const [side, setSide] = useState<TaskSideFilter>('all');
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busyKey, setBusyKey] = useState('');
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
                  {grouped.map(({ customer, task, group: id }) => {
                    const key = `${customer.id}:${task.at || task.text}`;
                    const taskAt = task.at;
                    const editable = customer.owner_id === account.sync.local.userId && !!taskAt;
                    return (
                      <TaskCard
                        key={key}
                        customer={customer}
                        task={task}
                        group={id}
                        now={now}
                        busy={busyKey === key || !editable}
                        onComplete={() => {
                          if (!editable || busyKey || !taskAt) return;
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
                          if (!editable || busyKey || !taskAt) return;
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
