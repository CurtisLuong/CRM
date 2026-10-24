import { describe, expect, it } from 'vitest';
import { ICONS } from '@/config/icons';
import { TASK_ACTION_KINDS, TASK_KIND_PICK, TASK_KINDS, taskKindOf } from '@/config/taskKinds';
import type { Customer } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';
import { taskDueFromInput, timelineIcon, withTaskKinds } from '@/features/profile/model';

// CP-03 — nguồn chung cho 5 hành động Thêm việc + hạn giờ/cả ngày/không hạn.
describe('CP-03 — 5 hành động Thêm việc', () => {
  it('đúng thứ tự Curtis duyệt và mỗi loại một icon cùng bộ', () => {
    expect(TASK_ACTION_KINDS).toEqual(['call', 'message', 'cafe', 'visit', 'docs']);
    expect(TASK_ACTION_KINDS.map((key) => TASK_KINDS[key].label)).toEqual([
      'Gọi điện',
      'Zalo',
      'Cafe và Gặp',
      'Tham quan',
      'Hồ sơ',
    ]);
    const icons = TASK_ACTION_KINDS.map((key) => TASK_KINDS[key].icon);
    expect(new Set(icons).size).toBe(icons.length);
    for (const icon of icons) expect(ICONS[icon]).toBeDefined();
  });

  it('giữ hợp đồng AI cũ: TASK_KIND_PICK và mã contract/other không đổi', () => {
    expect(TASK_KIND_PICK).toEqual(['message', 'cafe', 'docs', 'visit', 'contract', 'other']);
    expect(taskKindOf('contract')).toMatchObject({ key: 'contract', label: 'Kí HĐ', icon: 'contract' });
    expect(taskKindOf('other')).toMatchObject({ key: 'other', label: 'Việc', icon: 'task' });
    // Mã lạ không bị mất khi đọc; chỉ hiển thị như Việc.
    expect(taskKindOf('kind_future')).toMatchObject({ key: 'other', label: 'Việc' });
  });

  it('timeline của việc đã xong dùng icon loại việc, không có mã thì giữ icon Việc', () => {
    expect(timelineIcon({ id: 't1', at: '2026-10-24T01:00:00.000Z', kind: 'task', title: 'Xong' })).toBe('task');
    expect(
      timelineIcon({ id: 't2', at: '2026-10-24T01:00:00.000Z', kind: 'task', title: 'Xong', taskKind: 'visit' }),
    ).toBe('visit');
  });

  it('bơm đúng mã loại cho mục việc đã xong trong dòng thời gian', () => {
    const customer = {
      id: 'c1',
      owner_id: 'u1',
      full_name: 'Khách CP-03',
      phone: '0901234567',
      next_tasks: [
        { at: '2026-10-20T01:00:00.000Z', text: 'Gửi giá', kind: 'docs', done_at: '2026-10-21T01:00:00.000Z' },
        { at: '2026-10-22T01:00:00.000Z', text: 'Xem nhà', kind: 'visit' },
      ],
    } as Customer;
    const rows = withTaskKinds(customer, customerTimeline(customer));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({ taskKind: 'docs', title: 'Xong việc: Gửi giá' });
    if (row) expect(timelineIcon(row)).toBe('docs');
  });
});

describe('CP-03 — hạn việc trên form', () => {
  it('không chọn ngày = không hạn', () => {
    expect(taskDueFromInput({ day: '', time: '09:00', allDay: false })).toEqual({ ok: true, due: null });
  });

  it('cả ngày giữ mốc 09:00 local + due_allday', () => {
    const result = taskDueFromInput({ day: '2026-10-26', allDay: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.due?.due_allday).toBe(true);
    const at = new Date(result.due?.due || '');
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()]).toEqual([
      2026, 10, 26, 9, 0,
    ]);
  });

  it('có giờ lưu đúng giờ, không đặt due_allday', () => {
    const result = taskDueFromInput({ day: '2026-10-26', time: '14:30', allDay: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.due?.due_allday).toBeUndefined();
    const at = new Date(result.due?.due || '');
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()]).toEqual([
      2026, 10, 26, 14, 30,
    ]);
  });

  it('ngày không có thật / thiếu giờ / giờ sai đều báo lỗi, không tự đoán', () => {
    expect(taskDueFromInput({ day: '2026-02-30', allDay: true })).toMatchObject({ ok: false });
    expect(taskDueFromInput({ day: '26/10/2026', allDay: true })).toMatchObject({ ok: false });
    expect(taskDueFromInput({ day: '2026-10-26', time: '', allDay: false })).toMatchObject({ ok: false });
    expect(taskDueFromInput({ day: '2026-10-26', time: '25:00', allDay: false })).toMatchObject({ ok: false });
  });
});
