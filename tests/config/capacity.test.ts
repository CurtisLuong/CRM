import { describe, expect, it } from 'vitest';
import { CAPACITY_CONFIG } from '@/config/capacity';

describe('T3.2 capacity configuration', () => {
  it('keeps positive durations and the approved 3–7 row window', () => {
    expect(Object.values(CAPACITY_CONFIG.minutes).every((minutes) => minutes > 0)).toBe(true);
    expect(CAPACITY_CONFIG.minRows).toBe(3);
    expect(CAPACITY_CONFIG.maxRows).toBe(7);
  });
});
