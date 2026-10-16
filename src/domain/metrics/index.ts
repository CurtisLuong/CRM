/** Read-only analytics built from existing CRM records and approved domain config. */

import { SIGNALS_CONFIG } from '@/config/signals';
import { SOURCES } from '@/config/sources';
import { CARE_STAGE_BOOKING, CARE_STAGE_NURTURE, CARE_STAGE_WON, LEAD_ONLY_STAGES } from '@/config/stages';
import { VELOCITY_CONFIG } from '@/config/velocity';
import type { Customer } from '@/domain/customer';
import { callAttemptsOf, inFunnel, isQualified, normStage, openTasksOf, sourceListOf } from '@/domain/customer';
import { countdownTag, taskDueMs } from '@/domain/deadlines';
import { callSlots, slotOfTime } from '@/domain/followup';
import { lastTouchMs } from '@/domain/signals';
import { newLeadStart, status as velocityStatus } from '@/domain/velocity';

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const INSIGHT_THRESHOLDS = {
  slotCalls: 10,
  speedGroup: 8,
  channelLeads: 10,
  stuckDays: 21,
  hotIdleDays: 7,
} as const;
const ratio = (n: number, d: number) => (d ? Math.round((n * 100) / d) : null);
const parsed = (s?: string | null) => {
  const n = Date.parse(s || '');
  return Number.isFinite(n) ? n : Number.NaN;
};
const firstCallAt = (c: Customer) => {
  const a = callAttemptsOf(c).find((x) => x.at);
  return a ? parsed(a.at) : Number.NaN;
};
const regAt = (c: Customer) => parsed(c.registered_at || c.created_at);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  const middle = sorted[mid] ?? 0;
  return sorted.length % 2 ? middle : ((sorted[mid - 1] ?? 0) + middle) / 2;
};

export type Metric = { numerator: number; denominator: number; percent: number | null; label: string };
export type FunnelStageMetric = {
  key: string;
  label: string;
  reached: number;
  conversion: Metric | null;
  averageDurationMs: number | null;
  overdue: number;
};
export type Insight = {
  key: string;
  title: string;
  evidence: string;
  numerator?: number;
  denominator?: number;
  pending?: string;
};

/** Exact four v1 relationship-health metrics. Every rate carries its numerator and denominator. */
export function careMetrics(customers: readonly Customer[], now: number) {
  const active = customers.filter((c) => isQualified(c) && inFunnel(c));
  const talked = customers.filter((c) => callAttemptsOf(c).some((a) => a.result === 'talked')).length;
  const covered = active.filter((c) => !!c.next_call_at || openTasksOf(c).length > 0).length;
  let overdue = 0;
  let commitmentCount = 0;
  for (const c of customers) {
    if (c.disqualified_at) continue;
    if (c.next_call_at) {
      commitmentCount++;
      const start = parsed(c.next_call_at);
      const end = c.next_call_end ? parsed(c.next_call_end) : start;
      if (countdownTag(start, end, false, now)?.state === 'missed') overdue++;
    }
    for (const task of openTasksOf(c)) {
      commitmentCount++;
      const due = taskDueMs(task);
      if (countdownTag(due, due, !!task.due_allday, now)?.state === 'missed') overdue++;
    }
  }
  const speeds = customers
    .map((c) => {
      const start = regAt(c),
        first = firstCallAt(c);
      return Number.isFinite(start) && Number.isFinite(first) && first >= start ? first - start : null;
    })
    .filter((n): n is number => n !== null);
  const med = median(speeds);
  return {
    talked: {
      numerator: talked,
      denominator: customers.length,
      percent: ratio(talked, customers.length),
      label: 'Khách đã trao đổi',
    } as Metric,
    covered: {
      numerator: covered,
      denominator: active.length,
      percent: ratio(covered, active.length),
      label: 'Có bước tiếp theo',
    } as Metric,
    overdue: {
      numerator: overdue,
      denominator: commitmentCount,
      percent: ratio(overdue, commitmentCount),
      label: 'Cam kết quá hạn',
    },
    firstCallMedianMs: med,
    firstCallMedian: {
      numerator: speeds.length,
      denominator: customers.length,
      percent: null,
      label: 'Trung vị gọi lần đầu',
    },
  };
}

