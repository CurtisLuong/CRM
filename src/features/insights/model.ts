import { CARE_STAGE_BOOKING, CARE_STAGE_DROPPED, CARE_STAGE_NURTURE, CARE_STAGE_WON } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import {
  careMetrics,
  dataInsights,
  type FunnelStageMetric,
  funnelMetrics,
  sourceMetrics,
  weeklyPerformance,
} from '@/domain/metrics';
import { CARE_METRIC_CONFIG, fullCareMetrics } from '@/domain/metrics/care';

export function insightReport(customers: readonly Customer[], now: number) {
  return {
    care: careMetrics(customers, now),
    funnel: funnelMetrics(customers, now),
    insights: dataInsights(customers, now),
    week: weeklyPerformance(customers, now),
    sources: sourceMetrics(customers),
    outside: {
      nurture: customers.filter((c) => c.care_stage === CARE_STAGE_NURTURE).length,
      dropped: customers.filter((c) => c.care_stage === CARE_STAGE_DROPPED || !!c.disqualified_at).length,
      won: customers.filter((c) => c.care_stage === CARE_STAGE_WON).length,
      booking: customers.filter(
        (c) => c.care_stage === CARE_STAGE_BOOKING || c.care_stage === 'Booking' || c.care_stage === 'Hỗ trợ hồ sơ',
      ).length,
    },
  };
}

// ── Hiệu quả v3 (D-023): 4 con số đầu trang. Chỉ đọc chỉ số domain có sẵn; không tự tính lại. ──

export type HeadlineTile = {
  key: 'firstCall' | 'contact' | 'rhythm' | 'milestones';
  label: string;
  value: number | null;
  unit?: string;
  sub: string;
  trend?: { dir: 'up' | 'down' | 'flat'; text: string; tone: 'good' | 'bad' | 'neutral' };
  /** id khối chi tiết để cuộn tới khi bấm ô. */
  target: string;
};

/** Flat trends already have a plain-text comparison in the tile subtitle. */
export function headlineDelta(trend: HeadlineTile['trend']) {
  if (!trend || trend.dir === 'flat') return undefined;
  return { dir: trend.dir, text: trend.text, good: trend.tone !== 'bad' };
}

const fmtN = (n: number) => n.toLocaleString('vi-VN');

/** Quan sát hiện ngay dưới 4 ô; phần dư nằm trong khối chi tiết (M5-03). */
export function splitInsights<T>(items: readonly T[], limit = 3): { top: T[]; rest: T[] } {
  return { top: items.slice(0, limit), rest: items.slice(limit) };
}

/** Trung vị ms → [số, đơn vị] dễ đọc; null → [null, undefined]. */
export function durationParts(ms: number | null): [number | null, string | undefined] {
  if (ms == null || !Number.isFinite(ms)) return [null, undefined];
  const min = Math.round(ms / 60_000);
  if (min < 60) return [min, 'phút'];
  const h = Math.round((min / 60) * 10) / 10;
  return [h, 'giờ'];
}

export function headlineTiles(customers: readonly Customer[], now: number): HeadlineTile[] {
  const m = fullCareMetrics(customers, now);
  const week = weeklyPerformance(customers, now);
  const [fcValue, fcUnit] = durationParts(m.firstCall.medianMs);
  const cur = week.current.milestones;
  const prev = week.previous.milestones;
  return [
    {
      key: 'firstCall',
      label: 'Gọi khách mới',
      value: fcValue,
      unit: fcUnit,
      sub: `trung vị · ${fmtN(m.firstCall.called)}/${fmtN(m.firstCall.eligible)} khách đã gọi`,
      target: 'care-detail',
    },
    {
      key: 'contact',
      label: 'Nói chuyện được',
      value: m.contactRate.percent,
      unit: '%',
      sub: `${fmtN(m.contactRate.numerator)}/${fmtN(m.contactRate.denominator)} khách mới đã gọi`,
      target: 'care-detail',
    },
    {
      key: 'rhythm',
      label: 'Chăm đúng nhịp',
      value: m.touchRhythm.percent,
      unit: '%',
      sub: `${fmtN(m.touchRhythm.numerator)}/${fmtN(m.touchRhythm.denominator)} khách trong phễu`,
      target: 'care-detail',
    },
    {
      key: 'milestones',
      label: 'Booking / Kí tuần này',
      value: cur,
      sub: `tuần trước ${fmtN(prev)}`,
      trend:
        cur === prev
          ? { dir: 'flat', text: 'bằng tuần trước', tone: 'neutral' }
          : cur > prev
            ? { dir: 'up', text: `hơn ${fmtN(cur - prev)}`, tone: 'good' }
            : { dir: 'down', text: `kém ${fmtN(prev - cur)}`, tone: 'bad' },
      target: 'funnel-detail',
    },
  ];
}

/** Chart rows keep the funnel conversion already calculated by domain metrics. */
export function funnelChartData(stages: readonly FunnelStageMetric[]) {
  return stages.map((stage) => ({
    label: stage.label,
    value: stage.reached,
    retention: stage.conversion?.percent ?? null,
  }));
}

