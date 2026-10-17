import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { computeSignals, type SignalUiState } from '@/domain/signals';
import { Badge, Button, EmptyState, SignalCard } from '@/ui';

const keyFor = (userId: string) => `crm_signal_ui_state:${userId}`;

export function NotificationsPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const navigate = useNavigate();
  const [uiState, setUiState] = useState<SignalUiState>({});
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState('');
  const userId = account?.sync.local.userId || '';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!account || !userId) {
      setUiState({});
      return;
    }
    let active = true;
    try {
      const cached = localStorage.getItem(keyFor(userId));
      if (cached) setUiState(JSON.parse(cached) as SignalUiState);
    } catch {
      setUiState({});
    }
    void account.remote
      .getUiStateRemote()
      .then((raw) => {
        if (!active || !raw || typeof raw !== 'object') return;
        const signals = (raw as { signals?: SignalUiState['signals'] }).signals;
        const next = { signals };
        setUiState(next);
        localStorage.setItem(keyFor(userId), JSON.stringify(next));
      })
      .catch(() => {
        if (active) setStatus('Đang hiển thị tín hiệu đã lưu trên thiết bị.');
      });
    return () => {
      active = false;
    };
  }, [account, userId]);

  const signals = useMemo(
    () => (account ? computeSignals(customers, { now, ownerId: userId, ui_state: uiState }) : []),
    [account, customers, now, userId, uiState],
  );
  const byId = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-title">Thông báo</h1>
          <p className="text-small text-text-2">Tín hiệu được tính từ dữ liệu khách và cùng registry với Hôm nay.</p>
        </div>
        <Badge>{signals.length} tín hiệu</Badge>
      </header>
      {!account ? (
        <EmptyState
          title="Chưa có dữ liệu tài khoản"
          hint="Đăng nhập để xem thông báo theo tín hiệu của khách bạn phụ trách."
        />
      ) : signals.length === 0 ? (
        <EmptyState
          icon="task"
          title="Chưa có thông báo cần xử lý"
          hint="Tín hiệu sẽ xuất hiện khi dữ liệu đáp ứng quy tắc đã cấu hình."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {signals.map((signal) => {
            const customer = byId.get(signal.customerId);
            if (!customer) return null;
            return (
              <SignalCard
                key={signal.id}
                icon="bell"
                title={`${signal.title} · ${customer.full_name}`}
                why={signal.reason}
                cta={{ label: 'Mở hồ sơ', icon: 'customers', onClick: () => navigate(`/ho-so/${customer.id}`) }}
              />
            );
          })}
        </div>
      )}
      {status && (
        <p role="status" className="text-small text-text-2">
          {status}
        </p>
      )}
      <Button onClick={() => navigate('/')}>Về Hôm nay</Button>
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/thong-bao',
  element: <NotificationsPage />,
  handle: { title: 'Thông báo' },
};
