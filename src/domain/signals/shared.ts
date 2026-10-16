import { SIGNALS_CONFIG as C, SIGNAL_GROUPS, type SignalGroup } from '@/config/signals';
import { DAY, HOUR } from '@/config/velocity';
import { type Customer, callAttemptsOf, inFunnel, isQualified, type Task } from '@/domain/customer';
import type { RuleId, Signal, SignalAction } from './types';

export { C, DAY, HOUR };
export const active = (c: Customer) => isQualified(c) && inFunnel(c);
export const openLead = (c: Customer) => !isQualified(c) && !c.disqualified_at;
export const callStart = (c: Customer) => Date.parse(c.next_call_at || '');
export const futureCall = (c: Customer, now: number) => callStart(c) > now;
export function lastInteractionAt(c: Customer): number | null {
  const values = [
    c.care_stage_updated_at,
    ...(Array.isArray(c.care_stage_history) ? c.care_stage_history : []).map((h) => h?.at),
    ...(Array.isArray(c.notes_manual) ? c.notes_manual : []).map((n) => n?.at),
  ]
    .map((t) => Date.parse(t || ''))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : c.created_at ? Date.parse(c.created_at) : null;
}
export function lastTouchMs(c: Customer): number | null {
  const last = callAttemptsOf(c).at(-1);
  return Math.max(lastInteractionAt(c) || 0, last ? Date.parse(last.at) || 0 : 0) || null;
}
export const idleDays = (c: Customer, now: number) => Math.floor((now - (lastTouchMs(c) || now)) / DAY);
export function taskEvidence(t: Task) {
  return { at: t.at, key: t.key, due: t.due, due_allday: t.due_allday, text: t.text, side: t.side };
}
export function make(
  rule: RuleId,
  c: Customer,
  group: SignalGroup | undefined,
  reason: string,
  priority: Signal['priority'],
  actions: SignalAction[],
  evidence: Record<string, unknown>,
  due?: number,
  sort: number[] = [],
): Signal {
  // Presentation groups can change as time passes; identity must survive those transitions.
  const id = `${rule}:${c.id}:${group === 'warm' || group === 'nonext' ? group : 'signal'}`;
  const entries = Object.entries(evidence).map(([field, value]) => ({ field, value }));
  // No current-time derived text: elapsed time alone must not revive dismissed signals.
  return {
    id,
    rule,
    customerId: c.id,
    group,
    title: group ? SIGNAL_GROUPS[group].title : reason,
    reason,
    priority,
    actions,
    evidence: entries,
    due,
    sort,
    dedupeKey: c.id,
    fingerprint: JSON.stringify(entries),
  };
}
export function dueTasks(c: Customer) {
  return (Array.isArray(c.next_tasks) ? c.next_tasks : []).filter(
    (t): t is Task => !!t && !t.done_at && Number.isFinite(Date.parse(t.due || '')),
  );
}
