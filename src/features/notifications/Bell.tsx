import { useNavigate } from 'react-router';
import { Icon } from '@/ui';
import { bellBadge } from './badge';
import { mostUrgentLevel } from './model';
import { useNotificationSignals } from './use-signals';

/**
 * Chuông header (PF-06): số = đúng số thẻ màn Thông báo đang hiện; bấm → /thong-bao.
 * Badge nhỏ (~0,7 chiều cao icon) + viền màu nền để tách khỏi chuông — Curtis 2026-10-21.
 * 11/11: thu còn 14px, chữ 10px, đẩy ra góc trên-phải để không che chuông khi số 2 chữ số.
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
            className={`absolute -top-2 -right-3 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-[3px] font-semibold text-[10px] leading-none tabular-nums ring-[1.5px] ring-surface-0 ${badgeTone}`}
          >
            {badge.text}
          </span>
        )}
      </span>
    </button>
  );
}
