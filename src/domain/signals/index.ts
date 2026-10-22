/** Pure D-015 registry. Consumers supply owner-scoped local customers and a captured clock. */
import { SIGNALS_CONFIG as C, SIGNAL_GROUPS } from '@/config/signals';
import { CARE_STAGE_DROPPED, CARE_STAGES } from '@/config/stages';
import { DAY } from '@/config/velocity';
import { type Customer, isQualified, normStage, parseDob } from '@/domain/customer';
import { startOfDayMs } from '@/domain/deadlines';
import { lastTouchMs } from './shared';
import type { Signal, SignalContext, SignalRule } from './types';

export { hasSaleTouch, lastInteractionAt, lastTouchMs } from './shared';
export type * from './types';

const modules = import.meta.glob<{ default: SignalRule }>('./rules/*.ts', { eager: true });
export const signalRules: readonly SignalRule[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, m]) => m.default);

export function evaluateSignals(customers: readonly Customer[], ctx: SignalContext): Signal[] {
  return customers
    .filter((c) => !c.archived_at && (!ctx.ownerId || c.owner_id === ctx.ownerId))
    .flatMap((c) => signalRules.flatMap((r) => r.evaluate(c, ctx)))
    .filter((s) => {
      const saved = ctx.ui_state?.signals?.[s.id];
      if (!saved || saved.fingerprint !== s.fingerprint) return true;
      return !saved.hidden && !(saved.snoozedUntil != null && saved.snoozedUntil > ctx.now);
    });
}
const groupRank = (s: Signal) => (s.group ? C.groupOrder.indexOf(s.group) : C.groupOrder.length);
function legacyOrder(a: Signal, b: Signal) {
  const group = groupRank(a) - groupRank(b);
  if (group) return group;
  for (let i = 0; i < Math.max(a.sort.length, b.sort.length); i++) {
    const diff = (a.sort[i] || 0) - (b.sort[i] || 0);
    if (diff) return diff;
  }
  return 0;
}
/** Approved local T2.B5 exception: default UX priority/deadline/stage/last-contact ordering. */
export function computeSignals(
  customers: readonly Customer[],
  ctx: SignalContext,
  ordering: 'legacy' | 'ux' = C.defaultOrdering,
): Signal[] {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const priority = { P0: 0, P1: 1, P2: 2 };
  const all = evaluateSignals(customers, ctx).sort((a, b) => {
    if (ordering === 'legacy') return legacyOrder(a, b);
    const ac = byId.get(a.customerId),
      bc = byId.get(b.customerId);
    if (!ac || !bc) return legacyOrder(a, b);
    return (
      priority[a.priority] - priority[b.priority] ||
      (a.due ?? Infinity) - (b.due ?? Infinity) ||
      CARE_STAGES.indexOf(normStage(bc.care_stage) as (typeof CARE_STAGES)[number]) -
        CARE_STAGES.indexOf(normStage(ac.care_stage) as (typeof CARE_STAGES)[number]) ||
      (lastTouchMs(ac) ?? Infinity) - (lastTouchMs(bc) ?? Infinity) ||
      legacyOrder(a, b)
    );
  });
  const primary = new Map<string, Signal>();
  for (const signal of all) {
    const existing = primary.get(signal.dedupeKey);
    if (existing) existing.secondaryReasons?.push(signal);
    else primary.set(signal.dedupeKey, { ...signal, secondaryReasons: [] });
  }
  return [...primary.values()];
}

/** Baseline adapter only: v1 contact dedupe and task exclusions, using the same registry candidates.
 * Birthday remains a read-only legacy projection; S15 suggestions belong to T6.3, not this registry.
 */
export function legacyDashboardGroups(customers: readonly Customer[], ctx: SignalContext) {
  const candidates = evaluateSignals(customers, ctx).sort(legacyOrder);
  const seen = new Set<string>();
  const tasks = new Set(candidates.filter((s) => s.group === 'tasks').map((s) => s.customerId));
  const groups = C.groupOrder.map((key) => {
    let items = candidates.filter((s) => s.group === key);
    const within = new Set<string>();
    items = items.filter((s) => {
      if (within.has(s.customerId)) return false;
      within.add(s.customerId);
      return true;
    });
    if (SIGNAL_GROUPS[key].contact)
      items = items.filter((s) => {
        if (seen.has(s.customerId)) return false;
        seen.add(s.customerId);
        return true;
      });
    if (key === 'hot' || key === 'warm' || key === 'nonext') items = items.filter((s) => !tasks.has(s.customerId));
    return { key: key as string, ids: items.map((s) => s.customerId) };
  });
  const birthdays = customers
    .filter(
      (c) =>
        !c.archived_at &&
        (!ctx.ownerId || c.owner_id === ctx.ownerId) &&
        isQualified(c) &&
        c.care_stage !== CARE_STAGE_DROPPED,
    )
    .flatMap((c) => {
      const dob = parseDob(c.dob);
      if (!dob) return [];
      const date = new Date(ctx.now);
      date.setMonth(dob.month - 1, dob.day);
      date.setHours(0, 0, 0, 0);
      if (date.getTime() < startOfDayMs(ctx.now)) date.setFullYear(date.getFullYear() + 1);
      const days = Math.round((date.getTime() - startOfDayMs(ctx.now)) / DAY);
      return days <= C.birthdayDays ? [{ id: c.id, days }] : [];
    })
    .sort((a, b) => a.days - b.days);
  groups.push({ key: 'bday', ids: birthdays.map((c) => c.id) });
  return groups;
}
