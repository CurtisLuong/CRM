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
  /** Icon theo loại mục của màn (ví dụ ghi chú bậc, duyệt AI). */
  icon?: React.ReactNode;
  at: Date | string;
  title?: React.ReactNode;
  /** "Nghe máy · 4 phút", "Không nghe máy" */
  outcome?: string;
  /** ok reached/done · soon scheduled · alert missed/failed */
  level?: Level;
  note?: React.ReactNode;
  by?: string;
  /** Hành động cuối hàng tên, sau giờ; không chiếm chiều cao của hàng. */
  edit?: React.ReactNode;
}
export interface TimelineStageGroup {
  /** Dấu bậc tuỳ biến; mặc định giữ số bước của Hành trình. */
  icon?: React.ReactNode;
  /** Đầu nhóm tuỳ biến cho hồ sơ có sửa tại chỗ. */
  header?: React.ReactNode;
  id?: string;
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
      className="absolute right-0 bottom-0 items-end justify-end pb-0.5 pr-1 text-ink-muted [&_svg]:size-3.5"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Pencil />
    </Button>
  );
}

function Step({ item, now, last, profile }: { item: TimelineAction; now: Date; last: boolean; profile: boolean }) {
  const a = ACTION_BY_ID[item.action];
  return (
    <li className={cn('relative grid grid-cols-[24px_minmax(0,1fr)] pb-3', profile ? 'gap-2' : 'gap-2.5')}>
      {!last && (
        <span
          aria-hidden
          data-timeline-activity-rail=""
          className="absolute bottom-0.5 left-[11px] top-[26px] w-px bg-line"
        />
      )}
      <span
        className={cn(
          'grid size-6 place-items-center rounded-full border border-line bg-surface-200 text-ink-muted',
          item.level && ICO[item.level],
        )}
      >
        {item.icon ?? <ActionIcon action={item.action} size={14} />}
      </span>
      <div className="flex min-w-0 flex-col gap-1 pt-0.5">
        <div
          data-timeline-item-header=""
          className={cn('relative flex items-baseline justify-between gap-2', item.edit && 'pr-11')}
        >
          <span className="min-w-0 break-words text-sm font-medium leading-5">{item.title ?? a.label}</span>
          <time className="shrink-0 font-mono text-xs text-ink-muted" dateTime={new Date(item.at).toISOString()}>
            {fmtWhen(item.at, now)}
          </time>
          {item.edit}
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
          <div
            data-timeline-note=""
            className="m-0 whitespace-pre-line break-words rounded-sm border border-line bg-surface-0 px-3 py-2 text-sm font-medium leading-5"
          >
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
  profile,
}: {
  group: TimelineStageGroup;
  now: Date;
  order: 'asc' | 'desc';
  defaultOpen: boolean;
  last: boolean;
  profile: boolean;
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
    <li
      data-timeline-group={group.id}
      className={cn('relative grid grid-cols-[32px_minmax(0,1fr)] pb-5', profile ? 'gap-2' : 'gap-3')}
    >
      {!last && (
        <span aria-hidden data-timeline-stage-rail="" className="absolute bottom-0 left-[15px] top-8 w-0.5 bg-line" />
      )}
      <span
        aria-hidden
        data-timeline-stage-icon=""
        className={cn(
          'relative z-[1] grid size-8 place-items-center rounded-full border-2 border-line font-mono text-xs font-semibold',
          live
            ? 'border-ion bg-surface-100 text-ion shadow-glow-ion'
            : st.end
              ? 'border-ion bg-ion text-on-ion'
              : 'bg-surface-200 text-ink',
        )}
      >
        {group.icon ?? mark}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        {group.header ?? (
          <>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="flex min-h-8 w-full cursor-pointer items-end gap-2 text-left text-ink"
            >
              <span className="flex min-w-0 flex-1 items-end gap-2 text-sm font-semibold leading-5">
                <span data-stage-title="" className={cn(live && 'text-ion')}>
                  {st.label}
                </span>
              </span>
              {live && sla?.level && (
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
              <ChevronDown
                className={cn('size-4 shrink-0 text-ink-muted transition-transform', !open && '-rotate-90')}
              />
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
          </>
        )}
        {(group.header || open) && items.length > 0 && (
          <ol className="mt-2.5 flex list-none flex-col p-0">
            {items.map((it, i) => (
              <Step key={i} item={it} now={now} last={i === items.length - 1} profile={profile} />
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
  layout = 'journey',
}: {
  stages: TimelineStageGroup[];
  now?: Date | string;
  order?: 'asc' | 'desc';
  collapsePast?: boolean;
  /** Hồ sơ: đầu bậc và icon hoạt động cùng lề, dành thêm chỗ cho nội dung. */
  layout?: 'journey' | 'profile';
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
          profile={layout === 'profile'}
        />
      ))}
    </ol>
  );
}
