import { LEAD_DROP_REASONS } from '@/config/reasons';
import { SOURCES } from '@/config/sources';
import { CARE_STAGE_BOOKING, CARE_STAGE_WON } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { isQualified, normStage, sourceListOf } from '@/domain/customer';

export type MarketingLeadLog = {
  customer_id: string | null;
  form_name: string | null;
  campaign_name: string | null;
  created_time: string | null;
};
export type CampaignCost = {
  id: string;
  source: string | null;
  campaign: string | null;
  period_start: string;
  period_end: string | null;
  amount: number | string;
  note: string | null;
  updated_at?: string;
};
export type MarketingDimension = 'source' | 'campaign' | 'form';

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const stamp = (value: unknown) => {
  const parsed = Date.parse(asText(value));
  return Number.isFinite(parsed) ? parsed : null;
};
const RATE_STAGES = [
  { key: 'lead', label: 'Lead', reached: () => true },
  {
    key: 'valid',
    label: 'Hợp lệ',
    reached: (c: Customer) => !c.disqualified_at || !['so_sai', 'pha_campaign'].includes(asText(c.disqualify_reason)),
  },
  {
    key: 'contacted',
    label: 'Liên lạc được',
    reached: (c: Customer) =>
      Array.isArray(c.call_attempts) && c.call_attempts.some((a) => asObject(a).result === 'talked'),
  },
  { key: 'qualified', label: 'Đạt', reached: isQualified },
  { key: 'viewed', label: 'Xem dự án', reached: (c: Customer) => reachedStage(c, 'Xem dự án') },
  { key: 'booking', label: 'Booking', reached: (c: Customer) => reachedStage(c, CARE_STAGE_BOOKING) },
  { key: 'signed', label: 'Ký HĐMB', reached: (c: Customer) => reachedStage(c, CARE_STAGE_WON) },
] as const;

function reachedStage(customer: Customer, stage: string) {
  const target = normStage(stage);
  if (normStage(customer.care_stage) === target) return true;
  return (Array.isArray(customer.care_stage_history) ? customer.care_stage_history : []).some(
    (entry) => entry && normStage(entry.stage) === target,
  );
}

function milestoneAt(customer: Customer, key: string): number | null {
  if (key === 'qualified') return stamp(customer.qualified_at);
  if (key === 'contacted') {
    const times = (Array.isArray(customer.call_attempts) ? customer.call_attempts : [])
      .filter((attempt) => attempt && asObject(attempt).result === 'talked')
      .map((attempt) => stamp(asObject(attempt).at))
      .filter((at): at is number => at != null);
    return times.length ? Math.min(...times) : null;
  }
  const stageByKey: Record<string, string> = {
    viewed: 'Xem dự án',
    booking: CARE_STAGE_BOOKING,
    signed: CARE_STAGE_WON,
  };
  const target = stageByKey[key];
  if (!target) return null;
  const history = (Array.isArray(customer.care_stage_history) ? customer.care_stage_history : [])
    .filter((entry) => entry && normStage(entry.stage) === normStage(target))
    .map((entry) => stamp(entry?.at))
    .filter((at): at is number => at != null)
    .sort((a, b) => a - b);
  if (history.length) return history[0] ?? null;
  if (normStage(customer.care_stage) === normStage(target)) return stamp(customer.care_stage_updated_at);
  return null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return Math.round(value * 10) / 10;
}

export function marketingDimensions(customers: readonly Customer[], logs: readonly MarketingLeadLog[] = []) {
  const logsByCustomer = new Map<string, MarketingLeadLog[]>();
  for (const log of logs) {
    if (!log.customer_id) continue;
    const current = logsByCustomer.get(log.customer_id) || [];
    current.push(log);
    logsByCustomer.set(log.customer_id, current);
  }
  const rows = customers.map((customer) => {
    const extra = customer as Customer & Record<string, unknown>;
    const web = asObject(extra.web_utm);
    const logsForCustomer = logsByCustomer.get(customer.id) || [];
    const latestLog = [...logsForCustomer].sort((a, b) =>
      (b.created_time || '').localeCompare(a.created_time || ''),
    )[0];
    const sources = sourceListOf(customer.source);
    const sourceKeys = sources.length ? sources : ['?'];
    const campaign =
      asText(customer.campaign) ||
      asText(extra.web_last_campaign) ||
      asText(extra.web_first_campaign) ||
      asText(latestLog?.campaign_name) ||
      '?';
    const form = asText(latestLog?.form_name) || asText(extra.web_last_form) || asText(web.form_name) || '?';
    return { customer, sourceKeys, campaign, form, registeredAt: stamp(customer.registered_at || customer.created_at) };
  });

  const group = (dimension: MarketingDimension) => {
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const keys = dimension === 'source' ? row.sourceKeys : [dimension === 'campaign' ? row.campaign : row.form];
      for (const key of new Set(keys)) grouped.set(key, [...(grouped.get(key) || []), row]);
    }
    return [...grouped.entries()]
      .map(([key, items]) => {
        const funnel = RATE_STAGES.map((stage) => {
          const reached = items.filter(({ customer }) => stage.reached(customer));
          const durations = reached
            .map(({ customer, registeredAt }) => {
              const at = milestoneAt(customer, stage.key);
              return at != null && registeredAt != null && at >= registeredAt ? (at - registeredAt) / 86_400_000 : null;
            })
            .filter((days): days is number => days != null);
          return {
            key: stage.key,
            label: stage.label,
            numerator: reached.length,
            denominator: items.length,
            medianDays: stage.key === 'lead' || stage.key === 'valid' ? null : median(durations),
            durationNumerator: durations.length,
            durationDenominator: reached.length,
          };
        });
        return {
          key,
          label:
            dimension === 'source'
              ? key === '?'
                ? 'Chưa rõ'
                : SOURCES[key] || `Khác (${key})`
              : key === '?'
                ? 'Chưa rõ'
                : key,
          leadCount: items.length,
          funnel,
          reasons: reasonBreakdown(items.map(({ customer }) => customer)),
        };
      })
      .sort((a, b) => b.leadCount - a.leadCount || a.label.localeCompare(b.label, 'vi'));
  };

  return { source: group('source'), campaign: group('campaign'), form: group('form'), rows };
}

