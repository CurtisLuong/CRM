import { useState } from 'react';
import { Timeline, type TimelineAction } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { toast as notify } from '@/components/ui/sonner';
import { taskKindOf } from '@/config/taskKinds';
import type { Customer } from '@/domain/customer';
import { cn } from '@/lib/utils';
import { displayDateTime } from '@/ui/display';
import { Icon } from '@/ui/Icon';
import {
  editedTimelineNotePatch,
  type ProfileTimelineEntry,
  showsStageDetail,
  TIMELINE_FILTERS,
  type TimelineFilter,
  type TimelineRow,
  timelineCounts,
  timelineIcon,
  timelineView,
} from './model';

const FIELD =
  'min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion disabled:opacity-60';

type Props = {
  customer: Customer;
  entries: readonly ProfileTimelineEntry[];
  writable: boolean;
  busy: boolean;
  /** Lưu patch theo trường qua route (kiểm quyền + toast); trả false khi chưa lưu được. */
  onSave: (patch: Record<string, unknown>, message?: string) => Promise<boolean>;
};

/**
 * Tab "Dòng thời gian" của hồ sơ: lọc theo loại, sửa ghi chú tay / ghi chú bậc.
 * PF-02: mốc bậc là đầu nhóm sát lề trái; mục trong bậc thụt vào sau đường dọc; mỗi dòng có icon.
 */
