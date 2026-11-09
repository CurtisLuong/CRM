import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';
import { customerJourney } from '@/features/customer-sheet/model';
import {
  customerSheetTimeline,
  editedTimelineNotePatch,
  filterTimeline,
  timelineCounts,
  timelineGroups,
  timelineView,
} from '@/features/profile/model';

const at = (day: string, time: string) => new Date(`2026-${day}T${time}:00+07:00`).toISOString();
const now = Date.parse('2026-11-09T10:00:00+07:00');
const standard = (patch: Partial<Customer> = {}): Customer => ({
  id: 'tl01',
  owner_id: 'tl01-user',
  full_name: 'Khách TL-01',
  phone: '0912345678',
  care_stage: 'Nuôi dài hạn',
  care_stage_history: [
    { stage: 'Đang chăm sóc', at: at('10-09', '22:29') },
    { stage: 'Đang chăm sóc', at: at('10-10', '21:11'), note: 'đã gọi 21:11, 10.10.2026' },
    { stage: 'Nuôi dài hạn', at: at('10-30', '10:53'), auto: 'sla', note: 'Tự động: quá 20 ngày…' },
    { stage: 'Nuôi dài hạn', at: at('11-03', '15:33'), note: 'd', extension: { keep: true } },
  ],
  call_attempts: [
    { at: at('10-09', '22:29'), result: 'talked' },
    { at: at('10-10', '21:11'), result: 'talked' },
  ],
  notes_manual: [{ at: at('10-09', '22:58'), text: 'Ghi chú 22:58' }],
  next_tasks: [{ at: at('11-03', '14:00'), text: 'Tham quan căn mẫu', kind: 'visit', done_at: at('11-03', '16:00') }],
  ...patch,
});