export function funnelChartTitle(data: ReturnType<typeof funnelChartData>) {
  const weakest = data
    .filter((stage) => stage.retention != null)
    .reduce<(typeof data)[number] | null>(
      (current, stage) => (current == null || (stage.retention ?? 0) < (current.retention ?? 0) ? stage : current),
      null,
    );
  // Mọi bậc giữ đủ 100% thì không có chỗ nào "rơi" để nói.
  return weakest && (weakest.retention ?? 100) < 100
    ? `Rơi nhiều nhất ở bậc ${weakest.label} · giữ lại ${weakest.retention}%`
    : 'Khách đã tới từng bậc trong phễu';
}

const WEEK_METRICS = [
  ['Khách mới', 'leads'],
  ['Cuộc gọi', 'calls'],
  ['Nói chuyện', 'talked'],
  ['Đạt', 'qualified'],
  ['Booking / Kí', 'milestones'],
] as const;

export function weeklyChartData(week: ReturnType<typeof weeklyPerformance>) {
  return WEEK_METRICS.map(([label, key]) => ({
    label,
    value: week.current[key],
    previous: week.previous[key],
  }));
}

export function weeklyChartTitle(data: ReturnType<typeof weeklyChartData>) {
  const largestChange = data.reduce<(typeof data)[number] | null>((current, row) => {
    if (!current || Math.abs(row.value - row.previous) > Math.abs(current.value - current.previous)) return row;
    return current;
  }, null);
  if (!largestChange || (largestChange.value === 0 && largestChange.previous === 0))
    return 'Chưa ghi nhận hoạt động trong hai tuần';
  const change = largestChange.value - largestChange.previous;
  if (change === 0) return `${largestChange.label}: ${largestChange.value} · ngang tuần trước`;
  return `${largestChange.label} ${change > 0 ? 'tăng' : 'giảm'} ${fmtN(Math.abs(change))} so với tuần trước`;
}

type FullCare = ReturnType<typeof fullCareMetrics>;

export function slotChartData(slots: FullCare['slots']) {
  return slots.map((slot) => ({
    label: slot.name,
    value: slot.percent,
    numerator: slot.numerator,
    denominator: slot.denominator,
    percent: slot.percent,
  }));
}

export function slotChartTitle(data: ReturnType<typeof slotChartData>) {
  const best = data
    .filter((slot) => slot.percent != null)
    .reduce<(typeof data)[number] | null>(
      (current, slot) => (current == null || (slot.percent ?? 0) > (current.percent ?? 0) ? slot : current),
      null,
    );
  if (!best) return 'Nghe máy theo khung trong 30 ngày';
  const sample = best.denominator < CARE_METRIC_CONFIG.slotSample ? ` · mẫu nhỏ, ${fmtN(best.denominator)} cuộc` : '';
  return `Khung ${best.label} nghe máy cao nhất: ${best.percent}%${sample}`;
}

export function stageSlaChartData(stages: FullCare['stages']) {
  return stages.map((stage) => ({
    label: stage.label,
    total: stage.total,
    // warn/over của slaStatus loại trừ nhau → 3 nhóm cộng đúng tổng.
    onTime: stage.total - stage.targetExceeded - stage.limitExceeded,
    near: stage.targetExceeded,
    overdue: stage.limitExceeded,
  }));
}

export function stageSlaChartTitle(data: ReturnType<typeof stageSlaChartData>) {
  const overdue = data.reduce<(typeof data)[number] | null>(
    (current, row) => (row.overdue > (current?.overdue ?? 0) ? row : current),
    null,
  );
  if (overdue) return `${overdue.label}: ${fmtN(overdue.overdue)} khách quá hạn mức SLA`;
  const near = data.reduce<(typeof data)[number] | null>(
    (current, row) => (row.near > (current?.near ?? 0) ? row : current),
    null,
  );
  return near
    ? `${near.label}: ${fmtN(near.near)} khách đã qua mục tiêu SLA`
    : 'Tuổi bậc so với mục tiêu và hạn mức SLA';
}

export function touchConversionChartData(buckets: FullCare['conversion']) {
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.percent,
    numerator: bucket.numerator,
    denominator: bucket.denominator,
    percent: bucket.percent,
  }));
}

export function touchConversionChartTitle(data: ReturnType<typeof touchConversionChartData>) {
  const best = data
    .filter((bucket) => bucket.percent != null)
    .reduce<(typeof data)[number] | null>(
      (current, bucket) => (current == null || (bucket.percent ?? 0) > (current.percent ?? 0) ? bucket : current),
      null,
    );
  return best
    ? `Tỉ lệ Đạt cao nhất trong mẫu: ${best.label} · ${best.percent}% (${best.numerator}/${best.denominator})`
    : 'Chuyển đổi theo số lần chạm trong cohort 90 ngày';
}

export function sourceChartData(sources: ReturnType<typeof sourceMetrics>) {
  return sources.map((source) => ({
    label: source.label,
    value: source.denominator,
    numerator: source.numerator,
    denominator: source.denominator,
    percent: source.percent,
  }));
}

export function sourceChartTitle(data: ReturnType<typeof sourceChartData>) {
  const best = data
    .filter((source) => source.percent != null)
    .reduce<(typeof data)[number] | null>(
      (current, source) => (current == null || (source.percent ?? 0) > (current.percent ?? 0) ? source : current),
      null,
    );
  return best
    ? `Đạt cao nhất theo mẫu: ${best.label} · ${best.percent}% (${best.numerator}/${best.denominator})`
    : 'Tỉ trọng và chuyển đổi theo nguồn khách';
}
