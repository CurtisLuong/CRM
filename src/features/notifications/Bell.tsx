import { useNavigate } from 'react-router';
import { Icon } from '@/ui';
import { bellBadge } from './badge';
import { useNotificationSignals } from './use-signals';

/**
 * Chuông header (PF-06): số = đúng số thẻ màn Thông báo đang hiện; bấm → /thong-bao.
 * Badge nhỏ (~0,7 chiều cao icon) + viền màu nền để tách khỏi chuông — Curtis 2026-10-21.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const { signals } = useNotificationSignals();
  const badge = bellBadge(signals.length);

  return (
    <button
      type="button"
      aria-label={badge.label}
      onClick={() => navigate('/thong-bao')}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-2 hover:bg-surface-2"
    >
      <span className="relative">
        <Icon name="bell" size={20} />
        {badge.text && (
          <span
            aria-hidden
            data-bell-count
            className="absolute -top-1.5 -right-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-badge leading-none text-surface tabular-nums ring-2 ring-surface"
          >
            {badge.text}
          </span>
        )}
      </span>
    </button>
  );
}
