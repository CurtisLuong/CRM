import { Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { EmptyState, TextField } from '@/components/crm';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { Button, Input } from './kit';
import { CallHistoryActions, QuickActionButtons } from './QuickActions';
import { openQuickAction, type QuickAction } from './store';

const FIELD =
  'h-11 w-full rounded-sm border border-input bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion';
function QuickActionsPage() {
  const { session, booting, error } = useAppSession();
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [query, setQuery] = useState(''),
    [working, setWorking] = useState(false),
    [failure, setFailure] = useState('');
  const action = params.get('action');
  const intent: QuickAction | null = action === 'note' || action === 'schedule' ? action : null;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-title">Thao tác nhanh</h1>
      {!account ? (
        booting ? (
          <div role="status" aria-label="Đang mở dữ liệu trên máy">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !session ? (
          <EmptyState title="Chưa cấu hình kết nối staging" text={error || 'Cần cấu hình Supabase để đăng nhập.'} />
        ) : (
          <form
            className="flex max-w-md flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (working) return;
              setWorking(true);
              setFailure('');
              try {
                await session.auth.signIn(email, password);
                setPassword('');
              } catch (e) {
                setFailure(e instanceof Error ? e.message : 'Đăng nhập chưa thành công.');
              } finally {
                setWorking(false);
              }
            }}
          >
            <p className="text-caption text-ink-muted">Đăng nhập để mở dữ liệu của bạn.</p>
            <label htmlFor="quick-actions-email" className="flex flex-col gap-1 text-label">
              Email
              <Input
                className={FIELD}
                id="quick-actions-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label htmlFor="quick-actions-password" className="flex flex-col gap-1 text-label">
              Mật khẩu
              <Input
                className={FIELD}
                id="quick-actions-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit" variant="primary" loading={working}>
              Đăng nhập
            </Button>
            {failure && (
              <p role="alert" className="text-alert-text text-caption">
                {failure}
              </p>
            )}
          </form>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption text-ink-muted">Gọi, nhắn, ghi chú hoặc hẹn ngay trên dòng khách.</p>
            <Button onClick={() => void session?.auth.signOut()}>Đăng xuất</Button>
          </div>
          <TextField
            id="quick-actions-search"
            label="Chọn khách"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên hoặc số điện thoại"
          />
          {customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Chưa có khách trên máy"
              text="Dữ liệu sẽ xuất hiện sau lần đồng bộ đầu tiên."
            />
          ) : (
            <ul className="divide-y divide-border">
              {customers
                .filter((c) =>
                  `${c.full_name} ${c.phone}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')),
                )
                .map((c) => (
                  <li key={c.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="break-words text-body-strong">{c.full_name}</h2>
                        <p className="font-mono text-caption text-ink-muted">{c.phone}</p>
                      </div>
                      {intent ? (
                        <Button
                          onClick={() => openQuickAction(c.id, intent)}
                          disabled={c.owner_id !== account.sync.local.userId}
                        >
                          {intent === 'note' ? 'Ghi chú' : 'Hẹn'}
                        </Button>
                      ) : (
                        <QuickActionButtons customer={c} />
                      )}
                    </div>
                    {c.owner_id !== account.sync.local.userId ? (
                      <p className="text-caption text-ink-muted">Khách nhóm · Chỉ xem</p>
                    ) : (
                      <CallHistoryActions customer={c} />
                    )}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
      {error && account && (
        <p role="status" className="text-caption text-ink-muted">
          Đang dùng dữ liệu trên máy. Đồng bộ chưa hoàn tất.
        </p>
      )}
    </main>
  );
}
export const route: FeatureRoute = {
  path: '/thao-tac-nhanh',
  element: <QuickActionsPage />,
  handle: { title: 'Thao tác nhanh' },
};
