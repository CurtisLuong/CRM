import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { campaignCostMetrics, marketingCohorts, marketingDimensions } from '@/domain/metrics/marketing';

const customer = (patch: Record<string, unknown>): Customer =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Khách',
    phone: '0900000000',
    source: ['facebook_ads'],
    campaign: 'Campaign A',
    registered_at: '2026-08-01T00:00:00.000Z',
    care_stage: 'Đăng kí mới',
    ...patch,
  }) as unknown as Customer;

describe('marketing metrics', () => {
  it('groups funnel by source, campaign and linked form without counting an unlinked form as a customer', () => {
    const rows = [
      customer({
        id: 'c1',
        qualified_at: '2026-08-02',
        care_stage: 'Booking & Làm hồ sơ',
        care_stage_history: [
          { stage: 'Xem dự án', at: '2026-08-02' },
          { stage: 'Booking & Làm hồ sơ', at: '2026-08-04' },
        ],
      }),
      customer({
        id: 'c2',
        source: ['website'],
        campaign: null,
        web_last_campaign: 'Landing Q3',
        registered_at: '2026-08-03',
      }),
    ];
    const result = marketingDimensions(rows, [
      { customer_id: 'c1', form_name: 'Form HP', campaign_name: 'Campaign A', created_time: '2026-08-01' },
      { customer_id: null, form_name: 'Orphan form', campaign_name: null, created_time: '2026-08-01' },
    ]);
    expect(result.source.map((item) => [item.key, item.leadCount])).toEqual([
      ['facebook_ads', 1],
      ['website', 1],
    ]);
    expect(result.campaign.map((item) => item.key)).toContain('Landing Q3');
    expect(result.form).toHaveLength(2);
    expect(
      result.form.find((item) => item.key === 'Form HP')?.funnel.find((step) => step.key === 'booking')?.numerator,
    ).toBe(1);
    expect(result.form.some((item) => item.key === 'Orphan form')).toBe(false);
  });

  it('cohort conversion uses only registrations with the full observation window', () => {
    const rows = [
      customer({
        id: 'mature',
        registered_at: '2026-01-01T00:00:00.000Z',
        care_stage: 'Kí HĐMB',
        care_stage_history: [{ stage: 'Booking & Làm hồ sơ', at: '2026-01-10' }],
      }),
      customer({ id: 'recent', registered_at: '2026-01-25T00:00:00.000Z', care_stage: 'Đang chăm sóc' }),
    ];
    const [cohort] = marketingCohorts(rows, Date.parse('2026-02-01T00:00:00.000Z'), 30);
    expect(cohort?.leadCount).toBe(2);
    expect(cohort?.matureCount).toBe(1);
    expect(cohort?.booking).toEqual({ numerator: 1, denominator: 1, percent: 100 });
    expect(cohort?.signed).toEqual({ numerator: 1, denominator: 1, percent: 100 });
  });

  it('matches cost records to source, campaign and date before calculating cost per outcome', () => {
    const rows = [
      customer({
        id: 'qualified',
        registered_at: '2026-09-02T12:00:00.000Z',
        qualified_at: '2026-09-03',
        care_stage: 'Booking & Làm hồ sơ',
      }),
      customer({ id: 'other-campaign', campaign: 'Campaign B', registered_at: '2026-09-03T12:00:00.000Z' }),
    ];
    const metrics = campaignCostMetrics(
      rows,
      [
        {
          id: 'cost1',
          source: 'facebook_ads',
          campaign: 'Campaign A',
          period_start: '2026-09-01',
          period_end: '2026-09-30',
          amount: '1000',
          note: null,
        },
      ],
      Date.parse('2026-10-01T00:00:00.000Z'),
    );
    expect(metrics[0]).toMatchObject({
      leadCount: 1,
      qualifiedCount: 1,
      bookingCount: 1,
      cpl: 1000,
      costPerQualified: 1000,
      costPerBooking: 1000,
    });
  });
});
