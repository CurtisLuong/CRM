import { describe, expect, it } from 'vitest';
import { headlineDelta, sourceChartTitle, stageSlaChartData } from './model';

describe('insights review corrections', () => {
  it('does not render a directional delta for a flat trend', () => {
    expect(headlineDelta({ dir: 'flat', text: 'bằng tuần trước', tone: 'neutral' })).toBeUndefined();
    expect(headlineDelta({ dir: 'up', text: 'hơn 2', tone: 'good' })).toEqual({
      dir: 'up',
      text: 'hơn 2',
      good: true,
    });
  });

  it('maps exclusive SLA warn/over counts into parts that add up to the stage total', () => {
    const stages = [{ label: 'Đang chăm sóc', total: 8, targetExceeded: 3, limitExceeded: 2 }] as Parameters<
      typeof stageSlaChartData
    >[0];

    expect(stageSlaChartData(stages)).toEqual([{ label: 'Đang chăm sóc', total: 8, onTime: 3, near: 3, overdue: 2 }]);
    expect(stageSlaChartData(stages).every((row) => row.onTime + row.near + row.overdue === row.total)).toBe(true);
  });

  it('keeps each source conversion tied to that source’s own sample', () => {
    expect(sourceChartTitle([{ label: 'Facebook', value: 8, numerator: 2, denominator: 8, percent: 25 }])).toContain(
      'Facebook · 25% (2/8)',
    );
  });
});
