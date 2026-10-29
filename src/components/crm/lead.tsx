import type { Level, Stage } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { Avatar } from './actions';
import { Glyph, SignalBadge } from './signal';
import { StageChip } from './stage';

/** One customer in a list: who, which stage, and how urgent the next step is. Stage and signal are separate. */
export function LeadRow({
  name,
  phone,
  project,
  unit,
  stage,
  level,
  time,
  nextStep,
  selected,
  onClick,
}: {
  name: string;
  phone?: string;
  project?: string;
  unit?: string;
  stage?: Stage;
  level?: Level;
  time?: string;
  nextStep?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected || undefined}
      className={cn(
        'flex min-h-16 w-full cursor-pointer items-center gap-3 border-b border-line bg-surface-100 px-4 py-2 text-left last:border-b-0 hover:bg-surface-200',
        selected && 'bg-ion-tint hover:bg-ion-tint',
      )}
    >
      <Avatar name={name} />
      {/* Tên một dòng riêng: ở 360px nhãn bậc đứng cạnh tên sẽ ép tên còn "C." (R2 review). */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-[22px]">{name}</span>
          {level && (
            <span className="shrink-0">
              <SignalBadge level={level}>{time}</SignalBadge>
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {stage && <StageChip stage={stage} className="shrink-0" />}
          <span className="min-w-0 truncate text-caption text-ink-muted">
            {[phone, project, unit].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      {nextStep && <span className="shrink-0 text-caption text-ink-muted">{nextStep}</span>}
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
