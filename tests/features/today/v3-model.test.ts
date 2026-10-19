import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import type { Signal } from '@/domain/signals';
import { groupQueue, type QueueRow, signalTask, todayCard } from '@/features/today/model';

const now = new Date(2026, 9, 19, 9, 30).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

const sig = (over: Partial<Signal> = {}): Signal => ({
  id: 's',
  rule: 'S01',
  customerId: 'c1',
  priority: 'P0',
  title: 'Đến giờ hẹn gọi',
  reason: 'Hẹn gọi',
  evidence: [],
  actions: ['call'],
  dedupeKey: Math.random().toString(36),
  fingerprint: 'f',
  sort: [],
  group: 'due',
  ...over,
});
const cust = (over: Partial<Customer> = {}): Customer =>
  ({ id: 'c1', owner_id: 'u1', full_name: 'Bùi Thị Hồng Nhung', phone: '0901234567', ...over }) as Customer;
const row = (s: Partial<Signal>, c: Partial<Customer> = {}): QueueRow => ({
  signal: sig(s),
  customer: cust(c),
  minutes: 3,
});

describe('groupQueue', () => {
  it('theo thứ tự groupOrder; nhóm gấp = thẻ đầy đủ; nhóm ít gấp thu gọn; không nhóm → Việc khác cuối', () => {
    const groups = groupQueue([
      row({ group: 'new' }),
      row({ group: 'hot' }),
      row({ group: undefined, priority: 'P2' }),
      row({ group: 'due' }),
      row({ group: 'due' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['due', 'new', 'hot', 'other']);
    expect(groups.map((g) => g.rows.length)).toEqual([2, 1, 1, 1]);
    expect(groups.map((g) => g.full)).toEqual([true, true, false, false]);
    expect(groups.map((g) => g.collapsed)).toEqual([false, false, true, false]);
    expect(groups[0]?.title).toBe('Đến giờ / quá giờ hẹn gọi');
  });
});

describe('tín hiệu phụ (D-015 gộp theo khách)', () => {
  it('chính không nhóm (S05) → lấy nhóm + hành động của tín hiệu phụ (S01 khách mới, gọi)', () => {
    const r = row({
      rule: 'S05',
      group: undefined,
      actions: ['open_profile'],
      secondaryReasons: [sig({ rule: 'S01', group: 'new', actions: ['call'] })],
    });
    expect(groupQueue([r]).map((g) => g.key)).toEqual(['new']);
    expect(todayCard(r, now).action).toBe('call');
  });

  it('P0 không nhóm (S10 bước hồ sơ) + phụ chỉ có nhóm thu gọn → nhóm SLA, thẻ đầy đủ, bằng chứng làm cấp 2', () => {
    const r = row({
      rule: 'S10',
      priority: 'P0',
      group: undefined,
      actions: ['zalo', 'open_profile'],
      evidence: [{ field: 'step', value: 'cu_tru' }],
      secondaryReasons: [sig({ rule: 'S07', group: 'nonext', priority: 'P2', actions: ['schedule'] })],
    });
    const [g] = groupQueue([r]);
    expect(g?.key).toBe('sla');
    expect(g?.full).toBe(true);
  });

  it('P1 không nhóm + phụ nhóm thu gọn → giữ nhóm thu gọn', () => {
    const r = row({ rule: 'S05', priority: 'P1', group: undefined, secondaryReasons: [sig({ group: 'hot' })] });
    expect(groupQueue([r])[0]?.key).toBe('hot');
  });
});

describe('todayCard — thời hạn (D-010: quá hạn sau mốc + 30 phút)', () => {
  it('hẹn 08:30, bây giờ 09:30 → quá hạn, đỏ, "Quá 1 giờ · hạn 08:30"', () => {
    const card = todayCard(row({ due: new Date(2026, 9, 19, 8, 30).getTime() }), now);
    expect(card.tone).toBe('over');
    expect(card.when).toEqual({ text: 'Quá 1 giờ · hạn 08:30', state: 'over' });
  });

  it('hẹn 09:10, bây giờ 09:30 (trong 30 phút ân hạn) → đến hạn, vàng', () => {
    const card = todayCard(row({ due: new Date(2026, 9, 19, 9, 10).getTime() }), now);
    expect(card.tone).toBe('soon');
    expect(card.when).toEqual({ text: 'Đến hạn · hạn 09:10', state: 'soon' });
  });

  it('hẹn gọi khung 08:30–09:15, bây giờ 09:30 → còn trong 30 phút sau cuối khung → đến hạn', () => {
    const card = todayCard(
      row({
        due: new Date(2026, 9, 19, 8, 30).getTime(),
        evidence: [{ field: 'next_call_end', value: at(19, 9, 15) }],
      }),
      now,
    );
    expect(card.tone).toBe('soon');
  });

  it('hẹn gọi khung 07:00–08:00, bây giờ 09:30 → quá 1 giờ 30 phút tính từ cuối khung (làm tròn "2 giờ")', () => {
    const card = todayCard(
      row({ due: new Date(2026, 9, 19, 7, 0).getTime(), evidence: [{ field: 'next_call_end', value: at(19, 8, 0) }] }),
      now,
    );
    expect(card.tone).toBe('over');
    expect(card.when?.text).toBe('Quá 2 giờ · hạn 07:00');
  });

  it('hẹn 14:00 hôm nay → chỉ giờ, không màu', () => {
    const card = todayCard(row({ due: new Date(2026, 9, 19, 14, 0).getTime() }), now);
    expect(card.tone).toBeUndefined();
    expect(card.when).toEqual({ text: '14:00', state: 'plain' });
  });

  it('hạn ngày khác → chỉ "Quá N ngày" (không kèm giờ, để dòng không bị cắt)', () => {
    const card = todayCard(row({ due: new Date(2026, 9, 17, 10, 0).getTime() }), now);
    expect(card.when).toEqual({ text: 'Quá 2 ngày', state: 'over' });
  });

  it('không có hạn → không dòng thời hạn', () => {
    expect(todayCard(row({ due: undefined }), now).when).toBeUndefined();
  });
});

describe('todayCard — cấp 2 và ghi chú', () => {
  it('có cuộc gọi: lần gần nhất có nhãn tiếng Việt + số lần', () => {
    const card = todayCard(
      row(
        {},
        {
          call_attempts: [
            { at: at(17, 10), result: 'talked', note: 'Hỏi giá căn 2PN' },
            { at: at(18, 15), result: 'no_answer', note: null },
            { at: at(16, 9), result: 'busy', note: null },
          ],
        },
      ),
      now,
    );
    expect(card.facts).toEqual([
      { label: 'Gọi gần nhất', value: 'Hôm qua 15:00 · Không nghe máy' },
      { label: 'Đã gọi', value: '3 lần' },
    ]);
    expect(card.note).toBe('Hỏi giá căn 2PN');
  });

  it('chưa gọi: nguồn có nhãn + "Chưa"; ghi chú lấy từ ghi chú đăng ký', () => {
    const card = todayCard(row({}, { source: 'facebook_ads', notes: 'Quan tâm 2PN' }), now);
    expect(card.facts).toEqual([
      { label: 'Nguồn', value: 'Facebook Ads' },
      { label: 'Đã gọi', value: 'Chưa' },
    ]);
    expect(card.note).toBe('Quan tâm 2PN');
  });

  it('ghi chú mới nhất giữa ghi chú tay và ghi chú cuộc gọi', () => {
    const card = todayCard(
      row(
        {},
        {
          notes_manual: [{ at: at(18, 20), text: 'Vợ chồng làm KCN' }],
          call_attempts: [{ at: at(18, 15), result: 'talked', note: 'Muốn vay 70%' }],
        },
      ),
      now,
    );
    expect(card.note).toBe('Vợ chồng làm KCN');
  });

  it('nhóm SLA không hiện ghi chú (lý do + bằng chứng quan trọng hơn)', () => {
    expect(todayCard(row({ group: 'sla' }, { notes: 'x' }), now).note).toBeUndefined();
  });
});

describe('todayCard — đúng MỘT hành động (D-023 L2)', () => {
  it('call / outcome / complete / open', () => {
    expect(todayCard(row({ actions: ['call', 'zalo'] }), now).action).toBe('call');
    expect(todayCard(row({ actions: ['record_call'], group: 'pending' }), now).action).toBe('outcome');
    const task = { at: at(18, 9), text: 'Gửi bảng giá', due: at(19, 16) };
    const withTask = row(
      { actions: ['complete'], group: 'tasks', evidence: [{ field: 'task', value: { at: task.at } }] },
      { next_tasks: [task] },
    );
    expect(todayCard(withTask, now).action).toBe('complete');
    expect(signalTask(withTask.signal, withTask.customer)?.text).toBe('Gửi bảng giá');
    expect(todayCard(row({ actions: ['complete'], group: 'tasks' }), now).action).toBe('open');
    expect(todayCard(row({ actions: ['classify'], group: 'decide' }), now).action).toBe('open');
  });
});

describe('todayCard — SLA bậc', () => {
  it('khách trong phễu có SLA: tỉ lệ 0..1, chữ ngắn', () => {
    const card = todayCard(
      row({}, { care_stage: 'Đang chăm sóc', care_stage_updated_at: at(18, 9), qualified_at: at(10, 9) }),
      now,
    );
    expect(card.sla).toBeDefined();
    expect(card.sla?.ratio).toBeGreaterThanOrEqual(0);
    expect(card.sla?.text).toMatch(/^(còn|quá) /);
  });
});
