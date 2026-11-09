import { Check, ChevronDown, Pencil, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  ACTION_BY_ID,
  type ActionId,
  fmtLimit,
  fmtWhen,
  hoursBetween,
  type Level,
  type Stage,
  slaFor,
  stageDef,
} from '@/lib/crm';
import { cn } from '@/lib/utils';
import { ActionIcon } from './actions';
import { Glyph } from './signal';

export interface TimelineAction {
  action: ActionId;
  at: Date | string;
  title?: React.ReactNode;
  /** "Nghe máy · 4 phút", "Không nghe máy" */
  outcome?: string;
  /** ok reached/done · soon scheduled · alert missed/failed */
  level?: Level;
  note?: React.ReactNode;
  by?: string;
}
export interface TimelineStageGroup {
  stage: Stage;
  start: Date | string;
  /** When the next stage began; omit for the stage in progress. */
  end?: Date | string;
  /** Màn tự vẽ thời gian ở bậc bên ngoài kit (tab Dòng thời gian) → không lặp lại. */
  hideDuration?: boolean;
  items?: TimelineAction[];
}

const OUT: Record<Level, string> = {
  ok: 'bg-ok-tint text-ok-text',
  soon: 'bg-soon-tint text-soon-text',
  alert: 'bg-alert-tint text-alert-text',
};
const ICO: Record<Level, string> = { ok: 'text-ok-text', soon: 'text-soon-text', alert: 'text-alert-text' };
const DUR: Record<Level, string> = {
  ok: 'bg-ok-tint text-ok-text',
  soon: 'bg-soon-tint text-soon-text',
  alert: 'bg-alert-tint text-alert-text',
};

