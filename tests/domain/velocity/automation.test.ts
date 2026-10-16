// T2.B2 — Luật tự chuyển SLA (D-008, CLAUDE.md §3.6): khách cũ trước autoSince, chỉ khách mình,
// chỉ giai đoạn có `auto`, hoàn tác trong autoUndoDays, applySlaPlan ghi qua writer.
import { describe, expect, it } from 'vitest';
import { VELOCITY_CONFIG } from '@/config/velocity';
import type { Customer } from '@/domain/customer';
import {
  applySlaPlan,
  autoAction,
  type CustomerWriter,
  planSlaAutomation,
  planSlaUndo,
  type StageFollowup,
  slaAutoEntry,
} from '@/domain/velocity';

const ME = 'me-1';
const OTHER = 'other-2';
const DAY = 86400000;
const t = (iso: string) => Date.parse(iso);
const noFollowup: StageFollowup = () => null;
const recall: StageFollowup = () => ({
  start: new Date('2027-01-10T02:00:00Z'),
  end: new Date('2027-01-10T03:00:00Z'),
  reason: 'Liên hệ lại khách nuôi dài hạn',
});

function care(stage: string, enteredIso: string, extra: Partial<Customer> = {}): Customer {
  return {
    id: `c-${stage}-${enteredIso}`,
    phone: '0900000000',
    full_name: 'Khách thử',
    owner_id: ME,
    qualified_at: enteredIso,
    care_stage: stage,
    care_stage_history: [{ stage, at: enteredIso, note: null }],
    created_at: enteredIso,
    ...extra,
  };
}
function lead(firstCallIso: string, extra: Partial<Customer> = {}): Customer {
  return {
    id: `l-${firstCallIso}`,
    phone: '0900000001',
    full_name: 'Khách mới thử',
    owner_id: ME,
    created_at: firstCallIso,
    call_attempts: [{ at: firstCallIso, result: 'no_answer' }],
    ...extra,
  };
}

describe('autoSince — khách cũ không bị chuyển hàng loạt', () => {
  const since = t(VELOCITY_CONFIG.autoSince);
  it('Đang chăm sóc từ trước autoSince: đồng hồ auto tính từ autoSince', () => {
    const c = care('Đang chăm sóc', '2026-08-01T09:00:00+07:00');
    expect(autoAction(c, since + 19 * DAY)).toBeNull();
    expect(autoAction(c, since + 20 * DAY)).toEqual({ type: 'nurture', phase: 'care' });
  });
  it('Đang tiếp cận từ trước autoSince: chưa đủ 7 ngày tính từ autoSince → không loại', () => {
    const c = lead('2026-09-01T09:00:00+07:00');
    expect(planSlaAutomation([c], since + 6 * DAY, ME, noFollowup).changes).toEqual([]);
    expect(planSlaAutomation([c], since + 7 * DAY, ME, noFollowup).changes).toHaveLength(1);
  });
});

describe('chỉ khách mình phụ trách', () => {
  it('khách của đồng nghiệp quá hạn → không đổi', () => {
    const now = t('2026-12-01T10:00:00+07:00');
    const mine = care('Đang chăm sóc', '2026-10-20T09:00:00+07:00');
    const theirs = { ...care('Đang chăm sóc', '2026-10-20T09:00:00+07:00'), id: 'theirs', owner_id: OTHER };
    const plan = planSlaAutomation([mine, theirs], now, ME, noFollowup);
    expect(plan.changes.map((x) => x.id)).toEqual([mine.id]);
  });
});

describe('không mở rộng sang giai đoạn chưa cấu hình auto', () => {
  const now = t('2027-06-01T10:00:00+07:00'); // quá mọi hạn mức
  it.each(['Xem dự án', 'Booking & Làm hồ sơ', 'Booking', 'Nuôi dài hạn', 'Kí HĐMB'])('%s', (stage) => {
    expect(planSlaAutomation([care(stage, '2026-10-12T09:00:00+07:00')], now, ME, recall).changes).toEqual([]);
  });
  it('khách mới chưa gọi (new_lead) chỉ cảnh báo', () => {
    const c: Customer = { id: 'n', phone: '0', full_name: 'x', owner_id: ME, created_at: '2026-10-12T09:00:00+07:00' };
    expect(planSlaAutomation([c], now, ME, recall).changes).toEqual([]);
  });
  it('khách đã nói chuyện được không bị tự loại', () => {
    const c = lead('2026-10-12T09:00:00+07:00', {
      call_attempts: [{ at: '2026-10-12T09:00:00+07:00', result: 'talked' }],
    });
    expect(planSlaAutomation([c], now, ME, recall).changes).toEqual([]);
  });
});