/** Phễu và stage dwell from the approved velocity config; nurture/won/drop remain outside the funnel. */
export function funnelMetrics(customers: readonly Customer[], now: number): FunnelStageMetric[] {
  const keys = VELOCITY_CONFIG.order;
  const reached = new Map<string, Set<string>>();
  const durations = new Map<string, number[]>();
  const overdue = new Map<string, number>();
  for (const k of keys) {
    reached.set(k, new Set());
    durations.set(k, []);
    overdue.set(k, 0);
  }
  const addSpan = (key: (typeof keys)[number], start: number, end: number) => {
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) durations.get(key)?.push(end - start);
  };
  for (const c of customers) {
    if (c.care_stage === CARE_STAGE_NURTURE) continue;
    const got = new Set<(typeof keys)[number]>(['new_lead']);
    const reg = newLeadStart(regAt(c));
    const first = firstCallAt(c);
    const qualifiedAt = parsed(c.qualified_at);
    const leadEnd = Number.isFinite(qualifiedAt) ? qualifiedAt : c.disqualified_at ? parsed(c.disqualified_at) : now;
    if (Number.isFinite(first) || !isQualified(c))
      addSpan('new_lead', reg, Number.isFinite(first) ? Math.min(first, leadEnd) : leadEnd);
    if (Number.isFinite(first) && first <= leadEnd) {
      got.add('approach');
      addSpan('approach', first, leadEnd);
    }
    if (isQualified(c)) {
      got.add('approach');
      const history = (Array.isArray(c.care_stage_history) ? c.care_stage_history : [])
        .filter((h) => h?.at && h.stage && !LEAD_ONLY_STAGES.includes(h.stage as (typeof LEAD_ONLY_STAGES)[number]))
        .sort((a, b) => (a?.at || '').localeCompare(b?.at || ''));
      const runs: { stage: string; at: number }[] = [];
      for (const item of history) {
        const stage = normStage(item?.stage) || '';
        if (runs.at(-1)?.stage === stage) continue;
        runs.push({ stage, at: parsed(item?.at) });
      }
      if (!runs.length) runs.push({ stage: normStage(c.care_stage) || '', at: qualifiedAt });
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        if (!run) continue;
        if (run.stage === CARE_STAGE_WON) {
          got.add('booking');
          continue;
        }
        const key = keys.find((phase) => (VELOCITY_CONFIG.phases[phase] as { stage?: string }).stage === run.stage);
        if (!key) continue;
        got.add(key);
        addSpan(key, run.at, runs[i + 1]?.at ?? now);
      }
      if (c.care_stage === CARE_STAGE_WON && !got.has('booking')) {
        got.add('booking');
      }
    }
    const maxIndex = Math.max(...keys.map((key, i) => (got.has(key) ? i : -1)));
    for (let i = 0; i <= maxIndex; i++) {
      const key = keys[i];
      if (key) reached.get(key)?.add(c.id);
    }
    const current = velocityStatus(c, now);
    if (current?.state === 'over') overdue.set(current.key, (overdue.get(current.key) || 0) + 1);
  }
  return keys.map((key, i) => {
    const current = reached.get(key)?.size || 0;
    const previousKey = i ? keys[i - 1] : undefined;
    const prior = previousKey ? reached.get(previousKey)?.size || 0 : null;
    const spans = durations.get(key) || [];
    return {
      key,
      label: VELOCITY_CONFIG.phases[key].label,
      reached: current,
      conversion:
        prior === null
          ? null
          : { numerator: current, denominator: prior, percent: ratio(current, prior), label: 'Chuyển giai đoạn' },
      averageDurationMs: spans.length ? spans.reduce((sum, value) => sum + value, 0) / spans.length : null,
      overdue: overdue.get(key) || 0,
    };
  });
}

