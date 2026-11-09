import { type ReactNode, useState } from 'react';
import { formatStageDuration, Timeline, type TimelineAction, TimelineEditButton } from '@/components/crm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast as notify } from '@/components/ui/sonner';
import { CALL_RESULTS } from '@/config/callResults';
import { TASK_KINDS, type TaskKind, taskKindOf } from '@/config/taskKinds';
import type { CustomerRepository } from '@/data/repositories/customers';
import type { Customer, Interaction, Note, StageHistoryEntry, Task } from '@/domain/customer';
import { callAttemptsOf, normStage } from '@/domain/customer/normalize';
import { fmtWhen } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { Icon } from '@/ui/Icon';
import {
  limitTimelineView,
  type ProfileTimelineEntry,
  showsStageDetail,
  stageDisplayTitle,
  TIMELINE_FILTERS,
  type TimelineFilter,
  type TimelineRow,
  timelineCounts,
  timelineEntryTarget,
  timelineGroups,
  timelineIcon,
  timelineView,
} from './model';

const FIELD =
  'min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion disabled:opacity-60';

type Props = {
  customer: Customer;
  entries: readonly ProfileTimelineEntry[];
  writable: boolean;
  /** Ghi lịch sử giùm: chủ khách hoặc người đang thấy khách nhóm (D-032). */
  canEditHistory?: boolean;
  busy: boolean;
  /** Repository để sửa/xoá đúng phần tử đã lưu; không có thì chỉ đọc. */
  repo?: CustomerRepository;
  now?: number;
  onStage?: () => void;
  /** Giữ chữ ký cũ cho màn/test chưa chuyển hẳn sang repository. */
  onSave?: (patch: Record<string, unknown>, message?: string) => Promise<boolean>;
};

type DeleteTarget = { entry: ProfileTimelineEntry; name: string; warning?: string };

const editLabel = (entry: ProfileTimelineEntry) => {
  if (entry.kind === 'stage') return entry.stageNote ? 'Sửa ghi chú bậc' : 'Sửa mốc bậc';
  if (entry.kind === 'call') return 'Sửa cuộc gọi';
  if (entry.kind === 'interaction') return 'Sửa tương tác';
  if (entry.kind === 'task') return 'Sửa việc';
  return 'Sửa ghi chú';
};

const displayTitleOf = (entry: ProfileTimelineEntry) =>
  entry.kind === 'stage' ? stageDisplayTitle(entry.title) : entry.title;

const deleteNameOf = (entry: ProfileTimelineEntry) => {
  if (entry.kind === 'note') return entry.detail || 'Ghi chú';
  if (entry.kind === 'stage' && entry.stageNote) return entry.detail || 'Ghi chú bậc';
  if (entry.kind === 'task') return displayTitleOf(entry).replace(/^Xong việc: /, '');
  return displayTitleOf(entry);
};

const atOf = (item: { at?: string | null } | null | undefined) => (typeof item?.at === 'string' ? item.at : null);

function findAt<T extends { at?: string | null }>(
  list: readonly (T | null | undefined)[] | null | undefined,
  at: string,
  index: number,
): T | null {
  const direct = list?.[index];
  if (direct && atOf(direct) === at) return direct;
  return list?.find((item): item is T => !!item && atOf(item) === at) ?? null;
}

function findDoneTask(customer: Customer, at: string, index: number): Task | null {
  const list = Array.isArray(customer.next_tasks) ? customer.next_tasks : [];
  const direct = list[index];
  if (direct?.done_at === at) return direct;
  return list.find((task): task is Task => !!task && task.done_at === at) ?? null;
}

/**
 * Tab "Dòng thời gian" của hồ sơ: lọc theo loại, sửa/xoá tại chỗ, đổi bậc 2 bước.
 * TL-04: chung khuôn Hành trình; tab giới hạn 8 hoạt động, tấm mở toàn bộ kết quả lọc.
 */
