import { describe, expect, it } from 'vitest';
import type { Customer, Interaction } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';
import {
  BEFORE_STAGE_TITLE,
  showsStageDetail,
  timelineGroups,
  timelineIcon,
  timelineView,
} from '@/features/profile/model';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const base = { id: 'c1', owner_id: 'u1', full_name: 'Khách PF-02', phone: '0911234567' };

/** Số chuẩn luật 3: A 10:00 ngày 1, B 10:00 ngày 3; gọi 09:00 ngày 1, ghi chú 10:00 ngày 1, Zalo 15:00 ngày 2, gọi 11:00 ngày 3. */
const standard = (over: Partial<Customer> = {}) =>
  ({
    ...base,
    care_stage_history: [
      { at: at(1, 10), stage: 'Đang chăm sóc' },
      { at: at(3, 10), stage: 'Xem dự án' },
    ],
    call_attempts: [
      { at: at(1, 9), result: 'no_answer' },
      { at: at(3, 11), result: 'talked' },
    ],
    notes_manual: [{ at: at(1, 10), text: 'Cha mẹ ở quê, cần gần trường học' }],
    interactions: [{ at: at(2, 15), channel: 'zalo', kind: 'sent', template: 'Bảng giá' }],
    ...over,
  }) as Customer;

describe('PF-02 nhóm dòng thời gian theo bậc', () => {
  it('số chuẩn luật 3: mốc bậc mở nhóm, mục cùng thời điểm thuộc bậc đó, nhóm mới nhất trước', () => {
    const groups = timelineGroups(customerTimeline(standard()));
    expect(groups.map((g) => g.title)).toEqual(['Bậc: Xem dự án', 'Bậc: Đang chăm sóc', BEFORE_STAGE_TITLE]);
    expect(groups[0]?.rows.map((r) => r.entry.title)).toEqual(['Nói chuyện được']);
    expect(groups[1]?.rows.map((r) => r.entry.title)).toEqual(['Đã gửi Zalo', 'Ghi chú']);
    expect(groups[2]?.rows.map((r) => r.entry.title)).toEqual(['Không nghe máy']);
    expect(groups[2]?.stage).toBeNull();
  });

  it('luật 2: khách không có mốc bậc → danh sách phẳng, không nhóm, không tiêu đề', () => {
    const view = timelineView(customerTimeline(standard({ care_stage_history: [] })), 'all');
    expect(view.grouped).toBe(false);
    expect(view.groups).toEqual([]);
    expect(view.flat.map((r) => r.entry.title)).toEqual([
      'Nói chuyện được',
      'Đã gửi Zalo',
      'Ghi chú',
      'Không nghe máy',
    ]);
    expect(view.flat.every((r) => typeof r.icon === 'string')).toBe(true);
  });

  it('luật 4: lọc "Bậc" chỉ còn đầu nhóm (bỏ nhóm trước mốc bậc)', () => {
    const view = timelineView(customerTimeline(standard()), 'stage');
    expect(view.grouped).toBe(true);
    expect(view.groups.map((g) => g.title)).toEqual(['Bậc: Xem dự án', 'Bậc: Đang chăm sóc']);
    expect(view.groups.every((g) => g.rows.length === 0)).toBe(true);
  });

  it('luật 4: lọc "Cuộc gọi" ẩn nhóm không có cuộc gọi, chỉ giữ mục khớp', () => {
    const view = timelineView(customerTimeline(standard()), 'call');
    expect(view.groups.map((g) => g.title)).toEqual(['Bậc: Xem dự án', BEFORE_STAGE_TITLE]);
    expect(view.groups[0]?.rows.map((r) => r.entry.title)).toEqual(['Nói chuyện được']);
    expect(view.groups[1]?.rows.map((r) => r.entry.title)).toEqual(['Không nghe máy']);
  });

  it('luật 4: ghi chú của mốc bậc chỉ hiện khi "Tất cả" / "Bậc"', () => {
    expect(showsStageDetail('all')).toBe(true);
    expect(showsStageDetail('stage')).toBe(true);
    expect(showsStageDetail('call')).toBe(false);
    expect(showsStageDetail('note')).toBe(false);
    expect(showsStageDetail('interaction')).toBe(false);
  });

  it('nhóm chỉ chứa mục khớp; nhóm rỗng bị ẩn', () => {
    const view = timelineView(customerTimeline(standard()), 'note');
    expect(view.groups.map((g) => g.title)).toEqual(['Bậc: Đang chăm sóc']);
    expect(view.groups[0]?.rows.map((r) => r.entry.title)).toEqual(['Ghi chú']);
  });

  it('mục cũ hơn mọi mốc bậc nằm ở nhóm cuối; mục sau mốc bậc thuộc mốc gần nhất', () => {
    const view = timelineView(
      customerTimeline(
        standard({
          care_stage_history: [{ at: at(2, 12), stage: 'Xem dự án' }],
        }),
      ),
      'all',
    );
    expect(view.groups.map((g) => g.title)).toEqual(['Bậc: Xem dự án', BEFORE_STAGE_TITLE]);
    expect(view.groups[0]?.rows.map((r) => r.entry.title)).toEqual(['Nói chuyện được', 'Đã gửi Zalo']);
    expect(view.groups[1]?.rows.map((r) => r.entry.title)).toEqual(['Ghi chú', 'Không nghe máy']);
  });
});

