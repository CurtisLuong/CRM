import type { TimelineAction, TimelineStageGroup } from '@/components/crm';
import { taskKindOf } from '@/config/taskKinds';
import type { Customer } from '@/domain/customer';
import { callReminder } from '@/domain/deadlines';
import { computeSignals, type Signal } from '@/domain/signals';
import { customerSheetTimeline, type ProfileTimelineEntry, timelineGroups } from '@/features/profile/model';
import { LEVEL_ORDER, LEVEL_WORD, type Level, signalFor, slaFor, slaMeterFor } from '@/lib/crm';

function urgencyOf(signal: Signal, customer: Customer, now: number, slaLevel: Level | null): Level | null {
  const task = signal.evidence.find((item) => item.field === 'task')?.value;
  if (task && typeof task === 'object' && 'due' in task && typeof task.due === 'string') {
    return signalFor(task.due, now, { allDay: 'due_allday' in task && task.due_allday === true });
  }
  if (signal.evidence.some((item) => item.field === 'next_call_at')) {
    const reminder = callReminder(customer, now);
    if (reminder) return reminder.state === 'missed' ? 'alert' : 'soon';
  }
  const slaOnly =
    signal.evidence.some((item) => item.field === 'phase') ||
    (signal.group === 'new' && signal.evidence.some((item) => item.field === 'registered_at'));
  if (slaOnly) return slaLevel;
  return signal.due != null && Number.isFinite(signal.due) ? signalFor(signal.due, now) : null;
}

/** Mức gấp cùng nguồn tín hiệu CRM; dùng nhãn chuẩn của SignalBadge khi không có hạn cụ thể. */
export function customerQuickSignal(customer: Customer, now: number): { level: Level; text: string } {
  const meter = slaMeterFor(customer, now);
  const slaLevel = meter ? slaFor(meter.stage, meter.elapsed, { ideal: meter.ideal, max: meter.max }).level : null;
  const signals = computeSignals([customer], { now, ownerId: customer.owner_id });
  const levels = signals
    .flatMap((signal) => [signal, ...(signal.secondaryReasons ?? [])])
    .map((signal) => urgencyOf(signal, customer, now, slaLevel))
    .filter((level): level is Level => !!level)
    .sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b]);
  const level = levels[0] ?? slaLevel ?? 'ok';
  return { level, text: LEVEL_WORD[level] };
}

function actionFor(entry: ProfileTimelineEntry): TimelineAction['action'] {
  if (entry.kind === 'call') return 'call';
  if (entry.kind === 'note') return 'note';
  if (entry.kind === 'stage') return 'booking';
  if (entry.kind === 'task') {
    const kind = taskKindOf(entry.taskKind).key;
    if (kind === 'call') return 'call';
    if (kind === 'message') return 'message';
    if (kind === 'cafe') return 'cafe';
    if (kind === 'visit') return 'visit';
    if (kind === 'contract') return 'contract';
    return 'docs';
  }
  if (entry.interactionKind === 'meeting') return 'cafe';
  if (entry.interactionKind === 'project_view') return 'visit';
  if (entry.kind === 'approved') return 'booking';
  return 'message';
}

function journeyAction(entry: ProfileTimelineEntry): TimelineAction {
  return {
    action: actionFor(entry),
    at: entry.at,
    title: entry.title,
    note: entry.detail,
  };
}

/** Chuyển đúng các nhóm của model hồ sơ sang Timeline kit; nhóm hiện tại đứng đầu, các nhóm cũ có mốc kết thúc. */
export function customerJourney(customer: Customer, now: number): { stages: TimelineStageGroup[]; count: number } {
  const groups = timelineGroups(customerSheetTimeline(customer, now));
  const stages = groups.map((group, index): TimelineStageGroup => {
    const start = group.at || group.rows.at(-1)?.entry.at || new Date(now).toISOString();
    return {
      stage: group.stage?.title.replace(/^Bậc: /, '') || group.title,
      start,
      ...(index > 0 ? { end: groups[index - 1]?.at || start } : {}),
      items: group.rows.map(({ entry }) => journeyAction(entry)),
    };
  });
  return { stages, count: stages.reduce((sum, stage) => sum + (stage.items?.length ?? 0), 0) };
}