export function ProfileTimeline({
  customer,
  entries,
  writable,
  canEditHistory = writable,
  busy,
  repo,
  now = Date.now(),
  onStage,
}: Props) {
  const toast = (input: { title: string; tone?: 'default' | 'error' }) =>
    notify[input.tone === 'error' ? 'error' : 'info'](input.title);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [callResult, setCallResult] = useState('');
  const [taskKind, setTaskKind] = useState<TaskKind>('other');
  const [taskReopen, setTaskReopen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const counts = timelineCounts(entries);
  const fullView = timelineView(entries, filter);
  const { view: previewView, hiddenCount } = limitTimelineView(fullView, 8);
  const stageDetail = showsStageDetail(filter);
  const allGroups = timelineGroups(entries);
  const hasArchive = filter === 'all' && entries.some((entry) => entry.kind === 'archive');
  const isEmpty = fullView.grouped ? fullView.groups.length === 0 : fullView.flat.length === 0;
  const disabled = busy || saving;

  const canEditEntry = (entry: ProfileTimelineEntry) => {
    if (!repo || entry.kind === 'archive' || entry.kind === 'approved') return false;
    if (entry.kind === 'task') return writable;
    return canEditHistory;
  };
  const canDeleteEntry = (entry: ProfileTimelineEntry) =>
    canEditEntry(entry) && (entry.kind !== 'stage' || !!entry.stageNote);

  const startEdit = (entry: ProfileTimelineEntry) => {
    if (!canEditEntry(entry) || disabled) return;
    const target = timelineEntryTarget(entry.id);
    if (!target) return;
    if (entry.kind === 'note') {
      const note = findAt<Note>(customer.notes_manual, target.at, target.index);
      setDraft(note?.text || '');
    } else if (entry.kind === 'stage') {
      const history = findAt<StageHistoryEntry>(customer.care_stage_history, target.at, target.index);
      setDraft(history?.note || '');
    } else if (entry.kind === 'call') {
      const call = findAt(customer.call_attempts, target.at, target.index);
      setDraft(call?.note || '');
      setCallResult(call?.result || '');
    } else if (entry.kind === 'interaction') {
      const item = findAt<Interaction>(customer.interactions, target.at, target.index);
      setDraft(item?.note || '');
    } else if (entry.kind === 'task') {
      const task = findDoneTask(customer, target.at, target.index);
      setDraft(task?.text || '');
      setTaskKind(taskKindOf(task?.kind).key);
      setTaskReopen(false);
    }
    setEditingId(entry.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
    setCallResult('');
    setTaskReopen(false);
  };

  const saveEdit = async (entry: ProfileTimelineEntry) => {
    const target = timelineEntryTarget(entry.id);
    if (!repo || !canEditEntry(entry) || !target) return;
    const text = draft.trim();
    if ((entry.kind === 'note' || entry.kind === 'stage' || entry.kind === 'task') && !text) {
      toast({
        title: entry.kind === 'task' ? 'Tên việc không được để trống' : 'Ghi chú không được để trống',
        tone: 'error',
      });
      return;
    }
    setSaving(true);
    try {
      if (entry.kind === 'note') {
        await repo.updateNote(customer.id, target.at, text);
        toast({ title: 'Đã cập nhật ghi chú' });
      } else if (entry.kind === 'stage') {
        await repo.updateCareHistoryNote(customer.id, target.at, text);
        toast({ title: 'Đã cập nhật ghi chú lịch sử bậc' });
      } else if (entry.kind === 'call') {
        await repo.logCall(customer.id, { result: callResult || null, note: text || null }, { editAt: target.at });
        toast({ title: 'Đã cập nhật cuộc gọi' });
      } else if (entry.kind === 'interaction') {
        const list = Array.isArray(customer.interactions) ? customer.interactions.slice() : [];
        const index =
          atOf(list[target.index]) === target.at ? target.index : list.findIndex((item) => atOf(item) === target.at);
        const interaction = list[index];
        if (index < 0 || !interaction) throw new Error('Không tìm thấy tương tác.');
        list[index] = { ...interaction, note: text || null };
        await repo.update(customer.id, { interactions: list });
        toast({ title: 'Đã cập nhật tương tác' });
      } else if (entry.kind === 'task') {
        const task = findDoneTask(customer, target.at, target.index);
        if (!task || typeof task.at !== 'string') throw new Error('Không tìm thấy việc.');
        const due = task.due ? { due: task.due, due_allday: task.due_allday === true } : null;
        await repo.updateTask(customer.id, task.at, text, due, taskKind);
        if (taskReopen) await repo.reopenTask(customer.id, task.at);
        toast({ title: taskReopen ? 'Đã đưa việc lại vào việc cần làm' : 'Đã cập nhật việc' });
      }
      cancelEdit();
    } catch (error) {
      toast({
        title: 'Chưa lưu được',
        tone: 'error',
      });
      // Giữ nguyên chữ đã nhập để người dùng thử lại, không đóng ô sửa.
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (entry: ProfileTimelineEntry) => {
    const target = timelineEntryTarget(entry.id);
    if (!repo || disabled || !canDeleteEntry(entry) || !target) return;
    const firstCall = callAttemptsOf(customer)[0];
    const warning =
      entry.kind === 'call' && !customer.qualified_at && firstCall?.at === target.at
        ? 'Đây là cuộc gọi đầu tiên — đồng hồ SLA tiếp cận sẽ tính lại.'
        : undefined;
    setDeleteTarget({ entry, name: deleteNameOf(entry), warning });
  };

  const removeEntry = async () => {
    if (!repo || !deleteTarget) return;
    const entry = deleteTarget.entry;
    const target = timelineEntryTarget(entry.id);
    if (!target) return;
    setSaving(true);
    try {
      if (entry.kind === 'note') {
        await repo.deleteNote(customer.id, target.at);
      } else if (entry.kind === 'stage' && entry.stageNote) {
        const list = Array.isArray(customer.care_stage_history) ? customer.care_stage_history.slice() : [];
        const index =
          atOf(list[target.index]) === target.at ? target.index : list.findIndex((item) => atOf(item) === target.at);
        if (index < 0) throw new Error('Không tìm thấy mốc bậc.');
        list.splice(index, 1);
        await repo.update(customer.id, { care_stage_history: list });
      } else if (entry.kind === 'call' || entry.kind === 'interaction') {
        // Bỏ đúng MỘT phần tử (theo vị trí trong mảng gốc, đối chiếu giờ) — hai mục trùng giờ không bị xoá cùng (D-012).
        const key = entry.kind === 'call' ? 'call_attempts' : 'interactions';
        const list = Array.isArray(customer[key]) ? (customer[key] as { at?: string | null }[]).slice() : [];
        const index =
          atOf(list[target.index]) === target.at ? target.index : list.findIndex((item) => atOf(item) === target.at);
        if (index < 0) throw new Error('Không tìm thấy mục cần xoá.');
        list.splice(index, 1);
        await repo.update(customer.id, { [key]: list });
      } else if (entry.kind === 'task') {
        const task = findDoneTask(customer, target.at, target.index);
        if (!task || typeof task.at !== 'string') throw new Error('Không tìm thấy việc.');
        await repo.deleteTask(customer.id, task.at);
      }
      cancelEdit();
      setDeleteTarget(null);
      toast({ title: 'Đã xoá mục' });
    } catch (error) {
      toast({ title: 'Chưa xoá được', tone: 'error' });
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const noteEditor = (entry: ProfileTimelineEntry) => (
    <span className="mt-2 flex flex-col gap-2">
      <textarea
        aria-label={entry.kind === 'stage' ? 'Sửa ghi chú bậc' : 'Sửa ghi chú'}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        className={`${FIELD} min-h-20 py-2`}
      />
      <span className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={disabled || draft.trim().length === 0} onClick={() => void saveEdit(entry)}>
          Lưu
        </Button>
        <Button disabled={disabled} onClick={cancelEdit}>
          Huỷ
        </Button>
        {canDeleteEntry(entry) && (
          <Button variant="destructive" disabled={disabled} onClick={() => askDelete(entry)}>
            Xoá
          </Button>
        )}
      </span>
    </span>
  );

  const callEditor = (entry: ProfileTimelineEntry) => (
    <span className="mt-2 flex flex-col gap-2">
      <label className="block space-y-1 text-label text-ink-muted">
        <span>Kết quả cuộc gọi</span>
        <select
          aria-label="Kết quả cuộc gọi"
          value={callResult}
          disabled={disabled}
          onChange={(event) => setCallResult(event.target.value)}
          className={FIELD}
        >
          <option value="">Chưa ghi kết quả</option>
          {Object.entries(CALL_RESULTS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        aria-label="Sửa ghi chú"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        className={`${FIELD} min-h-20 py-2`}
      />
      <span className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={disabled} onClick={() => void saveEdit(entry)}>
          Lưu
        </Button>
        <Button disabled={disabled} onClick={cancelEdit}>
          Huỷ
        </Button>
        {canDeleteEntry(entry) && (
          <Button variant="destructive" disabled={disabled} onClick={() => askDelete(entry)}>
            Xoá
          </Button>
        )}
      </span>
    </span>
  );

  const taskEditor = (entry: ProfileTimelineEntry) => (
    <span className="mt-2 flex flex-col gap-2">
      <label className="block space-y-1 text-label text-ink-muted">
        <span>Tên việc</span>
        <input
          aria-label="Tên việc"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          className={FIELD}
        />
      </label>
      <label className="block space-y-1 text-label text-ink-muted">
        <span>Loại việc</span>
        <select
          aria-label="Loại việc"
          value={taskKind}
          disabled={disabled}
          onChange={(event) => setTaskKind(event.target.value as TaskKind)}
          className={FIELD}
        >
          {Object.entries(TASK_KINDS).map(([code, item]) => (
            <option key={code} value={code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={taskReopen}
          disabled={disabled}
          onChange={(event) => setTaskReopen(event.target.checked)}
        />
        <span>Chưa xong — đưa lại vào việc cần làm</span>
      </label>
      <span className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={disabled || draft.trim().length === 0} onClick={() => void saveEdit(entry)}>
          Lưu
        </Button>
        <Button disabled={disabled} onClick={cancelEdit}>
          Huỷ
        </Button>
        {canDeleteEntry(entry) && (
          <Button variant="destructive" disabled={disabled} onClick={() => askDelete(entry)}>
            Xoá
          </Button>
        )}
      </span>
    </span>
  );

  // Một khuôn cho mọi mục (Curtis 30/10): dòng đầu = icon + tên + ngày (một ngày duy nhất, ngoài khung);
  // khung chỉ có khi có ghi chú — chữ bên trái, bút nhỏ cố định cuối dòng.
  const entryBody = (entry: ProfileTimelineEntry) => {
    const editable = canEditEntry(entry);
    const editing = editable && editingId === entry.id;
    // Không ghi chú → không khung; bút nằm sau giờ trên hàng tên để không thêm dòng trống.
    if (!entry.detail && !editing) return null;
    if (editing) {
      if (entry.kind === 'call') return callEditor(entry);
      if (entry.kind === 'task') return taskEditor(entry);
      return noteEditor(entry);
    }
    return (
      <span data-entry-body="" className={cn('relative block', editable && 'pr-11 [&>button]:-right-2')}>
        {entry.detail ? (
          <span className="block whitespace-pre-wrap break-words text-sm font-medium leading-5 text-ink-muted">
            {entry.detail}
          </span>
        ) : (
          <span />
        )}
        {editable && (
          <TimelineEditButton label={editLabel(entry)} disabled={disabled} onClick={() => startEdit(entry)} />
        )}
      </span>
    );
  };

  const entryText = (
    entry: ProfileTimelineEntry,
    options: {
      detail: boolean;
      heading?: boolean;
      timeBelow?: boolean;
      duration?: string;
      trailing?: ReactNode;
    },
  ) => (
    <>
      <div
        data-timeline-item-header=""
        className={cn(
          'relative flex items-end justify-between gap-2',
          !entry.detail && canEditEntry(entry) && editingId !== entry.id && 'pr-11',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          {options.heading ? (
            <h3 className="text-sm font-semibold leading-5">{displayTitleOf(entry)}</h3>
          ) : (
            <span className="text-sm font-medium leading-5">{displayTitleOf(entry)}</span>
          )}
          {entry.automatic && !options.heading && (
            <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">Tự động · SLA</span>
          )}
          {entry.kind === 'task' && entry.taskKind && (
            <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">
              {taskKindOf(entry.taskKind).label}
            </span>
          )}
        </div>
        {!options.timeBelow && (
          <time className="shrink-0 font-mono text-xs text-ink-muted" dateTime={new Date(entry.at).toISOString()}>
            {fmtWhen(entry.at)}
          </time>
        )}
        {options.trailing}
        {!entry.detail && canEditEntry(entry) && editingId !== entry.id && (
          <TimelineEditButton label={editLabel(entry)} disabled={disabled} onClick={() => startEdit(entry)} />
        )}
      </div>
      {options.timeBelow && (
        // Nút "Đổi bậc" (cao 44px, lề âm) tràn xuống dòng này → chừa chỗ bên phải để chữ không bị che (360px).
        <p
          className={cn(
            'mt-0.5 flex flex-wrap items-center gap-x-1 text-caption text-ink-muted',
            options.trailing && 'pr-24',
          )}
        >
          {entry.automatic && <span className="rounded-sm border border-line px-2 py-0.5">Tự động · SLA</span>}
          {options.duration && <span data-stage-duration="">{options.duration}</span>}
          {options.duration && <span aria-hidden="true">·</span>}
          <time className="font-mono text-xs" dateTime={new Date(entry.at).toISOString()}>
            {fmtWhen(entry.at)}
          </time>
        </p>
      )}
      {options.detail && (entry.detail || editingId === entry.id) && (
        <div className="mt-1">
          <div
            data-timeline-note={editingId === entry.id ? undefined : ''}
            className={editingId === entry.id ? undefined : 'rounded-sm border border-line bg-surface-0 px-3 py-2'}
          >
            {entryBody(entry)}
          </div>
        </div>
      )}
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
      icon: <Icon name={timelineIcon(entry)} size={16} />,
      at: entry.at,
      title: (
        <span data-timeline-entry="" className="inline-flex min-w-0 flex-wrap items-center gap-2">
          <span>{displayTitleOf(entry)}</span>
          {entry.kind === 'task' && entry.taskKind && (
            <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">
              {taskKindOf(entry.taskKind).label}
            </span>
          )}
        </span>
      ),
      edit:
        !entry.detail && canEditEntry(entry) && editingId !== entry.id ? (
          <TimelineEditButton label={editLabel(entry)} disabled={disabled} onClick={() => startEdit(entry)} />
        ) : undefined,
      // Không có ghi chú → không vẽ khung (ngày đã ở dòng tên của kit).
      note:
        entry.detail || entry.automatic || editingId === entry.id ? (
          <span className="flex flex-col gap-1">
            {entry.automatic && (
              <span className="rounded-sm border border-line px-2 py-0.5 text-caption text-ink-muted">
                Tự động · SLA
              </span>
            )}
            {entryBody(entry)}
          </span>
        ) : undefined,
    };
  };

  const currentStage = normStage(customer.care_stage);
  const endOfGroup = (groupIndex: number) => allGroups[groupIndex - 1]?.at;

  const filters = (
    <>
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
    </>
  );

  const renderTimeline = (view: typeof fullView) => (
    <>
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
                    heading: row.topLevel,
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : view.grouped ? (
        <Timeline
          now={new Date(now)}
          stages={view.groups.map((group) => {
            const groupIndex = allGroups.findIndex((item) => item.id === group.id);
            const isCurrent =
              allGroups[0]?.id === group.id &&
              !!group.stage &&
              !!currentStage &&
              normStage(stageDisplayTitle(group.stage.title)) === currentStage;
            const duration = group.stage ? formatStageDuration(group.at, endOfGroup(groupIndex), new Date(now)) : '';
            return {
              id: group.id,
              stage: group.stage ? stageDisplayTitle(group.stage.title) : 'Chưa có bậc',
              start: group.at || group.rows[0]?.entry.at || new Date(now),
              end: endOfGroup(groupIndex),
              header: (
                <article data-timeline-header="" className="relative pl-[34px] pt-3">
                  {group.stage ? (
                    entryText(group.stage, {
                      detail: stageDetail,
                      heading: true,
                      timeBelow: true,
                      duration,
                      trailing:
                        isCurrent && writable && onStage ? (
                          <Button variant="secondary" size="sm" className="-my-3 h-11 shrink-0" onClick={onStage}>
                            Đổi bậc
                          </Button>
                        ) : undefined,
                    })
                  ) : (
                    <h3 className="text-sm font-semibold leading-5">{group.title}</h3>
                  )}
                </article>
              ),
              items: group.rows.map((row) => kitAction(row.entry)),
            };
          })}
        />
      ) : (
        <div className="space-y-3">{view.flat.map(flatRow)}</div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {filters}
      {!historyOpen && renderTimeline(previewView)}
      {hiddenCount > 0 && (
        <Button
          className="w-full"
          onClick={() => {
            cancelEdit();
            setHistoryOpen(true);
          }}
        >
          Xem toàn bộ lịch sử ({hiddenCount} mục)
        </Button>
      )}
      <Sheet
        open={historyOpen}
        onOpenChange={(open) => {
          cancelEdit();
          setHistoryOpen(open);
        }}
      >
        <SheetContent mobileHeight="90dvh" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Lịch sử · {customer.full_name}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {filters}
            {historyOpen && renderTimeline(fullView)}
          </SheetBody>
        </SheetContent>
      </Sheet>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent role="alertdialog" size="sm" tone="alert" aria-describedby="tl02-delete-description">
          <DialogHeader>
            <DialogTitle>Xoá mục này?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="break-words text-sm font-semibold text-ink">{deleteTarget?.name}</p>
            <DialogDescription id="tl02-delete-description">Không hoàn tác được.</DialogDescription>
            {deleteTarget?.warning && <p className="text-sm text-alert-text">{deleteTarget.warning}</p>}
          </DialogBody>
          <DialogFooter>
            <Button disabled={disabled} onClick={() => setDeleteTarget(null)}>
              Huỷ
            </Button>
            <Button variant="destructive" disabled={disabled} onClick={() => void removeEntry()}>
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