export function weeklyPerformance(customers: readonly Customer[], now: number) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = monday.getTime(),
    previous = start - 7 * DAY;
  const activity = (a: number, b: number) => {
    const r = { leads: 0, calls: 0, talked: 0, qualified: 0, milestones: 0 };
    for (const c of customers) {
      if (regAt(c) >= a && regAt(c) < b) r.leads++;
      const q = parsed(c.qualified_at);
      if (q >= a && q < b) r.qualified++;
      for (const call of callAttemptsOf(c)) {
        const t = parsed(call.at);
        if (t >= a && t < b) {
          r.calls++;
          if (call.result === 'talked') r.talked++;
        }
      }
      if (
        (c.care_stage_history || []).some(
          (h) =>
            h &&
            ['Booking', 'Hỗ trợ hồ sơ', CARE_STAGE_BOOKING, CARE_STAGE_WON].includes(h.stage || '') &&
            parsed(h.at) >= a &&
            parsed(h.at) < b,
        )
      )
        r.milestones++;
    }
    return r;
  };
  return { current: activity(start, now + 1), previous: activity(previous, start), start, end: now };
}

export function sourceMetrics(customers: readonly Customer[]) {
  const groups = new Map<string, { numerator: number; denominator: number }>();
  for (const c of customers) {
    const keys = sourceListOf(c.source);
    for (const key of keys.length ? keys : ['?']) {
      const item = groups.get(key) || { numerator: 0, denominator: 0 };
      item.denominator++;
      if (isQualified(c)) item.numerator++;
      groups.set(key, item);
    }
  }
  return [...groups]
    .map(([key, m]) => ({
      key,
      label: key === '?' ? 'Chưa rõ' : SOURCES[key] || `Khác (${key})`,
      ...m,
      percent: ratio(m.numerator, m.denominator),
    }))
    .sort((a, b) => b.denominator - a.denominator || a.label.localeCompare(b.label));
}

