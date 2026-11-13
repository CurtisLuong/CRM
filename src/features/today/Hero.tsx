import type { Level } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { Icon } from '@/ui/Icon';

// Phần mở đầu trang Hôm nay (Curtis 13/11/2026, theo ảnh mẫu): lời chào + ngày âm, 3 ô mức gấp.
// Hình nền (bình minh, đồi) chỉ để trang trí: aria-hidden, không nhận chạm, không gây cuộn ngang.

const TILE: Record<Level, { icon: string; chip: string; text: string; bg: string; hill: string }> = {
  alert: {
    icon: 'alert',
    chip: 'bg-alert-tint text-alert-text',
    text: 'text-alert-text',
    bg: 'border-alert bg-gradient-to-br from-alert-tint/70 to-surface-100 shadow-glow-alert',
    hill: 'text-alert-tint',
  },
  soon: {
    icon: 'idle',
    chip: 'bg-soon-tint text-soon-text',
    text: 'text-soon-text',
    bg: 'border-line bg-gradient-to-br from-soon-tint/60 to-surface-100',
    hill: 'text-soon-tint',
  },
  ok: {
    icon: 'done',
    chip: 'bg-ok-tint text-ok-text',
    text: 'text-ok-text',
    bg: 'border-line bg-gradient-to-br from-ok-tint/50 to-surface-100',
    hill: 'text-ok-tint',
  },
};

function Hills({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 48"
      aria-hidden
      className={cn('pointer-events-none absolute right-0 bottom-0 h-10 w-36 sm:h-12 sm:w-44', className)}
    >
      <path d="M0 48 C30 30 50 20 80 26 C105 31 120 12 160 18 L160 48 Z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function Sunrise() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-6 sm:size-7" fill="none" stroke="currentColor">
      <g strokeWidth="2" strokeLinecap="round">
        <path d="M9 19a7 7 0 0 1 14 0" />
        <path d="M16 6v3M7.5 9.5l2 2M24.5 9.5l-2 2M4 15h3M25 15h3" />
        <path d="M5 23h22M8 27h16" />
      </g>
    </svg>
  );
}

/** Cảnh bình minh mờ góc phải phần chào; ẩn ở màn hẹp để chữ không bị đè. */
function Landscape() {
  return (
    <svg
      viewBox="0 0 320 90"
      aria-hidden
      className="pointer-events-none absolute top-0 right-0 hidden h-24 w-80 opacity-60 sm:block dark:opacity-30"
    >
      <defs>
        <radialGradient id="today-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="235" cy="48" r="38" fill="url(#today-sun)" />
      <circle cx="235" cy="50" r="13" fill="#fef3c7" />
      <path d="M40 90 L110 52 L150 66 L200 40 L250 62 L290 46 L320 58 L320 90 Z" fill="#e9c6d3" opacity="0.7" />
      <path d="M90 90 L160 64 L210 72 L260 58 L320 72 L320 90 Z" fill="#d8b4c8" opacity="0.6" />
    </svg>
  );
}

export function TodayHero({
  greeting,
  dateLine,
  counts,
}: {
  greeting: string;
  dateLine: string;
  counts: Record<Level, number>;
}) {
  // Tên in đậm như ảnh mẫu: "Chào buổi chiều, **Curtis**".
  const comma = greeting.indexOf(', ');
  const tiles: { level: Level; label: string }[] = [
    { level: 'alert', label: 'Quá hạn' },
    { level: 'soon', label: 'Đến giờ hôm nay' },
    { level: 'ok', label: 'Đúng hẹn' },
  ];
  return (
    <>
      <section aria-label="Lời chào và ngày" className="relative mb-3 flex items-center gap-3 overflow-hidden py-2">
        <Landscape />
        <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-alert-tint text-alert-text shadow-sm sm:size-14">
          <Sunrise />
        </span>
        <span aria-hidden className="relative hidden h-10 w-px bg-line sm:block" />
        <div className="relative min-w-0">
          <h2 className="text-lg font-medium leading-tight sm:text-2xl">
            {comma < 0 ? (
              greeting
            ) : (
              <>
                {greeting.slice(0, comma + 2)}
                <span className="font-bold">{greeting.slice(comma + 2)}</span>
              </>
            )}
          </h2>
          <p className="mt-0.5 text-caption text-ink-muted sm:text-body">{dateLine}</p>
        </div>
      </section>
      <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Tổng quan mức gấp">
        {tiles.map(({ level, label }) => {
          const style = TILE[level];
          return (
            <div
              key={level}
              className={cn(
                'relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl border p-2 sm:gap-2 sm:p-4',
                style.bg,
              )}
            >
              <Hills className={style.hill} />
              <span className="relative flex min-h-8 items-center gap-1.5 text-xs font-semibold leading-4 sm:gap-2 sm:text-sm">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-md sm:size-8', style.chip)}>
                  <Icon name={style.icon} size={16} className="size-3.5 sm:size-4" />
                </span>
                {label}
              </span>
              <span className={cn('relative text-title font-bold tabular-nums sm:text-display', style.text)}>
                {counts[level]}
              </span>
            </div>
          );
        })}
      </section>
    </>
  );
}
