import type { Level, Stage } from '@/lib/crm';
import type { CustomerNeed } from '@/lib/crm/customer-need';
import { cn } from '@/lib/utils';
import { Avatar } from './actions';
import { Glyph, SignalBadge } from './signal';
import { StageChip } from './stage';

function NeedText({ need }: { need: CustomerNeed }) {
  const missingAptType = need.aptType.startsWith('Chưa rõ');
  const missingProject = need.project.startsWith('Chưa rõ');
  return (
    <span
      data-testid="customer-need-line"
      title={need.title ?? `${need.aptType} · ${need.project}`}
      className="flex min-w-0 overflow-hidden whitespace-nowrap text-caption text-ink-muted"
    >
      <span
        className={cn(
          'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
          missingAptType ? 'shrink-[1000] text-ink-muted/70' : 'shrink-[0.01]',
        )}
      >
        {need.aptType}
      </span>
      {' · '}
      <span
        className={cn(
          'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
          missingProject ? 'shrink-[100] text-ink-muted/70' : 'shrink-[10]',
        )}
      >
        {need.project}
      </span>
    </span>
  );
}

/** One customer in a list: who, which stage, and how urgent the next step is. Stage and signal are separate. */
export function LeadRow({
  name,
  phone,
  project,
  unit,
  stage,
  level,
  time,
  lastTouch,
  nextStep,
  selected,
  onClick,
  need,
  hidePhone = false,
}: {
  name: string;
  phone?: string;
  project?: string;
  unit?: string;
  stage?: Stage;
  level?: Level;
  time?: string;
  lastTouch?: string;
  nextStep?: string;
  selected?: boolean;
  onClick?: () => void;
  need?: CustomerNeed;
  hidePhone?: boolean;
}) {
  const rowClass = cn(
    'flex min-h-16 w-full items-center gap-3 border-b border-line bg-surface-100 px-4 py-2 text-left last:border-b-0',
    !hidePhone && 'cursor-pointer hover:bg-surface-200',
    selected && 'bg-ion-tint hover:bg-ion-tint',
  );
  const content = (
    <>
      <Avatar name={name} />
      {/* Tên một dòng riêng: ở 360px nhãn bậc đứng cạnh tên sẽ ép tên còn "C." (R2 review). */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          {/* Tên được ưu tiên đủ chữ; nhãn hạn / lần chạm co lại thành "…" khi thiếu chỗ (Curtis 31/10). */}
          <span className="min-w-0 max-w-full shrink-0 truncate text-[15px] font-semibold leading-[22px]">{name}</span>
          {level && (
            // Nhãn hạn giữ tối thiểu ▲ + "…" để vẫn thấy khách gấp khi tên dài.
            <span className="flex min-w-11 shrink">
              <SignalBadge level={level} className="max-w-full">
                {time}
              </SignalBadge>
            </span>
          )}
          {lastTouch && <span className="min-w-0 truncate text-caption font-normal text-ink-muted">{lastTouch}</span>}
          {!level && time && <span className="min-w-0 truncate text-caption font-normal text-ink-muted">{time}</span>}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {stage && <StageChip stage={stage} compactOnMobile={hidePhone} className="shrink-0" />}
          {need ? (
            <NeedText need={need} />
          ) : (
            <span className="min-w-0 truncate text-caption text-ink-muted">
              {[hidePhone ? undefined : phone, project, unit].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        {need && !hidePhone && phone && (
          <span className="font-mono text-caption leading-4 text-ink-muted">{phone}</span>
        )}
      </span>
      {nextStep && <span className="shrink-0 text-caption text-ink-muted">{nextStep}</span>}
    </>
  );
  if (hidePhone) return <div className={rowClass}>{content}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={selected || undefined} className={rowClass}>
      {content}
    </button>
  );
}

/** Deal card on the stage board. The column says the stage; the badge says the urgency. Overdue cards glow. */
export function PipelineCard({
  name,
  unit,
  price,
  level,
  time,
  onClick,
}: {
  name: string;
  unit?: string;
  price?: string;
  level?: Level;
  time?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-grab flex-col gap-2 rounded-md border border-line bg-surface-100 p-3 text-left hover:border-ion',
        level === 'alert' && 'border-alert shadow-glow-alert hover:border-alert',
      )}
    >
      <span className="text-sm font-semibold">{name}</span>
      {unit && <span className="text-caption text-ink-muted">{unit}</span>}
      <span className="flex items-center justify-between gap-2">
        {price ? <span className="text-numeric">{price}</span> : <span />}
        {level && <SignalBadge level={level}>{time}</SignalBadge>}
      </span>
    </button>
  );
}

/** Signal counter for the top of a screen (alert / soon / ok); without a level it is a neutral KPI. */
export function StatTile({
  label,
  value,
  delta,
  level,
  onClick,
  compact,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  level?: Level;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const TEXT: Record<Level, string> = { ok: 'text-ok-text', soon: 'text-soon-text', alert: 'text-alert-text' };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-44 cursor-pointer flex-col gap-1 rounded-lg border border-line bg-surface-100 p-4 text-left',
        compact && 'min-w-0 gap-0.5 p-2 sm:gap-1 sm:p-4',
        level === 'alert' && 'border-alert shadow-glow-alert',
        className,
      )}
    >
      <span className="flex min-h-8 items-center gap-1.5 text-overline leading-4">
        {level && <Glyph level={level} />}
        {label}
      </span>
      <span
        className={cn(compact ? 'text-title sm:text-display' : 'text-display', 'tabular-nums', level && TEXT[level])}
      >
        {value}
      </span>
      {delta && <span className="text-caption text-ink-muted">{delta}</span>}
    </button>
  );
}