export function ProfileTimeline({ customer, entries, writable, busy, onSave }: Props) {
  const toast = (input: { title: string; tone?: 'default' | 'error' }) =>
    notify[input.tone === 'error' ? 'error' : 'info'](input.title);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const counts = timelineCounts(entries);
  const view = timelineView(entries, filter);
  const stageDetail = showsStageDetail(filter);
  const hasArchive = filter === 'all' && entries.some((entry) => entry.kind === 'archive');
  const isEmpty = view.grouped ? view.groups.length === 0 : view.flat.length === 0;

  const startEdit = (entryId: string, value: string) => {
    setDraft(value);
    setEditingId(entryId);
  };
  const saveEdit = async (entryId: string) => {
    if (!writable) return;
    if (draft.length === 0) {
      toast({ title: 'Ghi chú không được để trống', tone: 'error' });
      return;
    }
    const patch = editedTimelineNotePatch(customer, entryId, draft, new Date().toISOString());
    if (patch) {
      const message = entryId.startsWith('stage:') ? 'Đã cập nhật ghi chú lịch sử bậc' : 'Đã cập nhật ghi chú';
      if (!(await onSave(patch, message))) return;
    }
    setEditingId(null);
  };

  const noteEditor = (entry: ProfileTimelineEntry) => (
    <span className="mt-2 flex flex-col gap-2">
      <textarea
        aria-label="Sửa ghi chú"
        value={draft}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        className={`${FIELD} min-h-20 py-2`}
      />
      <span className="flex gap-2">
        <Button variant="primary" disabled={busy || draft.length === 0} onClick={() => void saveEdit(entry.id)}>
          Lưu ghi chú
        </Button>
        <Button disabled={busy} onClick={() => setEditingId(null)}>
          Huỷ
        </Button>
      </span>
    </span>
  );

  const entryDetail = (entry: ProfileTimelineEntry) => {
    if (!entry.detail) return null;
    const editable = entry.kind === 'note' || entry.kind === 'stage';
    if (editable && editingId === entry.id) return noteEditor(entry);
    return (
      <span className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-1 whitespace-pre-wrap text-body text-ink-muted">{entry.detail}</span>
        {writable && editable && (
          <Button
            aria-label={`Sửa ghi chú ${entry.kind === 'stage' ? 'lịch sử bậc' : 'hồ sơ'}`}
            disabled={busy}
            onClick={() => startEdit(entry.id, entry.detail || '')}
          >
            Sửa
          </Button>
        )}
      </span>
    );
  };

  const entryText = (entry: ProfileTimelineEntry, options: { detail: boolean; heading?: boolean }) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {options.heading ? (
          <h3 className="text-title">{entry.title}</h3>
        ) : (
          <span className="text-body-strong">{entry.title}</span>
        )}
        {entry.automatic && (
          <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">Tự động · SLA</span>
        )}
        {entry.kind === 'task' && entry.taskKind && (
          <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">
            {taskKindOf(entry.taskKind).label}
          </span>
        )}
      </div>
      {options.detail ? entryDetail(entry) : null}
      <time className="mt-1 block font-mono text-caption text-ink-muted">{displayDateTime(entry.at)}</time>
    </>
  );

  const flatRow = (row: TimelineRow<ProfileTimelineEntry>) => (
    <article key={row.entry.id} data-timeline-entry="" className="flex items-start gap-2 border-l-2 border-line pl-3">
      <Icon name={row.icon} size={20} className="mt-0.5 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">{entryText(row.entry, { detail: true })}</div>
    </article>
  );

  const kitAction = (entry: ProfileTimelineEntry): TimelineAction => {
    const action =
      entry.kind === 'call'
        ? 'call'
        : entry.kind === 'note'
          ? 'note'
          : entry.kind === 'stage'
            ? 'booking'
            : entry.kind === 'task'
              ? taskKindOf(entry.taskKind).key === 'message'
                ? 'message'
                : taskKindOf(entry.taskKind).key === 'cafe'
                  ? 'cafe'
                  : taskKindOf(entry.taskKind).key === 'visit'
                    ? 'visit'
                    : taskKindOf(entry.taskKind).key === 'contract'
                      ? 'contract'
                      : 'docs'
              : entry.interactionKind === 'meeting'
                ? 'cafe'
                : entry.interactionKind === 'project_view'
                  ? 'visit'
                  : 'message';
    return {
      action,
      at: entry.at,
      title: (
        <span data-timeline-entry="" className="inline-flex min-w-0 flex-wrap items-center gap-2">
          <Icon name={timelineIcon(entry)} size={16} className="shrink-0 text-ink-muted" />
          <span>{entry.title}</span>
          {entry.kind === 'task' && entry.taskKind && (
            <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">
              {taskKindOf(entry.taskKind).label}
            </span>
          )}
        </span>
      ),
      note: (
        <span className="flex flex-wrap items-center gap-1">
          {entry.automatic && (
            <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">Tự động · SLA</span>
          )}
          {entry.detail && entryDetail(entry)}
          <time className="font-mono text-caption text-ink-muted">{displayDateTime(entry.at)}</time>
        </span>
      ),
    };
  };

  return (
    <div className="space-y-4">
      {/* Hồ sơ đã lưu trữ là bản ghi lịch sử: giữ dòng thời gian đầy đủ, không cần bộ lọc. */}
      {!customer.archived_at && (
        <div className="flex flex-wrap gap-1.5">
          {TIMELINE_FILTERS.map((item) => {
            const active = filter === item.key;
            const count = counts[item.key];
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.key)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-caption transition-colors',
                  active
                    ? 'border-ion bg-ion-tint text-ion'
                    : 'border-line bg-surface-100 text-ink-muted hover:bg-surface-200',
                )}
              >
                {item.label}
                {item.key !== 'all' && count > 0 && (
                  <span className="font-mono text-numeric text-ink-muted">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {isEmpty ? (
        <p className="text-body text-ink-muted">Chưa có hoạt động để hiển thị.</p>
      ) : hasArchive ? (
        <div className="space-y-3">
          {view.ordered.map((row) => {
            const entry = row.entry;
            return (
              <article
                key={entry.id}
                data-timeline-entry=""
                data-timeline-header={row.topLevel ? '' : undefined}
                className={cn(
                  'flex items-start gap-2',
                  row.nested && 'ml-2 border-l-2 border-line pl-3',
                  !row.nested && !row.topLevel && 'border-l-2 border-line pl-3',
                )}
              >
                <Icon
                  name={row.icon}
                  size={20}
                  className={cn('mt-0.5 shrink-0', entry.kind === 'stage' ? 'text-ion' : 'text-ink-muted')}
                />
                <div className="min-w-0 flex-1">
                  {entryText(entry, {
                    detail: entry.kind === 'stage' ? stageDetail : true,
                    heading: entry.kind === 'stage' || entry.kind === 'archive',
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : view.grouped ? (
        <div className="space-y-4">
          {view.groups.map((group) => (
            <section key={group.id} data-timeline-group={group.id} className="space-y-2">
              {group.stage ? (
                <article data-timeline-header="" className="flex items-start gap-2">
                  <Icon name={group.icon} size={20} className="mt-0.5 shrink-0 text-ion" />
                  <div className="min-w-0 flex-1">{entryText(group.stage, { detail: stageDetail, heading: true })}</div>
                </article>
              ) : (
                <article data-timeline-header="" className="flex items-center gap-2">
                  <Icon name={group.icon} size={20} className="shrink-0 text-ink-muted" />
                  <h3 className="text-title">{group.title}</h3>
                </article>
              )}
              {/* Ẩn vòng tròn bậc của kit → bỏ luôn cột 32px của nó, không thì nội dung bị nhét vào cột hẹp (Curtis 30/10). */}
              {group.rows.length > 0 && (
                <div className="ml-2 border-l-2 border-line pl-3 [&>ol>li]:grid-cols-1 [&>ol>li>span:nth-child(-n+2)]:hidden [&>ol>li>div>button]:hidden [&>ol>li>div>span]:hidden [&>ol>li>ol>li>span:first-child]:hidden">
                  <Timeline
                    now={new Date()}
                    stages={[
                      {
                        stage: group.stage?.title.replace(/^Bậc: /, '') || 'Chưa có bậc',
                        start: group.at || group.rows[0]?.entry.at || new Date(),
                        items: group.rows.map((row) => kitAction(row.entry)),
                      },
                    ]}
                  />
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">{view.flat.map(flatRow)}</div>
      )}
    </div>
  );
}
