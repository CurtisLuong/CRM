import { describe, expect, it } from 'vitest';
import { unitMatchesQuery } from '@/features/catalog/model';

// Lead (PF-05): ô tìm Giỏ hàng theo luật dấu chung của app.
const unit = [
  ['Mã căn', 'B1201'],
  ['Loại căn', '2N-2WC'],
  ['Ghi chú', 'Căn góc'],
  ['Mã toà', 'B1'],
  ['Dự án', 'Vin Tràng Cát'],
] as const;

describe('unitMatchesQuery', () => {
  it('không dấu tìm rộng, có dấu thu hẹp', () => {
    expect(unitMatchesQuery(unit, 'trang cat')).toBe(true);
    expect(unitMatchesQuery(unit, 'Tràng Cát')).toBe(true);
    expect(unitMatchesQuery(unit, 'Trang Cát')).toBe(true);
    expect(unitMatchesQuery(unit, 'Trảng')).toBe(false);
  });
  it('mã căn, bí danh loại căn, ô trống', () => {
    expect(unitMatchesQuery(unit, 'b1201')).toBe(true);
    expect(unitMatchesQuery(unit, '2pn')).toBe(true);
    expect(unitMatchesQuery(unit, '')).toBe(true);
    expect(unitMatchesQuery(unit, 'A0901')).toBe(false);
  });
});
