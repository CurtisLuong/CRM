import { describe, expect, it } from 'vitest';
import { taskDueInfo } from '@/domain/deadlines';
import { dueTone, stageChoicesFor } from '@/features/profile/model';

const now = new Date(2026, 9, 19, 9, 30).getTime();
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

describe('stageChoicesFor', () => {
  it('giữ danh sách bậc cũ, không cho chọn Kí HĐMB / Loại', () => {
    const options = stageChoicesFor('Xem dự án');
    expect(options).toContain('Xem dự án');
    expect(options).toContain('Đang chăm sóc');
    expect(options).not.toContain('Kí HĐMB');
    expect(options).not.toContain('Loại');
  });

  it('bậc hiện tại ngoài phễu (đã chốt/loại) vẫn hiện để radio checked', () => {
    expect(stageChoicesFor('Kí HĐMB')[0]).toBe('Kí HĐMB');
    expect(stageChoicesFor('Loại')[0]).toBe('Loại');
  });

  it('khách chưa có bậc giữ nguyên danh sách chuẩn', () => {
    expect(stageChoicesFor('')).not.toContain('');
  });
});

describe('dueTone', () => {
  it('quá hạn → đỏ; đến hạn (trong 30 phút ân hạn, D-010) → vàng — DS v4', () => {
    expect(dueTone(taskDueInfo({ due: iso(19, 8, 30) }, now))).toBe('over');
    expect(dueTone(taskDueInfo({ due: iso(19, 9, 15) }, now))).toBe('soon');
  });

  it('việc còn xa / hôm nay chưa tới giờ / không hạn → không vạch đỏ', () => {
    expect(dueTone(taskDueInfo({ due: iso(21, 9) }, now))).toBeUndefined();
    expect(dueTone(taskDueInfo({ due: iso(19, 16) }, now))).toBeUndefined();
    expect(dueTone(taskDueInfo({}, now))).toBeUndefined();
    expect(dueTone(null)).toBeUndefined();
  });
});
