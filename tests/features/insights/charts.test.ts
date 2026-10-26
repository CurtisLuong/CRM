import { describe, expect, it } from 'vitest';
import type { FunnelStageMetric } from '@/domain/metrics';
import {
  funnelChartData,
  funnelChartTitle,
  stageSlaChartData,
  weeklyChartData,
  weeklyChartTitle,
} from '@/features/insights/model';

describe('insight chart data', () => {
  it('uses domain conversion values for funnel retention labels', () => {
    const stages: FunnelStageMetric[] = [
      {
        key: 'lead',
        label: 'Đăng kí mới',
        reached: 20,
        conversion: null,
        averageDurationMs: null,
        overdue: 0,
      },
      {
        key: 'approach',
        label: 'Đang tiếp cận',
        reached: 10,
        conversion: { numerator: 10, denominator: 20, percent: 50, label: 'Chuyển giai đoạn' },
        averageDurationMs: null,
        overdue: 0,
      },
      {
        key: 'care',
        label: 'Đang chăm sóc',
        reached: 4,
        conversion: { numerator: 4, denominator: 10, percent: 40, label: 'Chuyển giai đoạn' },
        averageDurationMs: null,
        overdue: 0,
      },
    ];

    const data = funnelChartData(stages);

    expect(data).toEqual([
      { label: 'Đăng kí mới', value: 20, retention: null },
      { label: 'Đang tiếp cận', value: 10, retention: 50 },
      { label: 'Đang chăm sóc', value: 4, retention: 40 },
    ]);
    expect(funnelChartTitle(data)).toBe('Rơi nhiều nhất ở bậc Đang chăm sóc · giữ lại 40%');
  });

  it('không nói "rơi" khi mọi bậc giữ đủ 100%', () => {
    expect(
      funnelChartTitle([
        { label: 'Đăng kí mới', value: 5, retention: null },
        { label: 'Đang tiếp cận', value: 5, retention: 100 },
      ]),
    ).toBe('Khách đã tới từng bậc trong phễu');
  });

  it('prepares paired current and previous week values without recomputing metrics', () => {
    const data = weeklyChartData({
      current: { leads: 4, calls: 8, talked: 3, qualified: 1, milestones: 0 },
      previous: { leads: 2, calls: 5, talked: 2, qualified: 1, milestones: 1 },
      start: 0,
      end: 1,
    });

    expect(data.find((row) => row.label === 'Cuộc gọi')).toEqual({ label: 'Cuộc gọi', value: 8, previous: 5 });
    expect(weeklyChartTitle(data)).toBe('Cuộc gọi tăng 3 so với tuần trước');
  });

  it('maps the three domain SLA buckets into a stacked chart row', () => {
    expect(
      stageSlaChartData([
        {
          key: 'care',
          label: 'Đang chăm sóc',
          total: 10,
          targetExceeded: 3,
          limitExceeded: 2,
          customerIds: [],
          definition: '',
        },
      ]),
    ).toEqual([{ label: 'Đang chăm sóc', total: 10, onTime: 5, near: 3, overdue: 2 }]);
  });
});
