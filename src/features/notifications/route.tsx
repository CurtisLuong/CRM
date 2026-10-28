import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { EmptyState, NotificationGroup, SignalBadge } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { SIGNALS_CONFIG, type SignalGroup } from '@/config/signals';
import type { Signal } from '@/domain/signals';
import { type Level, NOTIF_TYPES, type NotifType } from '@/lib/crm';
import { notificationLevel } from './model';
import { useNotificationSignals } from './use-signals';

const LEVEL_RANK: Record<Level, number> = { alert: 0, soon: 1, ok: 2 };

function notificationType(signal: Signal): NotifType {
  return signal.group ?? 'system';
}

export function NotificationsPage() {
  const navigate = useNavigate();
  // Cùng hook với chuông header → số trên chuông luôn bằng số thẻ dưới đây.
  const { account, customers, signals, status, hideSignal, hideSignals } = useNotificationSignals();
  const now = Date.now();
  const byId = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const grouped = useMemo(() => {
    const groups = new Map<NotifType, Signal[]>();
    for (const signal of signals) {
      const type = notificationType(signal);
      groups.set(type, [...(groups.get(type) ?? []), signal]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const groupRank = (type: NotifType) =>
        type === 'system' ? SIGNALS_CONFIG.groupOrder.length : SIGNALS_CONFIG.groupOrder.indexOf(type as SignalGroup);
      return groupRank(a) - groupRank(b);
    });
  }, [signals]);

  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-10 text-ink">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-title">Thông báo</h1>
          <p className="text-caption text-ink-muted">
            Tín hiệu được tính từ dữ liệu khách và cùng registry với Hôm nay.
          </p>
        </div>
        <span className="rounded-sm border border-line bg-surface-200 px-2 py-1 text-label">
          {signals.length} tín hiệu
        </span>
      </header>
      {!account ? (
        <EmptyState
          title="Chưa có dữ liệu tài khoản"
          text="Đăng nhập để xem thông báo theo tín hiệu của khách bạn phụ trách."
        />
      ) : signals.length === 0 ? (
        <EmptyState
          kind="done"
          title="Chưa có thông báo cần xử lý"
          text="Tín hiệu sẽ xuất hiện khi dữ liệu đáp ứng quy tắc đã cấu hình."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map(([type, items]) => {
            const levels = items.map((signal) => notificationLevel(signal, now));
            const level = levels.reduce((urgent, current) =>
              LEVEL_RANK[current] < LEVEL_RANK[urgent] ? current : urgent,
            );
            const typeDef = NOTIF_TYPES[type];
            if (items.length >= 3) {
              const groupSignals = items.flatMap((signal) => {
                const customer = byId.get(signal.customerId);
                return customer ? [{ signal, customer }] : [];
              });
              return (
                <NotificationGroup
                  key={type}
                  type={type}
                  level={level}
                  unread
                  reason={`${items.length} tín hiệu cùng loại`}
                  items={groupSignals.map(({ signal, customer }) => ({
                    customer: customer.full_name,
                    reason: signal.reason,
                    context: (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{signal.title}</span>
                        <button
                          type="button"
                          className="font-medium text-ion hover:underline"
                          onClick={() => navigate(`/ho-so/${customer.id}`)}
                        >
                          Mở hồ sơ {customer.full_name}
                        </button>
                        <button
                          type="button"
                          className="font-medium text-ink-muted hover:text-ink hover:underline"
                          aria-label={`Ẩn tín hiệu ${typeDef.title} của ${customer.full_name}`}
                          onClick={() => hideSignal(signal)}
                        >
                          Ẩn tín hiệu
                        </button>
                      </span>
                    ),
                  }))}
                  bulkLabel="Ẩn tín hiệu"
                  onBulk={() => hideSignals(groupSignals.map(({ signal }) => signal))}
                  // Màn Thông báo là danh sách đầy đủ: hiện hết khách trong nhóm (số chuông = số thẻ, không có trang "xem tất cả").
                  preview={groupSignals.length}
                  defaultOpen
                />
              );
            }
            return items.map((signal) => {
              const customer = byId.get(signal.customerId);
              if (!customer) return null;
              return (
                <article
                  key={signal.id}
                  className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface-100 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 text-body font-semibold">
                      {typeDef.title} · {customer.full_name}
                    </h2>
                    <p className="m-0 mt-1 text-caption text-ink-muted">{signal.title}</p>
                    <div className="mt-2">
                      <SignalBadge level={notificationLevel(signal, now)} size="sm">
                        {signal.reason}
                      </SignalBadge>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="ghost" onClick={() => navigate(`/ho-so/${customer.id}`)}>
                      Mở hồ sơ
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => hideSignal(signal)}
                      aria-label={`Ẩn tín hiệu ${typeDef.title} của ${customer.full_name}`}
                    >
                      Ẩn tín hiệu
                    </Button>
                  </div>
                </article>
              );
            });
          })}
        </div>
      )}
      {status && (
        <p role="status" className="text-caption text-ink-muted">
          {status}
        </p>
      )}
      <Button variant="ghost" onClick={() => navigate('/')}>
        Về Hôm nay
      </Button>
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/thong-bao',
  element: <NotificationsPage />,
  handle: { title: 'Thông báo' },
};