function reasonBreakdown(customers: readonly Customer[]) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const customer of customers) {
    if (!customer.disqualified_at) continue;
    const reason = asText(customer.disqualify_reason) || 'unknown';
    counts.set(reason, (counts.get(reason) || 0) + 1);
    total += 1;
  }
  return [...counts].map(([reason, numerator]) => ({
    reason: LEAD_DROP_REASONS[reason] || `Khác (${reason})`,
    code: reason,
    numerator,
    denominator: total,
  }));
}

export function marketingCohorts(customers: readonly Customer[], now: number, windowDays = 30) {
  const groups = new Map<string, Customer[]>();
  for (const customer of customers) {
    const at = stamp(customer.registered_at || customer.created_at);
    if (at == null) continue;
    const date = new Date(at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    groups.set(key, [...(groups.get(key) || []), customer]);
  }
  const matureMs = windowDays * 86_400_000;
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, members]) => {
      const mature = members.filter((customer) => {
        const at = stamp(customer.registered_at || customer.created_at);
        return at != null && now - at >= matureMs;
      });
      const booking = mature.filter(
        (customer) => reachedStage(customer, CARE_STAGE_BOOKING) || reachedStage(customer, CARE_STAGE_WON),
      ).length;
      const won = mature.filter((customer) => reachedStage(customer, CARE_STAGE_WON)).length;
      return {
        period,
        leadCount: members.length,
        matureCount: mature.length,
        booking: {
          numerator: booking,
          denominator: mature.length,
          percent: mature.length ? Math.round((booking * 100) / mature.length) : null,
        },
        signed: {
          numerator: won,
          denominator: mature.length,
          percent: mature.length ? Math.round((won * 100) / mature.length) : null,
        },
        ready: mature.length === members.length,
      };
    });
}

export function campaignCostMetrics(customers: readonly Customer[], costs: readonly CampaignCost[], now: number) {
  return costs
    .filter((cost) => !cost.period_end || cost.period_end >= cost.period_start)
    .map((cost) => {
      const start = Date.parse(`${cost.period_start}T00:00:00`);
      const end = Date.parse(`${cost.period_end || cost.period_start}T23:59:59.999`);
      const matching = customers.filter((customer) => {
        const registered = stamp(customer.registered_at || customer.created_at);
        const sources = sourceListOf(customer.source);
        const campaign =
          asText(customer.campaign) ||
          asText((customer as Customer & Record<string, unknown>).web_last_campaign) ||
          asText((customer as Customer & Record<string, unknown>).web_first_campaign);
        return (
          registered != null &&
          registered >= start &&
          registered <= end &&
          (!cost.source || sources.includes(cost.source)) &&
          (!cost.campaign || campaign === cost.campaign)
        );
      });
      const qualified = matching.filter(isQualified).length;
      const booking = matching.filter(
        (customer) => reachedStage(customer, CARE_STAGE_BOOKING) || reachedStage(customer, CARE_STAGE_WON),
      ).length;
      const amount = Number(cost.amount) || 0;
      const elapsed = Number.isFinite(end) && now >= end;
      return {
        ...cost,
        amount,
        leadCount: matching.length,
        qualifiedCount: qualified,
        bookingCount: booking,
        cpl: matching.length ? Math.round(amount / matching.length) : null,
        costPerQualified: qualified ? Math.round(amount / qualified) : null,
        costPerBooking: booking ? Math.round(amount / booking) : null,
        periodEnded: elapsed,
      };
    })
    .sort((a, b) => b.period_start.localeCompare(a.period_start));
}