/** Six legacy insight families with original thresholds and copy; only observed facts are emitted. */
export function dataInsights(customers: readonly Customer[], now: number): { items: Insight[]; pending: string[] } {
  const items: Insight[] = [];
  const pending: string[] = [];
  const slots = callSlots().map((slot) => ({ ...slot, n: 0, ok: 0 }));
  for (const c of customers)
    for (const a of callAttemptsOf(c)) {
      if (!a.result) continue;
      const key = slotOfTime(parsed(a.at));
      const s = slots.find((x) => x.key === key);
      if (s) {
        s.n++;
        if (a.result === 'talked') s.ok++;
      }
    }
  const qualifiedSlots = slots
    .filter((s) => s.n >= INSIGHT_THRESHOLDS.slotCalls)
    .sort((a, b) => b.ok / b.n - a.ok / a.n);
  const bestSlot = qualifiedSlots.at(0);
  const worstSlot = qualifiedSlots.at(-1);
  if (qualifiedSlots.length >= 2 && bestSlot && worstSlot) {
    const best = bestSlot;
    const worst = worstSlot;
    items.push({
      key: 'best-call-slot',
      title: `Gọi khung ${best.name.toLowerCase()} (${best.text}) nghe máy nhiều nhất: ${ratio(best.ok, best.n)}%`,
      evidence: `${best.ok}/${best.n} cuộc ở ${best.name.toLowerCase()} nghe máy; ${worst.name}: ${worst.ok}/${worst.n} (${ratio(worst.ok, worst.n)}%).`,
      numerator: best.ok,
      denominator: best.n,
    });
  } else pending.push(`khung giờ gọi (cần ≥ ${INSIGHT_THRESHOLDS.slotCalls} cuộc có kết quả ở ít nhất 2 khung)`);
  const fast = { n: 0, q: 0 },
    slow = { n: 0, q: 0 };
  for (const c of customers) {
    const start = regAt(c),
      first = firstCallAt(c);
    if (!Number.isFinite(start) || !Number.isFinite(first)) continue;
    const g = first - start <= HOUR ? fast : slow;
    g.n++;
    if (isQualified(c)) g.q++;
  }
  if (fast.n >= INSIGHT_THRESHOLDS.speedGroup && slow.n >= INSIGHT_THRESHOLDS.speedGroup)
    items.push({
      key: 'first-call-speed',
      title: `Gọi trong 1 giờ đầu: ${ratio(fast.q, fast.n)}% lên Tiềm năng · gọi muộn hơn: ${ratio(slow.q, slow.n)}%`,
      evidence: `${fast.q}/${fast.n} khách gọi sớm; ${slow.q}/${slow.n} khách gọi sau 1 giờ. Chênh lệch quan sát, chưa chứng minh nguyên nhân.`,
      numerator: fast.q,
      denominator: fast.n,
    });
  else pending.push(`tốc độ gọi (cần ≥ ${INSIGHT_THRESHOLDS.speedGroup} khách mỗi nhóm gọi trong / sau 1 giờ)`);
  const sources = sourceMetrics(customers)
    .filter((x) => x.key !== '?' && x.denominator >= INSIGHT_THRESHOLDS.channelLeads)
    .sort((a, b) => (b.percent || 0) - (a.percent || 0));
  const bestSource = sources.at(0);
  const worstSource = sources.at(-1);
  if (sources.length >= 2 && bestSource && worstSource) {
    const best = bestSource;
    const worst = worstSource;
    items.push({
      key: 'source-conversion',
      title: `Kênh ${best.label} có tỷ lệ Đạt cao nhất trong mẫu: ${best.percent}% Đạt`,
      evidence: `${best.numerator}/${best.denominator} khách. ${worst.label} thấp nhất: ${worst.numerator}/${worst.denominator} (${worst.percent}%).`,
      numerator: best.numerator,
      denominator: best.denominator,
    });
  } else pending.push(`kênh khách (cần ≥ ${INSIGHT_THRESHOLDS.channelLeads} khách ở ít nhất 2 kênh)`);
  const late = customers.filter(
    (c) => !isQualified(c) && !c.disqualified_at && !callAttemptsOf(c).length && now - regAt(c) > DAY,
  );
  if (late.length)
    items.push({
      key: 'new-lead-late',
      title: `${late.length} khách mới đăng ký hơn 24 giờ vẫn chưa được gọi`,
      evidence: `${late.length}/${customers.filter((c) => !isQualified(c) && !c.disqualified_at && !callAttemptsOf(c).length).length} khách mới chưa gọi quá 24 giờ.`,
    });
  const hotMin = SIGNALS_CONFIG.hotInterestMin;
  const hot = customers.filter(
    (c) =>
      isQualified(c) &&
      inFunnel(c) &&
      Number(c.interest_level || 0) >= hotMin &&
      now - (lastTouchMs(c) || now) >= SIGNALS_CONFIG.idleHotDays * DAY,
  );
  if (hot.length)
    items.push({
      key: 'hot-idle',
      title: `${hot.length} khách nóng (≥ ${hotMin}%) hơn ${SIGNALS_CONFIG.idleHotDays} ngày chưa liên hệ`,
      evidence: `${hot
        .slice(0, 3)
        .map((c) => c.full_name)
        .join(
          ', ',
        )}${hot.length > 3 ? '…' : ''} · ${hot.length}/${customers.filter((c) => isQualified(c) && inFunnel(c) && Number(c.interest_level || 0) >= hotMin).length} khách nóng.`,
    });
  const stuck = new Map<string, { count: number; total: number }>();
  for (const c of customers.filter((c) => isQualified(c) && inFunnel(c))) {
    const stage = normStage(c.care_stage) || '';
    // v1 analytics used the stage's stored entry timestamp (history was not consulted here).
    const at = parsed(c.care_stage_updated_at || c.qualified_at);
    if (Number.isFinite(at) && now - at >= INSIGHT_THRESHOLDS.stuckDays * DAY) {
      const m = stuck.get(stage) || { count: 0, total: 0 };
      m.count++;
      stuck.set(stage, m);
    }
  }
  const top = [...stuck].sort((a, b) => b[1].count - a[1].count)[0];
  if (top)
    items.push({
      key: 'stuck-stage',
      title: `${top[1].count} khách đứng yên ở bậc "${top[0]}" quá 3 tuần`,
      evidence: `${top[1].count}/${customers.filter((c) => isQualified(c) && normStage(c.care_stage) === top[0]).length} khách tại bậc ${top[0]} đã ở bậc ít nhất 21 ngày.`,
    });
  return { items, pending };
}
