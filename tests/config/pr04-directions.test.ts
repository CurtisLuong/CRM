import { describe, expect, it } from 'vitest';
import { DIRECTIONS, directionOptions, directionValue } from '@/config/directions';

describe('PR-04 — một nguồn 8 hướng', () => {
  it('đúng chữ và đúng thứ tự', () => {
    expect(DIRECTIONS).toEqual(['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Bắc', 'Đông Nam', 'Tây Bắc', 'Tây Nam']);
  });

  it.each(['đông nam', '  ĐÔNG  NAM  ', 'Đông\tNam'])('so khớp hoa/thường và khoảng trắng: %s', (raw) => {
    expect(directionValue(raw)).toBe('Đông Nam');
    expect(directionOptions(raw)).toEqual(DIRECTIONS);
  });

  it('giữ nguyên giá trị lạ, kể cả khoảng trắng, và có lựa chọn riêng', () => {
    expect(directionValue('  ĐN view hồ ')).toBe('  ĐN view hồ ');
    expect(directionOptions('ĐN view hồ')).toEqual([...DIRECTIONS, 'ĐN view hồ']);
    expect(directionValue(null)).toBe('');
    expect(directionValue(undefined)).toBe('');
  });
});
