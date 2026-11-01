import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { initiallySelected, normalizeProject, type SendKitItem, sendKitText } from './model';

const item = (id: string, title: string, project: string | null, order: number, text = ''): SendKitItem => ({
  id,
  title,
  project,
  order,
  text,
  files: [],
  updatedAt: 0,
});

describe('bộ tài liệu gửi khách', () => {
  it('tick Chung và dự án khách, bỏ dự án khác theo ví dụ chuẩn', () => {
    const items = [
      item('common-1', 'Điều kiện mua', null, 0),
      item('common-2', 'Giấy tờ cần chuẩn bị', null, 1),
      item('a-1', 'Ảnh A', 'A', 2),
      item('a-2', 'Bảng giá A', 'A', 3),
      item('b-1', 'Video B', 'B', 4),
    ];
    const selected = items.filter((row) => initiallySelected(row, ['A']));
    expect(selected.map((row) => row.title)).toEqual(['Điều kiện mua', 'Giấy tờ cần chuẩn bị', 'Ảnh A', 'Bảng giá A']);
    expect(selected).toHaveLength(4);
    expect(selected.map((row) => row.title)).not.toContain('Video B');
  });

  it('so khớp tên dự án không phân biệt hoa thường và khoảng trắng', () => {
    const row = item('p', 'Tài liệu', '  Nhà   ở Xã hội  Hải Phòng ', 0);
    expect(normalizeProject(' NHÀ ở xã hội Hải Phòng ')).toBe('nhà ở xã hội hải phòng');
    expect(initiallySelected(row, ['nhà ở xã hội hải phòng'])).toBe(true);
  });

  it('nối chữ đúng thứ tự trang và điền tên khách', () => {
    const customer = { full_name: 'Nguyễn An', gender: 'Nam', projects: ['A'] } as Customer;
    const items = [item('second', 'Sau', null, 1, 'Cảm ơn {ten}'), item('first', 'Trước', null, 0, 'Chào {ten}')];
    expect(sendKitText(items, new Set(['first', 'second']), customer)).toBe('Chào An\n\nCảm ơn An');
  });
});
