import { describe, expect, it } from 'vitest';
import { bellBadge } from '@/features/notifications/badge';

// PF-06 luật 2–3: số trên chuông = số tín hiệu; 0 ẩn số; > 99 → "99+"; aria-label đọc đủ số.
describe('bellBadge', () => {
  it('0 → chỉ nhãn "Thông báo", không có số', () => {
    expect(bellBadge(0)).toEqual({ label: 'Thông báo', text: '' });
  });

  it('N > 0 → nhãn "Thông báo, N mục" và số đúng', () => {
    expect(bellBadge(1)).toEqual({ label: 'Thông báo, 1 mục', text: '1' });
    expect(bellBadge(42)).toEqual({ label: 'Thông báo, 42 mục', text: '42' });
  });

  it('> 99 → hiện "99+" nhưng nhãn vẫn đọc đủ số', () => {
    expect(bellBadge(100)).toEqual({ label: 'Thông báo, 100 mục', text: '99+' });
    expect(bellBadge(4321).text).toBe('99+');
  });
});
