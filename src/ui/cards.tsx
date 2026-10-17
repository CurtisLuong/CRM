import { Clock3, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { IconName } from '@/config/icons';
import { Badge } from './Badge';
import { Button } from './Button';
import { cn } from './cn';
import { Icon } from './Icon';
import { Skeleton } from './states';
import { type Countdown, DeadlineTag } from './status';

const CARD = 'rounded-card border border-border bg-surface shadow-e1';

export type CardAction = { label: string; onClick: () => void; icon?: IconName };

/**
 * NBA — một card duy nhất mỗi màn. Eyebrow lý do → tên khách → hành động + hạn → bằng chứng (chips)
 * → Brief rút gọn → CTA chính + 2 phụ. Không tô đỏ; chỉ DeadlineTag mang màu.
 */
export function NextActionCard({
  reason,
  name,
  action,
  deadline,
  time,
  evidence = [],
  brief,
  primary,
  secondary = [],
  className,
}: {
  reason: string;
  name: string;
  action: string;
  deadline?: Countdown | null;
  time?: string;
  evidence?: string[];
  brief?: ReactNode;
  primary: CardAction;
  secondary?: CardAction[];
  className?: string;
}) {
  return (
    <section aria-label={`Việc tiếp theo: ${name}`} className={cn(CARD, 'flex flex-col gap-3 p-4', className)}>
      <p className="text-label text-text-2">{reason}</p>
      <div className="flex flex-col gap-1">
        <h2 className="truncate text-title lg:text-display" title={name}>
          {name}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body">{action}</span>
          <DeadlineTag tag={deadline ?? null} time={deadline ? time : undefined} />
          {!deadline && time && <span className="font-data text-mono-data text-text-2">{time}</span>}
        </div>
      </div>
      {evidence.length > 0 && (
        <ul aria-label="Bằng chứng" className="flex flex-wrap gap-1.5">
          {evidence.map((e) => (
            <li key={e}>
              <Badge>{e}</Badge>
            </li>
          ))}
        </ul>
      )}
      {brief && <div className="rounded-control bg-surface-2 p-3 text-small text-text-2">{brief}</div>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" icon={primary.icon} onClick={primary.onClick} className="sm:flex-1">
          {primary.label}
        </Button>
        {secondary.slice(0, 2).map((a) => (
          <Button key={a.label} icon={a.icon} onClick={a.onClick} className="sm:flex-1">
            {a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Tín hiệu rule: icon khái niệm + tiêu đề + "Vì sao" (số liệu có n) + CTA + Ẩn/Hoãn. KHÔNG dùng màu AI. */
export function SignalCard({
  icon,
  title,
  why,
  cta,
  onSnooze,
  onDismiss,
  className,
}: {
  icon: IconName;
  title: string;
  why: string;
  cta: CardAction;
  onSnooze?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn(CARD, 'flex flex-col gap-3 p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-2">
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-body-strong">{title}</h3>
          <p className="text-small text-text-2">
            <span className="text-text-3">Vì sao: </span>
            {why}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Ẩn tín hiệu"
            className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-2 hover:bg-surface-2"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" icon={cta.icon} onClick={cta.onClick} className="flex-1">
          {cta.label}
        </Button>
        {onSnooze && (
          <Button variant="ghost" onClick={onSnooze}>
            Hoãn
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * Gợi ý AI: viền trái 2px violet, nhãn "Gợi ý AI" + sparkle, nội dung, nguồn, Dùng/Sửa/Bỏ.
 * AI chỉ đề xuất — "Dùng" phải mở bước duyệt ở feature, không tự ghi.
 */
export function AIBlock({
  source,
  loading,
  onUse,
  onEdit,
  onDiscard,
  children,
  className,
}: {
  /** Nguồn, vd "dựa trên 3 ghi chú gần nhất". */
  source?: string;
  loading?: boolean;
  onUse?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Gợi ý AI"
      aria-busy={loading || undefined}
      className={cn('flex flex-col gap-2 rounded-r-card border-l-2 border-ai bg-surface py-3 pr-4 pl-3', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="ai">Gợi ý AI</Badge>
        {source && <span className="text-label text-text-3">{source}</span>}
      </div>
      {loading ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">AI đang tạo gợi ý</span>
          <Skeleton tone="ai" className="h-4 w-11/12" />
          <Skeleton tone="ai" className="h-4 w-4/5" />
          <Skeleton tone="ai" className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="text-body">{children}</div>
      )}
      {!loading && (onUse || onEdit || onDiscard) && (
        <div className="flex flex-wrap gap-2">
          {onUse && (
            <Button variant="ai" onClick={onUse}>
              Dùng
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" onClick={onEdit}>
              Sửa
            </Button>
          )}
          {onDiscard && (
            <Button variant="ghost" onClick={onDiscard}>
              Bỏ
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export type BriefItem = { label: string; value?: string | null; ask?: string };

/** Lưới 2 cột nhãn/giá trị. Thiếu giá trị: "Chưa biết" (text-3) + gợi ý câu hỏi. */
export function BriefCard({
  title = 'Brief',
  items,
  className,
}: {
  title?: string;
  items: BriefItem[];
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn(CARD, 'p-4', className)}>
      <h3 className="mb-2 text-section">{title}</h3>
      <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-2">
        {items.map((i) => (
          <div key={i.label} className="contents">
            <dt className="text-label text-text-2">{i.label}</dt>
            <dd className="min-w-0 text-small">
              {i.value ? (
                i.value
              ) : (
                <span className="flex flex-col">
                  <span className="text-text-3">Chưa biết</span>
                  {i.ask && <span className="text-text-2">Hỏi: “{i.ask}”</span>}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Một dữ kiện: nhãn · giá trị · nguồn/độ mới · sửa inline. Cũ > 90 ngày: đồng hồ + "Cần xác nhận". */
export function FactRow({
  label,
  value,
  source,
  stale,
  onEdit,
}: {
  label: string;
  value?: string | null;
  /** Nguồn + độ mới, vd "Sale · 12/10", "AI đã duyệt · 3 ngày". */
  source?: string;
  /** Dữ liệu cũ hơn 90 ngày (tính ở domain). */
  stale?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-label text-text-2">{label}</div>
        <div className={cn('text-body', !value && 'text-text-3')}>{value || 'Chưa biết'}</div>
        {(source || stale) && (
          <div className="flex flex-wrap items-center gap-2 text-label text-text-3">
            {source && <span>{source}</span>}
            {stale && (
              <span className="inline-flex items-center gap-1 text-warning">
                <Clock3 size={16} strokeWidth={1.75} aria-hidden />
                Cần xác nhận
              </span>
            )}
          </div>
        )}
      </div>
      {onEdit && (
        <Button variant="ghost" onClick={onEdit} aria-label={`Sửa ${label}`} className="shrink-0">
          Sửa
        </Button>
      )}
    </div>
  );
}

export type TimelineEntry = {
  id: string;
  icon: IconName;
  title: string;
  /** Giờ hiển thị, vd "14:30". */
  time: string;
  body?: string;
  /** Mốc tự động: nhãn nguồn, vd "Tự động · SLA", "AI". */
  auto?: string;
};
export type TimelineDay = { day: string; entries: TimelineEntry[] };

/** Dòng thời gian hợp nhất, nhóm theo ngày; icon khái niệm theo loại; mốc tự động có nhãn nguồn. */
export function Timeline({ days, className }: { days: TimelineDay[]; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {days.map((d) => (
        <section key={d.day} aria-label={d.day}>
          <h4 className="mb-2 text-label text-text-2">{d.day}</h4>
          <ol className="flex flex-col">
            {d.entries.map((e, i) => (
              <li key={e.id} className="relative flex gap-3 pb-3">
                {i < d.entries.length - 1 && (
                  <span className="absolute top-9 bottom-0 left-[17px] w-px bg-border" aria-hidden />
                )}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-2">
                  <Icon name={e.icon} size={16} />
                </span>
                <div className="min-w-0 flex-1 pt-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-body-strong">{e.title}</span>
                    <span className="font-data text-mono-data text-text-2">{e.time}</span>
                    {e.auto && <Badge variant={e.auto.startsWith('AI') ? 'ai' : 'neutral'}>{e.auto}</Badge>}
                  </div>
                  {e.body && <p className="text-small whitespace-pre-line text-text-2">{e.body}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