describe('Nuôi dài hạn: lịch kèm theo + mốc {auto:"sla"}', () => {
  const now = t('2026-12-01T10:00:00+07:00');
  it('kèm lịch gọi lại khi chưa có lịch tương lai', () => {
    const [ch] = planSlaAutomation([care('Đang chăm sóc', '2026-10-20T09:00:00+07:00')], now, ME, recall).changes;
    expect(ch?.patch).toEqual({
      care_stage: 'Nuôi dài hạn',
      next_call_at: '2027-01-10T02:00:00.000Z',
      next_call_end: '2027-01-10T03:00:00.000Z',
      next_call_reason: 'Liên hệ lại khách nuôi dài hạn',
    });
    expect(ch?.opts?.historyMeta).toEqual({ auto: 'sla' });
  });
  it('giữ lịch gọi đã hẹn trong tương lai', () => {
    const c = care('Đang chăm sóc', '2026-10-20T09:00:00+07:00', { next_call_at: '2026-12-05T02:00:00Z' });
    const [ch] = planSlaAutomation([c], now, ME, recall).changes;
    expect(ch?.patch).toEqual({ care_stage: 'Nuôi dài hạn' });
  });
  it('planSlaAutomation không sửa bản ghi đầu vào', () => {
    const c = care('Đang chăm sóc', '2026-10-20T09:00:00+07:00');
    const before = structuredClone(c);
    planSlaAutomation([c], now, ME, recall);
    expect(c).toEqual(before);
  });
});

describe('applySlaPlan', () => {
  it('ghi patch qua writer; lỗi 1 khách không chặn khách khác', async () => {
    const now = t('2026-12-01T10:00:00+07:00');
    const a = care('Đang chăm sóc', '2026-10-20T09:00:00+07:00');
    const b = { ...lead('2026-11-01T09:00:00+07:00'), id: 'b' };
    const plan = planSlaAutomation([a, b], now, ME, noFollowup);
    const seen: unknown[][] = [];
    const writer: CustomerWriter = {
      async update(...args) {
        seen.push(args);
        if (args[0] === a.id) throw new Error('mất mạng');
      },
    };
    const res = await applySlaPlan(plan, writer);
    expect(res.failed.map((f) => f.change.id)).toEqual([a.id]);
    expect(res.applied.map((x) => x.id)).toEqual(['b']);
    expect(seen[1]).toEqual(['b', plan.changes[1]?.patch]); // drop: không kèm opts (như v1)
  });
});

describe('Hoàn tác trong autoUndoDays', () => {
  const autoAt = '2026-11-10T10:00:00+07:00';
  const c: Customer = {
    ...care('Nuôi dài hạn', autoAt),
    care_stage_history: [
      { stage: 'Đăng kí mới', at: '2026-10-01T09:00:00+07:00', note: null },
      { stage: 'Xem dự án', at: '2026-10-15T09:00:00+07:00', note: null },
      { stage: 'Nuôi dài hạn', at: autoAt, note: 'Tự động', auto: 'sla' },
    ],
  };
  it('còn hạn → quay lại bậc trước mốc tự động', () => {
    const now = t(autoAt) + VELOCITY_CONFIG.autoUndoDays * DAY;
    expect(slaAutoEntry(c, now)?.auto).toBe('sla');
    expect(planSlaUndo(c, now, ME)?.patch).toEqual({ care_stage: 'Xem dự án' });
  });
  it('hết hạn hoặc khách người khác → null', () => {
    const late = t(autoAt) + (VELOCITY_CONFIG.autoUndoDays + 0.01) * DAY;
    expect(planSlaUndo(c, late, ME)).toBeNull();
    expect(planSlaUndo({ ...c, owner_id: OTHER }, t(autoAt), ME)).toBeNull();
  });
  it('không có bậc trước → Đang chăm sóc', () => {
    const only: Customer = { ...c, care_stage_history: [{ stage: 'Nuôi dài hạn', at: autoAt, auto: 'sla' }] };
    expect(planSlaUndo(only, t(autoAt), ME)?.patch).toEqual({ care_stage: 'Đang chăm sóc' });
  });
  it('mốc cuối không phải tự động → không hoàn tác', () => {
    const manual: Customer = { ...c, care_stage_history: [{ stage: 'Nuôi dài hạn', at: autoAt }] };
    expect(slaAutoEntry(manual, t(autoAt))).toBeNull();
  });
});
