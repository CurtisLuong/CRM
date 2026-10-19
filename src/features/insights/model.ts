import { CARE_STAGE_BOOKING, CARE_STAGE_DROPPED, CARE_STAGE_NURTURE, CARE_STAGE_WON } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { careMetrics, dataInsights, funnelMetrics, sourceMetrics, weeklyPerformance } from '@/domain/metrics';
import { fullCareMetrics } from '@/domain/metrics/care';

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

const fmtN = (n: number) => n.toLocaleString('vi-VN');

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
