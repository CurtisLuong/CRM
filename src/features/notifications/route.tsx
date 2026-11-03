import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { EmptyState, SignalBadge } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { SIGNALS_CONFIG, type SignalGroup } from '@/config/signals';
import type { Signal } from '@/domain/signals';
import { NOTIF_TYPES, type NotifType } from '@/lib/crm';
import { notificationLevel } from './model';
import { useNotificationSignals } from './use-signals';

const DEFAULT_SNOOZE = SIGNALS_CONFIG.snoozeDurations[2];

/** "Hoãn 8 giờ ▾": bấm "Hoãn" = hoãn mặc định; bấm "8 giờ ▾" mở danh sách, chọn là hoãn luôn (1 chạm). */
function SnoozeControl({
  title,
  customer,
  onSnooze,
  bulk = false,
}: {
  title: string;
  customer?: string;
  onSnooze: (duration: number) => void;
  bulk?: boolean;
}) {
  const label = customer
    ? `Tạm hoãn tín hiệu ${title} của ${customer}`
    : bulk
      ? `Tạm hoãn nhóm tín hiệu ${title}`
      : `Tạm hoãn tín hiệu ${title}`;
  return (
    <span className="inline-flex items-center text-label font-medium text-ion">
      <button
        type="button"
        onClick={() => onSnooze(DEFAULT_SNOOZE.milliseconds)}
        aria-label={label}
        className="min-h-11 cursor-pointer pr-1 hover:underline"
      >
        {bulk ? 'Hoãn cả nhóm' : 'Hoãn'}
      </button>
      <span className="relative inline-flex min-h-11 items-center gap-0.5 underline decoration-dotted underline-offset-4">
        {DEFAULT_SNOOZE.label}
        <ChevronDown aria-hidden className="size-4" />
        <select
          aria-label={`Chọn thời gian hoãn${customer ? ` cho ${customer}` : ''}`}
          value=""
          onChange={(event) => {
            const duration = SIGNALS_CONFIG.snoozeDurations.find((item) => item.label === event.target.value);
            if (duration) onSnooze(duration.milliseconds);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="" disabled>
            Chọn thời gian
          </option>
          {SIGNALS_CONFIG.snoozeDurations.map((duration) => (
            <option key={duration.label} value={duration.label}>
              Hoãn {duration.label}
            </option>
          ))}
        </select>
      </span>
    </span>
  );
}

function snoozeConfirmation(until: number) {
  const date = new Date(until);
  const today = new Date();
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const day = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return `Đã hoãn đến ${sameDay ? '' : `${day} `}${time}`;
}

function notificationType(signal: Signal): NotifType {
  return signal.group ?? 'system';
}

export function NotificationsPage() {
  const navigate = useNavigate();
  // Cùng hook với chuông header → số trên chuông luôn bằng số thẻ dưới đây.
  const { account, customers, signals, status, snoozeSignal, snoozeSignals } = useNotificationSignals();
  // Thanh xác nhận nổi trên thanh tab đáy: danh sách dài thì dòng cuối trang không ai thấy.
  const [confirmation, setConfirmation] = useState<{ text: string; undo: () => void } | null>(null);
  const showSnoozed = (result: { until: number; undo: () => void }) =>
    setConfirmation({ text: snoozeConfirmation(result.until), undo: result.undo });
  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(() => setConfirmation(null), 8000);
    return () => window.clearTimeout(timer);
  }, [confirmation]);
  const snooze = (items: Signal[], duration: number) => {
    const result = snoozeSignals(items, duration);
    showSnoozed(result);
  };
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
            const typeDef = NOTIF_TYPES[type];
            const rows = items.flatMap((signal) => {
              const customer = byId.get(signal.customerId);
              return customer ? [{ signal, customer }] : [];
            });
            if (!rows.length) return null;
            return (
              <section
                key={type}
                aria-label={typeDef.title}
                className="overflow-hidden rounded-md border border-line bg-surface-100"
              >
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-3 pt-1">
                  <h2 className="m-0 flex items-center gap-2 text-body font-semibold">
                    {typeDef.title}
                    <span className="grid h-5 place-items-center rounded-full border border-line bg-surface-200 px-[7px] font-mono text-xs">
                      {rows.length}
                    </span>
                  </h2>
                  {/* Hoãn cả nhóm chỉ khi đủ dài để đáng dùng (≥ 3 khách). */}
                  {rows.length >= 3 && (
                    <SnoozeControl
                      title={typeDef.title}
                      bulk
                      onSnooze={(duration) =>
                        snooze(
                          rows.map(({ signal }) => signal),
                          duration,
                        )
                      }
                    />
                  )}
                </div>
                <ul className="m-0 list-none p-0">
                  {rows.map(({ signal, customer }) => (
                    <li key={signal.id} className="flex min-w-0 flex-col border-t border-line px-3 pt-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <button
                          type="button"
                          aria-label={`Mở hồ sơ ${customer.full_name}`}
                          onClick={() => navigate(`/ho-so/${customer.id}`)}
                          className="min-w-0 cursor-pointer text-left text-body font-semibold text-ink [overflow-wrap:anywhere] hover:text-ion hover:underline"
                        >
                          {customer.full_name}
                        </button>
                        <SignalBadge level={notificationLevel(signal, now)} size="sm">
                          {signal.reason}
                        </SignalBadge>
                      </div>
                      {/* Một số tín hiệu có lý do = tiêu đề: không lặp lại cùng một chữ. */}
                      {signal.title !== signal.reason && (
                        <p className="m-0 mt-0.5 text-caption text-ink-muted">{signal.title}</p>
                      )}
                      <div>
                        <SnoozeControl
                          title={typeDef.title}
                          customer={customer.full_name}
                          onSnooze={(duration) => {
                            const result = snoozeSignal(signal, duration);
                            showSnoozed(result);
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {status && (
        <p role="status" className="text-caption text-ink-muted">
          {status}
        </p>
      )}
      {confirmation && (
        <div
          role="status"
          className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] z-[55] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-line bg-surface-100 py-2 pr-2 pl-4 text-label text-ink shadow-overlay md:right-4 md:bottom-4 md:left-auto md:mx-0 md:w-80"
        >
          <span className="min-w-0 flex-1">{confirmation.text}</span>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              confirmation.undo();
              setConfirmation(null);
            }}
          >
            Hoàn tác
          </Button>
        </div>
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
