import { CARE_STAGE_BOOKING, CARE_STAGE_DROPPED, CARE_STAGE_NURTURE, CARE_STAGE_WON } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { careMetrics, dataInsights, funnelMetrics, sourceMetrics, weeklyPerformance } from '@/domain/metrics';

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