describe('PF-02 icon từng loại mục (luật 5)', () => {
  const icons = (customer: Customer) =>
    customerTimeline(customer).map((entry) => [entry.kind, entry.title, timelineIcon(entry)] as const);

  it('mốc bậc dùng STAGE_ICON, bậc lạ dùng STAGE_ICON_FALLBACK', () => {
    expect(timelineIcon({ id: 's1', at: at(1, 10), kind: 'stage', title: 'Bậc: Xem dự án' })).toBe('visit');
    expect(timelineIcon({ id: 's2', at: at(1, 10), kind: 'stage', title: 'Bậc: Booking' })).toBe('booking');
    expect(timelineIcon({ id: 's3', at: at(1, 10), kind: 'stage', title: 'Bậc: Bậc lạ chưa cấu hình' })).toBe(
      'customers',
    );
  });

  it('cuộc gọi / ghi chú / việc xong / duyệt AI', () => {
    const view = timelineView(
      customerTimeline(
        standard({
          care_stage_history: [],
          notes_manual: [{ at: at(1, 8), text: 'Ghi chú' }],
          next_tasks: [{ at: at(1, 7), text: 'Gọi lại', done_at: at(2, 8) }],
          field_meta: { purpose: { at: at(2, 9), by: 'ai', confirmed: true } },
        }),
      ),
      'all',
    );
    const map = new Map(view.flat.map((r) => [r.entry.kind, r.icon]));
    expect(map.get('call')).toBe('call');
    expect(map.get('note')).toBe('note');
    expect(map.get('task')).toBe('task');
    expect(map.get('approved')).toBe('ai');
  });

  it('tương tác: Zalo → message, gặp → cafe, xem dự án → visit, form quảng cáo → new_lead, khác → message', () => {
    const interactions: Interaction[] = [
      { at: at(5, 9), channel: 'zalo', kind: 'sent', by: 'u1' },
      { at: at(4, 9), channel: 'meet', kind: 'meeting', by: 'u1' },
      { at: at(3, 9), channel: 'visit', kind: 'project_view', by: 'u1' },
      { at: at(2, 9), channel: 'other', kind: 'lead_form', by: 'u1' },
      { at: at(1, 9), channel: 'sms', kind: 'sms', by: 'u1' },
    ];
    expect(
      icons(standard({ interactions, care_stage_history: [], notes_manual: [], call_attempts: [] })).map(
        ([, , icon]) => icon,
      ),
    ).toEqual(['message', 'cafe', 'visit', 'new_lead', 'message']);
  });

  it('nhóm "Trước khi có mốc bậc" dùng icon history', () => {
    const groups = timelineGroups(customerTimeline(standard()));
    expect(groups.at(-1)?.icon).toBe('history');
  });
});
