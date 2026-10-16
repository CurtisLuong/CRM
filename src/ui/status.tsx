import { STAGE_ICON, STAGE_ICON_FALLBACK } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';

/**
 * Kết quả `countdownTag` (D-010, nguồn: src/domain/deadlines). UI KHÔNG tự tính trạng thái — chỉ hiển thị.
 * far = chưa đến hạn · soon = sắp đến hạn · due = đến hạn · missed = quá hạn · done = đã xong.
 */
export type DeadlineState = 'far' | 'soon' | 'due' | 'missed' | 'done';
export type Countdown = { state: DeadlineState; text: string };

const DEADLINE: Record<DeadlineState, { cls: string; prefix?: string }> = {
  far: { cls: 'bg-surface-2 text-text-2' },
  soon: { cls: 'bg-warning-bg text-warning' },
  due: { cls: 'bg-warning-bg text-warning font-semibold', prefix: 'Đến hạn' },
  missed: { cls: 'bg-danger-bg text-danger font-semibold', prefix: 'Quá hạn' },
  done: { cls: 'bg-success-bg text-success', prefix: 'Xong' },
};

/**
 * Nhãn hạn: chữ + màu semantic, giờ bằng mono. `time` (vd "14:30") hiển thị mono, không bị cắt.
 * Chữ trạng thái ("Đến hạn"/"Quá hạn") luôn có — màu không phải tín hiệu duy nhất.
 */
export function DeadlineTag({ tag, time, className }: { tag: Countdown | null; time?: string; className?: string }) {
  if (!tag) return null;
  const d = DEADLINE[tag.state];
  const text = tag.text.trim();
  const showText = text && !(d.prefix && text.toLowerCase() === d.prefix.toLowerCase());
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-label',
        d.cls,
        className,
      )}
      data-state={tag.state}
    >
      {d.prefix && <span>{d.prefix}</span>}
      {d.prefix && (showText || time) && <span aria-hidden>·</span>}
      {showText && <span>{text}</span>}
      {showText && time && <span aria-hidden>·</span>}
      {time && <span className="font-data">{time}</span>}
    </span>
  );
}

/** Vòng SLA: `value` = thời gian đã ở bậc / hạn mức (1 = chạm hạn mức), `target` = mốc mục tiêu (0–1). */
export function SlaRing({
  value,
  target,
  size = 20,
  label,
  className,
}: {
  value: number;
  target?: number;
  size?: number;
  /** Mô tả cho screen reader, vd "Đã 3/5 ngày ở bậc". */
  label: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  const tone = value >= 1 ? 'text-danger' : target !== undefined && value > target ? 'text-warning' : 'text-text-3';
  const r = 8;
  const c = 2 * Math.PI * r;
  const t = target === undefined ? null : Math.max(0, Math.min(1, target));
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn('shrink-0 -rotate-90', tone, className)}
    >
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${v * c} ${c}`}
      />
      {t !== null && (
        <line
          x1={10 + (r - 3) * Math.cos(t * 2 * Math.PI)}
          y1={10 + (r - 3) * Math.sin(t * 2 * Math.PI)}
          x2={10 + (r + 3) * Math.cos(t * 2 * Math.PI)}
          y2={10 + (r + 3) * Math.sin(t * 2 * Math.PI)}
          stroke="var(--text-2)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

/** Chip bậc phễu: trung tính + icon bậc (STAGE_ICON) + vòng SLA mini tuỳ chọn. Không gán màu riêng cho bậc. */
export function StageChip({
  stage,
  label,
  sla,
  className,
}: {
  /** Giá trị lưu care_stage (để chọn icon). */
  stage: string;
  /** Nhãn hiển thị (mặc định = stage). */
  label?: string;
  sla?: { value: number; target?: number; label: string };
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 text-label text-text-2',
        className,
      )}
    >
      <Icon name={STAGE_ICON[stage] ?? STAGE_ICON_FALLBACK} size={16} />
      <span className="truncate">{label ?? stage}</span>
      {sla && <SlaRing value={sla.value} target={sla.target} label={sla.label} size={16} />}
    </span>
  );
}

export type Health = 'ok' | 'late' | 'risk' | 'unknown';

const HEALTH: Record<Health, { cls: string; text: string }> = {
  ok: { cls: 'bg-success', text: 'Đúng nhịp' },
  late: { cls: 'bg-warning', text: 'Đang trễ' },
  risk: { cls: 'bg-danger', text: 'Nguy cơ' },
  unknown: { cls: 'border border-border-strong', text: 'Chưa đủ dữ liệu' },
};

/** Chấm 8px sức khoẻ chăm sóc; chữ ẩn cho screen reader (hoặc hiện khi `showText`). */
export function HealthDot({ health, showText, className }: { health: Health; showText?: boolean; className?: string }) {
  const h = HEALTH[health];
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-small text-text-2', className)} title={h.text}>
      <span className={cn('size-2 rounded-full', h.cls)} aria-hidden />
      <span className={showText ? undefined : 'sr-only'}>{h.text}</span>
    </span>
  );
}
