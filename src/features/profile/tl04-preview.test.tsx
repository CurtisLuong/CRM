import { describe, expect, it } from 'vitest';
import { limitTimelineView, timelineView } from './model';

const at = (day: number) => new Date(Date.UTC(2026, 9, day)).toISOString();
const stage = (day: number) => ({
  id: `stage-${day}`,
  at: at(day),
  kind: 'stage',
  title: `Bậc: ${day === 1 ? 'Đang tiếp cận' : day === 10 ? 'Đang chăm sóc' : 'Xem dự án'}`,
});
const note = (day: number) => ({ id: `note-${day}`, at: at(day), kind: 'note', title: 'Ghi chú', detail: `${day}` });

describe('TL-04 · giới hạn kết quả sau lọc', () => {
  it('lấy 8 hoạt động mới nhất và các tiêu đề chứa chúng, không thay đổi bản đầy đủ', () => {
    const entries = [stage(1), stage(10), stage(20), ...Array.from({ length: 12 }, (_, i) => note(i * 2 + 2))];
    const full = timelineView(entries, 'all');
    const { view, hiddenCount } = limitTimelineView(full, 8);
    expect(hiddenCount).toBe(4);
    expect(view.groups.flatMap((group) => group.rows).map(({ entry }) => entry.id)).toEqual(
      Array.from({ length: 8 }, (_, i) => `note-${24 - 2 * i}`),
    );
    expect(view.groups.map((group) => group.id)).toEqual(['stage-20', 'stage-10']);
    expect(full.groups.flatMap((group) => group.rows)).toHaveLength(12);
    expect(limitTimelineView(timelineView(entries, 'stage'), 8).hiddenCount).toBe(0);
    expect(limitTimelineView(timelineView(entries, 'call'), 8).hiddenCount).toBe(0);
  });

  it('đúng 8 dòng không có nút; danh sách không có bậc vẫn cắt sau lọc', () => {
    const entries = Array.from({ length: 9 }, (_, i) => note(i + 1));
    expect(limitTimelineView(timelineView(entries.slice(0, 8), 'all'), 8).hiddenCount).toBe(0);
    const limited = limitTimelineView(timelineView(entries, 'note'), 8);
    expect(limited.hiddenCount).toBe(1);
    expect(limited.view.flat).toHaveLength(8);
  });

  it('giữ lịch sử lưu trữ đúng thứ tự và không tính tiêu đề bậc vào giới hạn', () => {
    const entries = [
      stage(1),
      ...Array.from({ length: 9 }, (_, i) => note(i + 2)),
      { id: 'archive', kind: 'archive', at: at(12), title: 'Lưu trữ khách' },
    ];
    const limited = limitTimelineView(timelineView(entries, 'all'), 8);
    expect(limited.hiddenCount).toBe(2);
    expect(limited.view.ordered).toHaveLength(8);
    expect(limited.view.ordered[0]?.entry.id).toBe('archive');
  });
});
