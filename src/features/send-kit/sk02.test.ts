import { describe, expect, it } from 'vitest';
import { defaultProject, filterItems, type SendKitItem, selectFirstShownProject } from './model';

const item = (id: string, title: string, project: string | null, files: SendKitItem['files'] = []): SendKitItem => ({
  id,
  title,
  project,
  text: '',
  files,
  order: 0,
  updatedAt: 0,
});

describe('SK-02 lọc và chọn dự án', () => {
  it('chọn dự án khách đầu tiên có tài liệu, nếu không thì dự án đầu tiên, hoặc tất cả', () => {
    const items = [item('b', 'Bảng giá', 'B')];
    expect(defaultProject(['A', 'B'], items)).toBe('B');
    expect(defaultProject(['B', 'A'], [item('a', 'Ảnh', 'A'), ...items])).toBe('B');
    expect(defaultProject(['A'], items)).toBe('A');
    expect(defaultProject([], items)).toBeNull();
  });

  it('khách không có dự án (Tất cả dự án) chỉ tick sẵn mục Chung', () => {
    const items = [item('common-1', 'Điều kiện mua', null), item('a-1', 'Ảnh A', 'A'), item('b-1', 'Video B', 'B')];
    expect([...selectFirstShownProject(items, new Set(), null, true)]).toEqual(['common-1']);
  });

  it('giữ mục A và Chung khi đổi B, đồng thời tick B lần đầu được hiện', () => {
    const items = [
      item('common-1', 'Điều kiện mua', null),
      item('common-2', 'Giấy tờ', null),
      item('a-1', 'Ảnh A', 'A'),
      item('a-2', 'Bảng giá A', 'A'),
      item('b-1', 'Video B', 'B'),
    ];
    const first = selectFirstShownProject(items, new Set(), 'A', true);
    expect(first.size).toBe(4);
    const second = selectFirstShownProject(items, first, 'B');
    expect(second.size).toBe(5);
    expect(second.has('b-1')).toBe(true);
    expect(second.has('a-1')).toBe(true);
    expect(second.has('a-2')).toBe(true);
  });

  it('tìm chữ có dấu theo quy tắc PF-05 và tìm theo tên tệp', () => {
    const items = [
      { ...item('content', 'Tài liệu', null), text: 'Nội dung' },
      { ...item('name', 'Hướng dẫn Dũng', null), text: '' },
      {
        ...item('file', 'Ảnh tham khảo', null, [
          { id: 'f', name: 'bang-gia.pdf', type: 'application/pdf', size: 1, blob: new Blob() },
        ]),
      },
    ];
    expect(filterItems(items, 'dung').map((row) => row.id)).toEqual(['content', 'name']);
    expect(filterItems(items, 'dũng').map((row) => row.id)).toEqual(['name']);
    expect(filterItems(items, 'bang-gia').map((row) => row.id)).toEqual(['file']);
  });
});
