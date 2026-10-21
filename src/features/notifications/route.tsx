import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { Badge, Button, EmptyState, SignalCard } from '@/ui';
import { useNotificationSignals } from './use-signals';

export function NotificationsPage() {
  const navigate = useNavigate();
  // Cùng hook với chuông header → số trên chuông luôn bằng số thẻ dưới đây.
  const { account, customers, signals, status } = useNotificationSignals();
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
