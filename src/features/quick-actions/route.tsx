import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { Button, EmptyState, Loading, Skeleton } from '@/ui';
import { CallHistoryActions, QuickActionButtons } from './QuickActions';
import { openQuickAction, type QuickAction } from './store';

const FIELD = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text';
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
          <Loading label="Đang mở dữ liệu trên máy">
            <Skeleton className="h-20 w-full" />
          </Loading>
        ) : !session ? (
          <EmptyState
            title="Chưa cấu hình kết nối staging"
            hint={error || 'Cần VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY để đăng nhập.'}
          />
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
            <p className="text-small text-text-2">Đăng nhập để mở dữ liệu của bạn.</p>
            <label className="flex flex-col gap-1 text-small">
              Email
              <input
                className={FIELD}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Mật khẩu
              <input
                className={FIELD}
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
              <p role="alert" className="text-danger text-small">
                {failure}
              </p>
            )}
          </form>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-small text-text-2">Gọi, nhắn, ghi chú hoặc hẹn ngay trên dòng khách.</p>
            <Button onClick={() => void session?.auth.signOut()}>Đăng xuất</Button>
          </div>
          <label className="flex flex-col gap-1 text-small">
            Chọn khách
            <input
              type="search"
              className={FIELD}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tên hoặc số điện thoại"
            />
          </label>
          {customers.length === 0 ? (
            <EmptyState
              icon="customers"
              title="Chưa có khách trên máy"
              hint="Dữ liệu sẽ xuất hiện sau lần đồng bộ đầu tiên."
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
                        <p className="font-data text-mono-data text-text-2">{c.phone}</p>
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
                      <p className="text-small text-text-2">Khách nhóm · Chỉ xem</p>
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
        <p role="status" className="text-small text-text-2">
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
