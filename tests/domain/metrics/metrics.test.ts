import { describe, expect, it } from 'vitest';
import { CARE_STAGE_NURTURE } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { careMetrics, dataInsights, funnelMetrics, sourceMetrics, weeklyPerformance } from '@/domain/metrics';
import { fixture, golden, loadCustomers } from '../deadlines/golden';

const now = Date.parse(fixture.now);
const owned = () => loadCustomers().filter((c) => c.owner_id === fixture.users.me && !c.archived_at);

describe('T3.13 metrics', () => {
  it('matches the four legacy care metrics captured in T0.4 dashboard golden', () => {
    const data = careMetrics(owned(), now);
    const expected = golden<{ relationshipHealth: { values: string[]; labels: string[]; sources: string[] } }>(
      'dashboard',
    ).relationshipHealth;
    expect([
      `${data.talked.percent}%`,
      `${data.covered.percent}%`,
      String(data.overdue.numerator),
      format(data.firstCallMedianMs),
    ]).toEqual(expected.values);
    expect([data.talked.label, data.covered.label, data.overdue.label, data.firstCallMedian.label]).toEqual(
      expected.labels,
    );
    expect(`${data.talked.numerator}/${data.talked.denominator} khách có ít nhất 1 cuộc gọi “Nói chuyện được”`).toBe(
      expected.sources[0],
    );
    expect(`${data.covered.numerator}/${data.covered.denominator} khách trong phễu có lịch hẹn hoặc việc đang mở`).toBe(
      expected.sources[1],
    );
    expect(`${data.firstCallMedian.numerator} khách có giờ đăng ký và cuộc gọi đầu hợp lệ`).toBe(expected.sources[3]);
  });

  it('matches the v1 dashboard insight order and pending thresholds without editing golden', () => {
    const result = dataInsights(owned(), now);
    const expected = golden<{ analyticsInsights: { titles: string[]; pending: string[] } }>(
      'dashboard',
    ).analyticsInsights;
    expect(result.items.map((x) => x.title)).toEqual(expected.titles);
    const pendingCopy = expected.pending[0]?.split('Cần thêm dữ liệu: ')[1]?.replace(/\.$/, '') || '';
    expect(result.pending).toEqual(pendingCopy ? pendingCopy.split(' · ') : []);
    expect(result.items.every((x) => x.evidence.length > 0)).toBe(true);
  });

  it('emits the six v1 observation families only when their data and thresholds are present', () => {
    const people = Array.from({ length: 20 }, (_, index) => {
      const fast = index < 10;
      const callAt = at(-2, fast ? 9 : 11, 45);
      const registeredAt = at(-2, fast ? 9 : 8, 45);
      return {
        id: `metric-${index}`,
        owner_id: fixture.users.me,
        full_name: `Khách ${index}`,
        phone: `0900000${String(index).padStart(3, '0')}`,
        source: [index < 10 ? 'facebook_ads' : 'website'],
        care_stage: fast || index < 12 ? 'Đang chăm sóc' : 'Đăng kí mới',
        qualified_at: fast || index < 12 ? at(-1) : null,
        registered_at: registeredAt,
        created_at: registeredAt,
        care_stage_updated_at: at(-1),
        call_attempts: [{ at: callAt, result: 'talked' }],
        next_tasks: [],
      } as unknown as Customer;
    });
    people.push({
      id: 'metric-hot-stuck',
      owner_id: fixture.users.me,
      full_name: 'Khách nóng cũ',
      phone: '0900000999',
      source: ['facebook_ads'],
      care_stage: 'Đang chăm sóc',
      qualified_at: at(-40),
      registered_at: at(-45),
      created_at: at(-45),
      care_stage_updated_at: at(-30),
      interest_level: 90,
      call_attempts: [],
      next_tasks: [],
    } as unknown as Customer);
    people.push({
      id: 'metric-late',
      owner_id: fixture.users.me,
      full_name: 'Khách mới trễ',
      phone: '0900000998',
      source: ['website'],
      care_stage: 'Đăng kí mới',
      registered_at: at(-2),
      created_at: at(-2),
      call_attempts: [],
      next_tasks: [],
    } as unknown as Customer);

    const result = dataInsights(people, now);
    expect(result.items.map((x) => x.key)).toEqual([
      'best-call-slot',
      'first-call-speed',
      'source-conversion',
      'new-lead-late',
      'hot-idle',
      'stuck-stage',
    ]);
    expect(result.items.every((x) => x.evidence.length > 0)).toBe(true);
    expect(result.pending).toEqual([]);
  });

  it('counts legacy and current source codes on the same v1 channels', () => {
    const result = sourceMetrics(owned());
    expect(result.reduce((n, x) => n + x.denominator, 0)).toBeGreaterThanOrEqual(new Set(owned()).size);
    expect(result.some((x) => x.key === 'facebook_ads')).toBe(true);
    expect(result.some((x) => x.key === 'website')).toBe(true);
  });

  it('keeps nurture and closed milestones outside current pipeline while preserving stage reach', () => {
    const rows = funnelMetrics(owned(), now);
    expect(rows.map((x) => x.key)).toEqual(['new_lead', 'approach', 'care', 'visit', 'booking']);
    expect(rows.every((x, i) => !i || x.reached <= (rows[i - 1]?.reached ?? x.reached))).toBe(true);
    expect(rows.every((x) => x.reached >= 0 && x.overdue >= 0)).toBe(true);
  });

  it('labels current stage duration as an average when durations are skewed', () => {
    const durations = [1, 1, 10];
    const rows = durations.map((days, index) => {
      const entered = at(-days);
      return {
        id: `duration-${index}`,
        owner_id: fixture.users.me,
        full_name: `Khách ${index}`,
        phone: `090000000${index}`,
        care_stage: 'Đang chăm sóc',
        qualified_at: entered,
        registered_at: at(-30),
        care_stage_history: [{ stage: 'Đang chăm sóc', at: entered, note: null }],
      } as unknown as Customer;
    });

    const care = funnelMetrics(rows, now).find((stage) => stage.key === 'care');
    const expectedMean = durations.reduce((sum, days) => sum + now - Date.parse(at(-days)), 0) / durations.length;
    const median = now - Date.parse(at(-1));
    expect(care?.averageDurationMs).toBe(expectedMean);
    expect(care?.averageDurationMs).not.toBe(median);
  });

  it('uses calendar weeks and the existing call/stage-history records', () => {
    const result = weeklyPerformance(owned(), now);
    expect(result.start).toBeLessThan(now);
    expect(result.current.calls).toBeGreaterThanOrEqual(result.current.talked);
    expect(result.previous.calls).toBeGreaterThanOrEqual(result.previous.talked);
  });

  it('does not treat out-of-funnel stages as current pipeline records', () => {
    const outside = owned().filter((x) => x.care_stage === CARE_STAGE_NURTURE);
    expect(outside.length).toBeGreaterThan(0);
    expect(funnelMetrics(outside, now).reduce((n, x) => n + x.reached, 0)).toBe(0);
  });
});

function format(ms: number | null) {
  if (ms === null) return '—';
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes} phút` : `${Math.round(minutes / 60)} giờ`;
}

function at(days: number, hour = 9, minute = 0) {
  const value = new Date(now);
  value.setDate(value.getDate() + days);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}
