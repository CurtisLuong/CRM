import { describe, expect, it } from 'vitest';
import { interestLevelForTier, interestTierOf } from '@/domain/customer/interest';

describe('mức quan tâm chọn nhanh (Curtis 10/11)', () => {
  it('bậc theo mốc 80 / 60 / 35 / 0', () => {
    expect([85, 80, 79, 60, 59, 35, 34, 0, null, 'abc'].map((v) => interestTierOf(v).label)).toEqual([
      'Rất nóng',
      'Rất nóng',
      'Nóng',
      'Nóng',
      'Ấm',
      'Ấm',
      'Nguội',
      'Nguội',
      'Nguội',
      'Nguội',
    ]);
  });

  it('cùng bậc → giữ số cũ; khác bậc → mốc dưới; Nguội → 20', () => {
    expect(interestLevelForTier(70, 'nong')).toBe(70);
    expect(interestLevelForTier(20, 'nong')).toBe(60);
    expect(interestLevelForTier(20, 'ratnong')).toBe(80);
    expect(interestLevelForTier(90, 'am')).toBe(35);
    expect(interestLevelForTier(90, 'nguoi')).toBe(20);
    expect(interestLevelForTier(10, 'nguoi')).toBe(10);
    expect(interestLevelForTier(null, 'nguoi')).toBe(20);
    expect(interestLevelForTier(50, 'khong-co')).toBeNull();
  });
});