/** Định dạng thời gian ở một nhóm bậc; bỏ phần lẻ nhỏ hơn đơn vị đang hiển thị. */
export function formatStageDuration(start: Date | string, end: Date | string | undefined, now: Date): string {
  const minutes = Math.max(1, Math.floor((new Date(end ?? now).getTime() - new Date(start).getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const rest = minutes % 60;
  const text = days
    ? `${days} ngày${hours ? ` ${hours} giờ` : ''}`
    : hours
      ? `${hours} giờ${rest ? ` ${rest} phút` : ''}`
      : `${rest} phút`;
  return `${text}${end == null ? ' · đang ở' : ''}`;
}

/** Bút nhỏ trên dòng lịch sử, giữ vùng chạm đủ rộng. Quyền do màn truyền vào. */
export function TimelineEditButton(props: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      data-timeline-edit=""
      className="text-ink-muted [&_svg]:size-3.5"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Pencil />
    </Button>
  );
}

function Step({ item, now }: { item: TimelineAction; now: Date }) {
  const a = ACTION_BY_ID[item.action];
  return (
    <li className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-2.5 pb-3 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:bottom-0.5 [&:not(:last-child)]:before:left-[11px] [&:not(:last-child)]:before:top-[26px] [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-line">
      <span
        className={cn(
          'grid size-6 place-items-center rounded-full border border-line bg-surface-200 text-ink-muted',
          item.level && ICO[item.level],
        )}
      >
        <ActionIcon action={item.action} size={14} />
      </span>
      <div className="flex min-w-0 flex-col gap-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 break-words text-sm font-medium leading-5">{item.title ?? a.label}</span>
          <time className="shrink-0 font-mono text-xs text-ink-muted" dateTime={new Date(item.at).toISOString()}>
            {fmtWhen(item.at, now)}
          </time>
        </div>
        {item.outcome && (
          <span
            className={cn(
              'self-start rounded-sm bg-surface-200 px-2 text-xs font-medium leading-[18px]',
              item.level && OUT[item.level],
            )}
          >
            {item.outcome}
          </span>
        )}
        {item.note && (
          <div className="m-0 whitespace-pre-line break-words rounded-sm border border-line bg-surface-0 px-3 py-2 text-sm font-medium">
            {item.note}
          </div>
        )}
        {item.by && <span className="text-xs text-ink-muted">{item.by}</span>}
      </div>
    </li>
  );
}

function StageBlock({
  group,
  now,
  order,
  defaultOpen,
  last,
}: {
  group: TimelineStageGroup;
  now: Date;
  order: 'asc' | 'desc';
  defaultOpen: boolean;
  last: boolean;
}) {
  const st = stageDef(group.stage);
  const [open, setOpen] = React.useState(defaultOpen);
  const end = group.end ? new Date(group.end) : null;
  const live = !end && !st.end;
  const hours = hoursBetween(group.start, end ?? now);
  const sla = st.sla ? slaFor(group.stage, hours) : null;
  const items = [...(group.items ?? [])].sort(
    (a, b) => (new Date(b.at).getTime() - new Date(a.at).getTime()) * (order === 'asc' ? -1 : 1),
  );
  const mark =
    st.end === 'won' ? (
      <Check className="size-3.5" strokeWidth={3} />
    ) : st.end === 'lost' ? (
      <X className="size-3.5" strokeWidth={3} />
    ) : st.branch ? (
      `${st.step}b`
    ) : (
      st.step
    );
  return (
    <li className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-5">
      {!last && (
        <span
          aria-hidden
          className={cn('absolute bottom-0.5 left-[15px] top-[34px] w-0.5', live ? 'bg-ion' : 'bg-line')}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative z-[1] grid size-8 place-items-center rounded-full border-2 border-line font-mono text-xs font-semibold',
          live
            ? 'border-ion bg-surface-100 text-ion shadow-glow-ion'
            : st.end
              ? 'border-ion bg-ion text-on-ion'
              : 'bg-surface-200 text-ink',
        )}
      >
        {mark}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-7 w-full cursor-pointer items-center gap-2 text-left text-ink"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold leading-5">
            <span data-stage-title="" className={cn(live && 'text-ion')}>
              {st.label}
            </span>
          </span>
          {!st.end && sla?.level && (
            <span
              title={`${sla.word} · SLA ${fmtLimit(sla.ideal!)} / ${fmtLimit(sla.max!)}`}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-surface-200 px-2 py-0.5 font-mono text-[13px] font-semibold tabular-nums',
                live && DUR[sla.level],
              )}
            >
              <Glyph level={sla.level} pulse={live} />
              {sla.word}
            </span>
          )}
          <ChevronDown className={cn('size-4 shrink-0 text-ink-muted transition-transform', !open && '-rotate-90')} />
        </button>
        {!group.hideDuration && (
          <span data-stage-duration="" className="text-caption text-ink-muted">
            {formatStageDuration(group.start, group.end, now)}
          </span>
        )}
        <span className="font-mono text-xs text-ink-muted">
          {fmtWhen(group.start, now)}
          {!st.end && ` → ${end ? fmtWhen(end, now) : 'nay'}`} · {items.length} việc
        </span>
        {open && items.length > 0 && (
          <ol className="mt-2.5 flex list-none flex-col p-0">
            {items.map((it, i) => (
              <Step key={i} item={it} now={now} />
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

/** Customer journey: stages on the outer rail with their duration + SLA state; actions as steps inside with time and note. */
export function Timeline({
  stages,
  now,
  order = 'desc',
  collapsePast,
}: {
  stages: TimelineStageGroup[];
  now?: Date | string;
  order?: 'asc' | 'desc';
  collapsePast?: boolean;
}) {
  const n = new Date(now ?? new Date());
  const groups = [...stages].sort(
    (a, b) => (new Date(b.start).getTime() - new Date(a.start).getTime()) * (order === 'asc' ? -1 : 1),
  );
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {groups.map((g, i) => (
        <StageBlock
          key={g.stage + i}
          group={g}
          now={n}
          order={order}
          defaultOpen={collapsePast ? !g.end : true}
          last={i === groups.length - 1}
        />
      ))}
    </ol>
  );
}
