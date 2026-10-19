import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { durationParts, headlineTiles } from '@/features/insights/model';

const now = new Date(2026, 9, 21, 9, 30).getTime(); // Thứ Tư
const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();

describe('durationParts', () => {
  it.each([
    [18 * 60_000, [18, 'phút']],
    [90 * 60_000, [1.5, 'giờ']],
    [null, [null, undefined]],
  ])('%s → %j', (ms, out) => {
    expect(durationParts(ms as number | null)).toEqual(out);
  });
});

describe('headlineTiles', () => {
  it('đủ 4 ô theo thứ tự; không dữ liệu → giá trị null (StatTile hiện "—")', () => {
    const tiles = headlineTiles([], now);
    expect(tiles.map((t) => t.key)).toEqual(['firstCall', 'contact', 'rhythm', 'milestones']);
    expect(tiles[0]?.value).toBeNull();
    expect(tiles[1]?.value).toBeNull();
    expect(tiles[3]).toMatchObject({ value: 0, trend: { dir: 'flat', text: 'bằng tuần trước' } });
  });

  it('Booking/Kí tuần này so tuần trước', () => {
    const c = (id: string, d: number) =>
      ({
        id,
        owner_id: 'u',
        full_name: id,
        phone: '0901234567',
        care_stage: 'Booking & Làm hồ sơ',
        care_stage_history: [{ at: at(d, 8), stage: 'Booking & Làm hồ sơ' }],
      }) as Customer;
    const tiles = headlineTiles([c('a', 20), c('b', 21), c('c', 14)], now);
    expect(tiles[3]).toMatchObject({
      value: 2,
      sub: 'tuần trước 1',
      trend: { dir: 'up', text: 'hơn 1', tone: 'good' },
    });
  });
});