describe('TL-01 · mốc bậc liên tiếp', () => {
  it('đúng ví dụ luật 4: hai nhóm, giờ vào bậc, SLA, dòng con và chip Bậc đếm hai', () => {
    const customer = standard();
    const snapshot = structuredClone(customer);
    const entries = customerTimeline(customer);
    const groups = timelineGroups(entries);
    expect(groups.map((group) => [group.title, group.at])).toEqual([
      ['Bậc: Nuôi dài hạn', at('10-30', '10:53')],
      ['Bậc: Đang chăm sóc', at('10-09', '22:29')],
    ]);
    expect(groups[0]?.stage).toMatchObject({ automatic: true, detail: 'Tự động: quá 20 ngày…' });
    expect(groups[0]?.rows.map(({ entry }) => [entry.title, entry.detail])).toEqual([
      ['Xong việc: Tham quan căn mẫu', undefined],
      ['Ghi chú bậc', 'd'],
    ]);
    expect(groups[1]?.rows.map(({ entry }) => [entry.title, entry.at])).toEqual([
      ['Nói chuyện được', at('10-10', '21:11')],
      ['Ghi chú', at('10-09', '22:58')],
      ['Nói chuyện được', at('10-09', '22:29')],
    ]);
    expect(timelineCounts(entries).stage).toBe(2);
    expect(filterTimeline(entries, 'stage').map((entry) => entry.id)).toEqual(groups.map((group) => group.id));
    const filtered = timelineView(entries, 'stage');
    expect(filtered.groups).toHaveLength(2);
    expect(filtered.groups.every((group) => group.rows.length === 0)).toBe(true);
    expect(filtered.ordered).toHaveLength(2);
    expect(customer).toEqual(snapshot);
    expect(entries.filter((entry) => entry.kind === 'stage')).toHaveLength(4);
  });

  it('luật 5: chuyển xen kẽ thật vẫn có ba nhóm, kể cả đầu vào đảo thứ tự', () => {
    const entries = customerTimeline(
      standard({
        care_stage_history: [
          { stage: 'Đang chăm sóc', at: at('10-08', '10:00') },
          { stage: 'Đang chăm sóc', at: at('10-01', '10:00') },
          { stage: 'Nuôi dài hạn', at: at('10-05', '10:00') },
        ],
        call_attempts: [],
        notes_manual: [],
        next_tasks: [],
      }),
    );
    expect(timelineGroups(entries).map((group) => group.title)).toEqual([
      'Bậc: Đang chăm sóc',
      'Bậc: Nuôi dài hạn',
      'Bậc: Đang chăm sóc',
    ]);
    expect(timelineCounts(entries).stage).toBe(3);
  });

  it('so bậc qua normStage và ẩn ghi chú trống', () => {
    const groups = timelineGroups(
      customerTimeline(
        standard({
          care_stage_history: [
            { stage: 'Hỗ trợ hồ sơ', at: at('10-01', '10:00') },
            { stage: 'Booking', at: at('10-02', '10:00') },
            { stage: 'Booking & Làm hồ sơ', at: at('10-03', '10:00'), note: '   ' },
            { stage: 'Booking', at: at('10-04', '10:00'), note: 'Còn thiếu giấy tờ' },
          ],
          call_attempts: [],
          notes_manual: [],
          next_tasks: [],
        }),
      ),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.at).toBe(at('10-01', '10:00'));
    expect(groups[0]?.rows.map(({ entry }) => entry.detail)).toEqual(['Còn thiếu giấy tờ']);
  });

  it.each([-120_001, -120_000, 0, 120_000, 120_001])('ẩn đúng cửa sổ ±2 phút: %i ms', (delta) => {
    const noteAt = at('11-03', '15:33');
    const customer = standard({ call_attempts: [{ at: new Date(Date.parse(noteAt) + delta).toISOString() }] });
    const rows = timelineGroups(customerTimeline(customer))[0]?.rows ?? [];
    expect(rows.some(({ entry }) => entry.detail === 'd')).toBe(Math.abs(delta) > 120_000);
    // Mốc đầu vẫn hiện kể cả trùng giờ cuộc gọi.
    expect(timelineGroups(customerTimeline(customer))).toHaveLength(2);
  });

  it('hồ sơ lưu trữ: ghi chú bậc là con, chỉ hai mốc cấp trên, không hiện bản sao gọi', () => {
    const entries = customerTimeline(
      standard({
        archived_at: at('11-04', '10:00'),
        interactions: [{ at: at('11-04', '10:00'), channel: 'other', kind: 'archived' }],
      }),
    );
    const view = timelineView(entries, 'all');
    expect(view.ordered.filter((row) => row.topLevel && row.entry.kind === 'stage')).toHaveLength(2);
    expect(view.ordered.find((row) => row.entry.detail === 'd')).toMatchObject({
      nested: true,
      topLevel: false,
      icon: 'note',
      entry: { title: 'Ghi chú bậc' },
    });
    expect(view.ordered.some((row) => row.entry.detail?.startsWith('đã gọi'))).toBe(false);
    expect(timelineView(entries, 'stage').ordered).toHaveLength(2);
  });

  it('Hành trình cùng hai bậc, năm việc, thứ tự và giờ kết thúc đúng', () => {
    const journey = customerJourney(standard(), now);
    expect(journey.stages.map((stage) => [stage.stage, stage.start, stage.end])).toEqual([
      ['Nuôi dài hạn', at('10-30', '10:53'), undefined],
      ['Đang chăm sóc', at('10-09', '22:29'), at('10-30', '10:53')],
    ]);
    expect(journey.count).toBe(5);
    expect(journey.stages[0]?.items?.map((item) => item.title)).toEqual([
      'Xong việc: Tham quan căn mẫu',
      'Ghi chú bậc',
    ]);
  });

  it('giữ ID gốc để sửa đúng mốc và bảo toàn trường lạ', () => {
    const customer = standard();
    const row = timelineGroups(customerTimeline(customer))[0]?.rows.find(({ entry }) => entry.detail === 'd');
    expect(row).toBeDefined();
    if (!row) throw new Error('Thiếu dòng ghi chú bậc');
    const patch = editedTimelineNotePatch(customer, row.entry.id, 'Ghi chú đã sửa', new Date(now).toISOString());
    expect(patch).toEqual({
      care_stage_history: customer.care_stage_history?.map((entry, index) =>
        index === 3 ? { ...entry, note: 'Ghi chú đã sửa', edited_at: new Date(now).toISOString() } : entry,
      ),
    });
    expect(customer.care_stage_history?.[3]?.note).toBe('d');
  });

  it('vẫn bổ sung bậc hiện tại khi lịch sử thiếu mốc', () => {
    const customer = standard({ care_stage: 'Xem dự án', care_stage_updated_at: at('11-04', '09:00') });
    expect(timelineGroups(customerSheetTimeline(customer, now)).map((group) => group.title)).toEqual([
      'Bậc: Xem dự án',
      'Bậc: Nuôi dài hạn',
      'Bậc: Đang chăm sóc',
    ]);
  });
});
