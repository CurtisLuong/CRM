import { type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { IconButton } from './Button';
import { cn } from './cn';
import { Icon } from './Icon';
import { type Countdown, DeadlineTag, type Health, HealthDot, StageChip } from './status';

/** Chữ cái đầu của 2 từ cuối (tên Việt: "Nguyễn Thị Lan" → "TL"). */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w
    .slice(-2)
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('');
}

/** Avatar trung tính (surface-2 + text-2), không màu riêng theo khách. */
export function Avatar({ name, size = 36, className }: { name: string; size?: 36 | 40 | 56; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-label text-text-2',
        size === 56 && 'text-section',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

type QuickActions = { onCall?: () => void; onZalo?: () => void };

function RowActions({ name, onCall, onZalo }: QuickActions & { name: string }) {
  if (!onCall && !onZalo) return null;
  return (
    <span className="flex shrink-0 gap-1">
      {onCall && <IconButton icon="call" label={`Gọi ${name}`} onClick={onCall} />}
      {onZalo && <IconButton icon="message" label={`Zalo ${name}`} onClick={onZalo} />}
    </span>
  );
}

const SWIPE_PX = 72;

/**
 * Vuốt ngang trên dòng: trái = `onSwipeLeft` (Xong/Dời), phải = `onSwipeRight` (Gọi).
 * Chỉ là lối tắt — hành động luôn có nút tương đương (truy cập bằng bàn phím/screen reader).
 */
function useSwipe(onLeft?: () => void, onRight?: () => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const enabled = Boolean(onLeft || onRight);
  return {
    dx,
    handlers: enabled
      ? {
          onPointerDown: (e: PointerEvent) => {
            if (e.pointerType === 'mouse') return;
            start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          },
          onPointerMove: (e: PointerEvent) => {
            const s = start.current;
            if (!s || s.id !== e.pointerId) return;
            const x = e.clientX - s.x;
            if (Math.abs(e.clientY - s.y) > Math.abs(x) && Math.abs(x) < 8) return;
            if ((x < 0 && !onLeft) || (x > 0 && !onRight)) return;
            setDx(Math.max(-120, Math.min(120, x)));
          },
          onPointerUp: () => {
            if (dx <= -SWIPE_PX) onLeft?.();
            else if (dx >= SWIPE_PX) onRight?.();
            start.current = null;
            setDx(0);
          },
          onPointerCancel: () => {
            start.current = null;
            setDx(0);
          },
        }
      : {},
  };
}

function RowShell({
  onOpen,
  onSwipeLeft,
  onSwipeRight,
  swipeLeftLabel,
  children,
  trailing,
  className,
}: {
  onOpen?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  swipeLeftLabel?: string;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const { dx, handlers } = useSwipe(onSwipeLeft, onSwipeRight);
  return (
    <li className={cn('relative list-none overflow-hidden', className)}>
      {dx !== 0 && (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 flex items-center px-4 text-body-strong',
            dx > 0 ? 'justify-start bg-accent-soft text-accent' : 'justify-end bg-success-bg text-success',
          )}
        >
          {dx > 0 ? (
            <>
              <Icon name="call" size={20} /> Gọi
            </>
          ) : (
            <>
              {swipeLeftLabel ?? 'Xong'} <Icon name="task" size={20} />
            </>
          )}
        </div>
      )}
      <div
        {...handlers}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        className="relative flex touch-pan-y items-center gap-3 bg-surface px-4 py-2.5 transition-transform duration-(--dur-fast)"
      >
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control text-left"
          >
            {children}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        )}
        {trailing}
      </div>
    </li>
  );
}

/** Dòng hàng đợi Hôm nay: Avatar · tên · hành động + lý do · DeadlineTag · Gọi/Zalo. */
export function QueueRow({
  name,
  action,
  reason,
  deadline,
  time,
  onOpen,
  onCall,
  onZalo,
  onSwipeLeft,
  swipeLeftLabel,
}: {
  name: string;
  /** Việc cần làm, vd "Gọi lại lần 2". */
  action: string;
  /** Lý do ngắn từ dữ liệu, vd "Khách hẹn chiều nay". */
  reason?: string;
  deadline?: Countdown | null;
  time?: string;
  onOpen?: () => void;
  onSwipeLeft?: () => void;
  swipeLeftLabel?: string;
} & QuickActions) {
  return (
    <RowShell
      onOpen={onOpen}
      onSwipeLeft={onSwipeLeft}
      onSwipeRight={onCall}
      swipeLeftLabel={swipeLeftLabel}
      trailing={<RowActions name={name} onCall={onCall} onZalo={onZalo} />}
    >
      <Avatar name={name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-strong" title={name}>
          {name}
        </span>
        <span className="truncate text-small text-text-2">
          {action}
          {reason && <span className="text-text-3"> · {reason}</span>}
        </span>
      </span>
      {(deadline || time) && <DeadlineTag tag={deadline ?? { state: 'far', text: '' }} time={time} />}
    </RowShell>
  );
}

/** Dòng danh sách khách: như QueueRow, deadline tuỳ chọn, có HealthDot + StageChip. Không bọc card. */
export function ListRow({
  name,
  stage,
  stageLabel,
  health,
  meta,
  deadline,
  time,
  onOpen,
  onCall,
  onZalo,
}: {
  name: string;
  stage?: string;
  stageLabel?: string;
  health?: Health;
  /** Dòng phụ: dự án, lần liên hệ cuối… */
  meta?: string;
  deadline?: Countdown | null;
  time?: string;
  onOpen?: () => void;
} & QuickActions) {
  return (
    <RowShell
      onOpen={onOpen}
      onSwipeRight={onCall}
      trailing={<RowActions name={name} onCall={onCall} onZalo={onZalo} />}
    >
      <Avatar name={name} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          {health && <HealthDot health={health} />}
          <span className="truncate text-body-strong" title={name}>
            {name}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {stage && <StageChip stage={stage} label={stageLabel} />}
          {meta && <span className="truncate text-small text-text-2">{meta}</span>}
        </span>
      </span>
      {(deadline || time) && <DeadlineTag tag={deadline ?? { state: 'far', text: '' }} time={time} />}
    </RowShell>
  );
}

/** Danh sách dòng: divider giữa các dòng, không card lồng card. */
export function RowList({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <ul aria-label={label} className={cn('divide-y divide-border', className)}>
      {children}
    </ul>
  );
}
