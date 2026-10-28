import { useNavigate } from 'react-router';
import { Icon } from '@/ui';
import { bellBadge } from './badge';
import { mostUrgentLevel } from './model';
import { useNotificationSignals } from './use-signals';

/**
 * Chuông header (PF-06): số = đúng số thẻ màn Thông báo đang hiện; bấm → /thong-bao.
 * Badge nhỏ (~0,7 chiều cao icon) + viền màu nền để tách khỏi chuông — Curtis 2026-10-21.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const { signals } = useNotificationSignals();
  const badge = bellBadge(signals.length);
  const level = mostUrgentLevel(signals, Date.now());
  const badgeTone = {
    alert: 'bg-alert text-on-alert',
    soon: 'bg-soon text-on-soon',
    ok: 'bg-ok text-on-ok',
  }[level];

  return (
    <button
      type="button"
      aria-label={badge.label}
      onClick={() => navigate('/thong-bao')}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-200"
    >
      <span className="relative">
        <Icon name="bell" size={20} />
        {badge.text && (
          <span
            aria-hidden
            data-bell-count
            className={`absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-caption leading-none tabular-nums ring-2 ring-surface-0 ${badgeTone}`}
          >
            {badge.text}
          </span>
        )}
      </span>
    </button>
  );
}
