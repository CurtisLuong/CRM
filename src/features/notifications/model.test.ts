import { describe, expect, it } from 'vitest';
import { SIGNALS_CONFIG } from '@/config/signals';
import type { Signal } from '@/domain/signals';
import { snoozeSignalState } from './model';

const makeSignal = (id: string, fingerprint = `fp-${id}`): Signal => ({
  id,
  rule: 'S1',
  customerId: 'customer-1',
  priority: 'P1',
  title: id,
  reason: 'Lý do',
  evidence: [],
  actions: [],
  dedupeKey: id,
  fingerprint,
  sort: [],
});

describe('snoozeSignalState', () => {
  const now = new Date(2026, 9, 29, 10).getTime();

  it('ghi đúng mốc 2h, 4h, 8h và 1 ngày theo giờ cố định', () => {
    const expectedHours = [12, 14, 18, 10];
    for (const [index, duration] of SIGNALS_CONFIG.snoozeDurations.entries()) {
      const result = snoozeSignalState({}, [makeSignal('primary')], duration.milliseconds, now);
      const expected = new Date(2026, 9, index === 3 ? 30 : 29, expectedHours[index]).getTime();
      expect(result.until).toBe(expected);
      expect(result.state.signals?.primary?.snoozedUntil).toBe(expected);
    }
  });

  it('hoãn cả tín hiệu phụ và hoàn tác lại trạng thái cũ, kể cả mục chưa tồn tại', () => {
    const parent = { ...makeSignal('parent'), secondaryReasons: [makeSignal('secondary')] };
    const before = { signals: { parent: { fingerprint: 'old', hidden: true } } };
    const result = snoozeSignalState(before, [parent], SIGNALS_CONFIG.snoozeDurations[2].milliseconds, now);

    // Mục ẩn cũ khác fingerprint đã hết hiệu lực: bấm hoãn phải ghi mục hoãn mới, Hoàn tác trả lại mục cũ.
    expect(result.state.signals?.parent).toEqual({
      fingerprint: parent.fingerprint,
      snoozedUntil: now + 8 * 60 * 60 * 1000,
    });
    expect(result.state.signals?.secondary?.snoozedUntil).toBe(now + 8 * 60 * 60 * 1000);
    expect(result.restore().signals).toEqual(before.signals);
  });

  it('đúng 4 mốc hoãn, mặc định 8 giờ', () => {
    expect(SIGNALS_CONFIG.snoozeDurations.map((d) => d.milliseconds / 3_600_000)).toEqual([2, 4, 8, 24]);
  });

  it('hoàn tác không để lại mục mới nếu trước đó chưa có trạng thái', () => {
    const result = snoozeSignalState({}, [makeSignal('new')], 2 * 60 * 60 * 1000, now);
    expect(result.restore().signals).toEqual({});
  });
});
