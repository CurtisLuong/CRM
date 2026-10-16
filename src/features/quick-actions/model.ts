import { CALL_RESULTS, type CallResult } from '@/config/callResults';
import { type CallSlotKey, FOLLOWUP_CONFIG } from '@/config/followup';
import type { CustomerRepository, Data } from '@/data/repositories/customers';
import { type CallAttempt, type Customer, callAttemptsOf, isQualified } from '@/domain/customer';
import { afterCall, firstCall, forStage, parseRange, type ScheduleSuggestion, scheduleLabel } from '@/domain/followup';

export type CallDraft = {
  at: string;
  duration?: number | null;
  origin?: string;
  device_id?: string;
  direction?: string;
  editAt?: string;
  estimateSec?: number;
};
export type NextMode = 'suggested' | 'custom' | 'none' | 'drop';
export function previewCall(c: Customer, draft: CallDraft, result: CallResult | null) {
  const attempt = { at: draft.at, result };
  return draft.editAt
    ? callAttemptsOf(c).map((a) => (a.at === draft.editAt ? { ...a, ...attempt } : a))
    : [...callAttemptsOf(c), attempt];
}
export function callSuggestion(
  c: Customer,
  draft: CallDraft,
  result: CallResult | null,
  now: number,
  stats: Customer[] = [],
) {
  return result ? afterCall(c, previewCall(c, draft, result), now, { statsCustomers: stats }) : null;
}
export function initialSchedule(c: Customer, now: number): ScheduleSuggestion {
  const suggested = isQualified(c) ? forStage(c, c.care_stage, now) : firstCall(c, now);
  if (suggested) return suggested;
  const start = new Date(now + 86400000);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11);
  return { kind: 'schedule', start, end, reason: 'Hẹn gọi lại', label: scheduleLabel(start, end) };
}
export const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function slotFor(date: Date): CallSlotKey {
  return (
    (Object.keys(FOLLOWUP_CONFIG.callSlots) as CallSlotKey[]).find((key) => {
      const [h, m, eh, em] = parseRange(FOLLOWUP_CONFIG.callSlots[key].range);
      const minutes = date.getHours() * 60 + date.getMinutes();
      return minutes >= h * 60 + m && minutes <= eh * 60 + em;
    }) ?? 'A'
  );
}
export function scheduleFor(day: string, slot: CallSlotKey, reason = 'Hẹn gọi lại'): ScheduleSuggestion {
  const [h, m, eh, em] = parseRange(FOLLOWUP_CONFIG.callSlots[slot].range);
  const start = new Date(`${day}T00:00:00`);
  start.setHours(h, m, 0, 0);
  const end = new Date(start);
  end.setHours(eh, em, 0, 0);
  return { kind: 'schedule', start, end, reason, slot, label: scheduleLabel(start, end) };
}
export function schedulePatch(schedule: ScheduleSuggestion | null): Data {
  return {
    next_call_at: schedule?.start.toISOString() ?? null,
    next_call_end: schedule?.end.toISOString() ?? null,
    next_call_reason: schedule?.reason ?? null,
  };
}
function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}, ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
export function callDuration(sec: number | null | undefined) {
  if (sec == null) return '';
  const n = Math.max(0, Math.round(sec));
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}p${n % 60}s`;
}
/** Same field patch and call element as v1; aggregate append/edit is atomic in A4. */
export async function saveCall(
  repo: CustomerRepository,
  id: string,
  draft: CallDraft,
  result: CallResult,
  note: string,
  mode: NextMode,
  custom: ScheduleSuggestion | null,
  now: number,
  stats: Customer[] = [],
) {
  const c = await repo.get(id);
  if (!c || c.archived_at || c.owner_id !== repo.sync.local.userId)
    throw new Error('Khách không còn thuộc quyền chỉnh sửa.');
  const suggestion = callSuggestion(c, draft, result, now, stats);
  const suggested =
    suggestion?.kind === 'schedule' ? suggestion : suggestion?.kind === 'drop' ? suggestion.fallback : null;
  const sched = mode === 'custom' ? custom : mode === 'suggested' ? suggested : null;
  if ((mode === 'custom' || suggestion?.kind === 'ask') && !sched && mode !== 'none')
    throw new Error('Chọn giờ khách hẹn gọi lại.');
  if (sched && (!Number.isFinite(+sched.start) || +sched.start <= now || +sched.end < +sched.start))
    throw new Error('Chọn lịch gọi trong tương lai.');
  const patch: Data = sched ? schedulePatch(sched) : c.next_call_at ? schedulePatch(null) : {};
  if (mode === 'drop' && suggestion?.kind === 'drop')
    Object.assign(patch, {
      disqualified_at: new Date(now).toISOString(),
      disqualify_reason: suggestion.code,
      disqualify_note: suggestion.auto ? 'Hết vòng gọi theo nhịp — chuyển nhắn Zalo/SMS' : null,
      ...schedulePatch(null),
    });
  const attempt: CallAttempt = {
    at: draft.at,
    result,
    note: note.trim() || null,
    duration: draft.duration ?? null,
    origin: draft.origin || 'manual',
    ...(draft.device_id ? { device_id: draft.device_id } : {}),
    ...(draft.direction ? { direction: draft.direction } : {}),
  };
  if (draft.editAt && !callAttemptsOf(c).some((a) => a.at === draft.editAt))
    throw new Error('Cuộc gọi đã thay đổi. Mở lại để kiểm tra.');
  const qualified = isQualified(c);
  if (qualified) patch.care_stage = c.care_stage;
  const dur = callDuration(draft.duration);
  return repo.logCall(id, attempt, {
    editAt: draft.editAt,
    patch,
    forceLog: qualified,
    careStageNote: `📞 gọi ${stamp(new Date(draft.at))}${dur ? ` (${dur})` : ''} — ${CALL_RESULTS[result]}${note.trim() ? `. ${note.trim()}` : ''}${sched ? ` · hẹn gọi lại ${sched.label}` : ''}`,
  });
}
