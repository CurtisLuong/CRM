/**
 * Thẻ khách + khối đi kèm — DESIGN_SYSTEM v4 "Precision Tonal" §1, §3 (D-023).
 * Cấp 1 = tên + MỘT nút hành động; cấp 2 = lưới nhãn/giá trị; cấp 3 = ghi chú cuối + SlaBar.
 * Component chỉ trình bày: mọi giá trị (nhãn, giờ, trạng thái SLA) do màn truyền vào từ domain/config.
 */
import type { ReactNode } from 'react';
import type { IconName } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';

/** Màu vạch trái theo thời hạn: over = quá hạn (đỏ), soon = sắp/đang trễ (vàng). */
export type CardTone = 'over' | 'soon';
export type SlaBarState = 'ok' | 'warn' | 'over';

export type CustomerCardAction = {
  /** Chữ trên nút (thẻ đầy đủ) — cũng là phần đầu aria-label. */
  label: string;
  icon: IconName;
  onClick: () => void;
  /** Mặc định `${label} ${name}`. */
  ariaLabel?: string;
  disabled?: boolean;
};

export type CardFact = { label: string; value: ReactNode };

export type SlaBarProps = {
  /** Nhãn trái, vd. tên bậc. */
  label: string;
  state: SlaBarState;
  /** 0..1 = phần thời gian hạn mức đã dùng. */
  ratio: number;
  /** Chữ đậm bên phải, vd. "mục tiêu còn 2 ngày". */
  text: string;
  className?: string;
};

const SEGMENTS = 7;

/** Thanh SLA 7 đoạn: đơn sắc khi đúng hạn, vàng khi quá mục tiêu, đỏ khi quá hạn mức. */
export function SlaBar({ label, state, ratio, text, className }: SlaBarProps) {
  const filled = Math.max(state === 'ok' ? 0 : 1, Math.min(SEGMENTS, Math.round(ratio * SEGMENTS)));
  const fill = state === 'over' ? 'bg-danger' : state === 'warn' ? 'bg-warning' : 'bg-bar';
  return (
    <div className={cn('flex items-center gap-2 text-small text-text-2', className)}>
      <span className="shrink-0">{label}</span>
      <span aria-hidden className="grid min-w-[84px] flex-1 grid-cols-7 gap-[3px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: đoạn cố định, không đổi thứ tự
          <i key={i} className={cn('h-1.5 rounded-[2px]', i < filled ? fill : 'bg-track')} />
        ))}
      </span>
      <b className={cn('min-w-0 truncate font-semibold text-text', state === 'over' && 'text-danger')}>{text}</b>
    </div>
  );
}

export type CustomerCardProps = {
  name: string;
  /** Dòng ngay dưới tên: thời hạn/trạng thái ĐỨNG ĐẦU để không bị cắt. */
  sub?: ReactNode;
  tone?: CardTone;
  /** Đúng MỘT hành động hiện ra (D-023 L2). */
  action?: CustomerCardAction;
  /** Chạm thẻ (ngoài nút) → mở khách. */
  onOpen?: () => void;
  openLabel?: string;
  /** Thẻ gọn: tên + 1 dòng + nút icon 44px. */
  compact?: boolean;
  facts?: CardFact[];
  note?: string;
  sla?: SlaBarProps;
  selected?: boolean;
  className?: string;
};

/** Thẻ khách v4 — mỗi khách một thẻ, vạch trái mang màu thời hạn. */
export function CustomerCard({
  name,
  sub,
  tone,
  action,
  onOpen,
  openLabel,
  compact,
  facts,
  note,
  sla,
  selected,
  className,
}: CustomerCardProps) {
  const shownFacts = (facts ?? []).filter((f) => f.value !== '' && f.value != null);
  return (
    <article
      data-card
      data-tone={tone}
      className={cn(
        'relative overflow-hidden border bg-surface shadow-e1',
        compact ? 'rounded-card-sm py-2.5 pr-2.5 pl-4' : 'rounded-card py-3.5 pr-3.5 pb-3 pl-4',
        selected ? 'border-accent ring-1 ring-accent' : 'border-hairline',
        className,
      )}
    >
      {tone && (
        <span
          aria-hidden
          className={cn(
            'absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-r-[3px]',
            tone === 'over' ? 'bg-danger' : 'bg-warning',
          )}
        />
      )}
      <div className={cn('flex gap-3', compact ? 'items-center' : 'items-start')}>
        <div className="min-w-0 flex-1">
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label={openLabel ?? `Mở ${name}`}
              className="block max-w-full truncate text-left font-bold tracking-[-0.01em] text-text after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-focus"
            >
              <span className={compact ? 'text-[16px] leading-[22px]' : 'text-[18px] leading-6'}>{name}</span>
            </button>
          ) : (
            <h3
              className={cn(
                'truncate font-bold tracking-[-0.01em]',
                compact ? 'text-[16px] leading-[22px]' : 'text-[18px] leading-6',
              )}
            >
              {name}
            </h3>
          )}
          {sub && <div className="mt-0.5 truncate text-small text-text-2">{sub}</div>}
        </div>
        {action && <CardActionButton action={action} name={name} compact={compact} />}
      </div>
      {!compact && shownFacts.length > 0 && (
        <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 border-hairline border-t pt-2.5">
          {shownFacts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11.5px] leading-4 font-medium text-text-3">{f.label}</dt>
              <dd className="truncate text-[13.5px] leading-[19px] font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!compact && note && <p className="mt-2 truncate text-[13.5px] leading-[19px] text-text-2">“{note}”</p>}
      {!compact && sla && <SlaBar {...sla} className="mt-2.5" />}
    </article>
  );
}

function CardActionButton({ action, name, compact }: { action: CustomerCardAction; name: string; compact?: boolean }) {
  const label = action.ariaLabel ?? `${action.label} ${name}`;
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={label}
      title={compact ? label : undefined}
      className={cn(
        'relative z-10 inline-flex shrink-0 items-center justify-center gap-1.5 font-semibold transition-[filter] duration-(--dur-fast) disabled:opacity-50',
        compact
          ? 'size-11 rounded-control bg-accent-tonal text-accent hover:brightness-95'
          : 'h-12 rounded-control bg-accent px-[18px] text-accent-fg hover:brightness-110',
      )}
    >
      <Icon name={action.icon} size={20} />
      {!compact && <span>{action.label}</span>}
    </button>
  );
}

/** Tiêu đề nhóm thẻ: "Quá giờ hẹn gọi 3". Nhóm rỗng → màn không render nhóm. */
export function CardGroup({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-3.5', className)} aria-label={title}>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-small font-semibold text-text-2">{title}</h2>
        {count != null && <span className="text-label text-text-3 tabular-nums">{count}</span>}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/** Dải "Gọi lần lượt N khách" — một dải duy nhất trên Hôm nay. */
export function SessionBar({
  title,
  sub,
  actionLabel = 'Bắt đầu',
  onStart,
  className,
}: {
  title: string;
  sub?: string;
  actionLabel?: string;
  onStart: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-card-sm bg-text py-2.5 pr-2.5 pl-3.5 text-surface', className)}>
      <div className="min-w-0 flex-1">
        <b className="block font-semibold">{title}</b>
        {sub && <span className="block truncate text-small opacity-75">{sub}</span>}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] bg-surface px-3.5 text-[14px] font-semibold text-text"
      >
        <Icon name="start" size={16} />
        {actionLabel}
      </button>
    </div>
  );
}
