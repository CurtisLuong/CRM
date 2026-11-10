import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import {
  customerInterestTier,
  interestLevelForTier,
  interestTierOf,
  withInterestRule,
} from '@/domain/customer/interest';
import { planSlaAutomation, planSlaUndo } from '@/domain/velocity';

// D-033 (Curtis 10/11): 4 bậc Lạnh → Ấm → Nóng → Nguội; khách mới Lạnh; Loại/lưu trữ → Nguội;
// Nuôi dài hạn → Lạnh; bỏ Loại/lưu trữ → Lạnh; còn lại chỉnh tay.
const base = { id: 'c1', owner_id: 'u1', full_name: 'Khách thử', phone: '0900000000' };
const c = (over: Partial<Customer> = {}) => ({ ...base, ...over }) as Customer;

describe('bậc mức quan tâm (D-033)', () => {
  it('0 Nguội · 1–34 Lạnh · 35–59 Ấm · ≥ 60 Nóng (Rất nóng cũ gộp vào Nóng); thiếu = Lạnh', () => {
    expect([100, 85, 60, 59, 35, 34, 20, 1, 0, null, undefined, '', 'abc'].map((v) => interestTierOf(v).label)).toEqual(
      ['Nóng', 'Nóng', 'Nóng', 'Ấm', 'Ấm', 'Lạnh', 'Lạnh', 'Lạnh', 'Nguội', 'Lạnh', 'Lạnh', 'Lạnh', 'Lạnh'],
    );
  });

  it('khách đang Loại / lưu trữ luôn Nguội, dù số cũ còn cao', () => {
    expect(customerInterestTier(c({ interest_level: 85, disqualified_at: '2026-11-01T00:00:00Z' })).label).toBe(
      'Nguội',
    );
    expect(customerInterestTier(c({ interest_level: 85, archived_at: '2026-11-01T00:00:00Z' })).label).toBe('Nguội');
    expect(customerInterestTier(c({ interest_level: 85, care_stage: 'Loại' })).label).toBe('Nguội');
    expect(customerInterestTier(c({ interest_level: 85 })).label).toBe('Nóng');
  });

  it('chọn bậc: cùng bậc giữ số cũ; khác bậc → Lạnh 20 · Ấm 35 · Nóng 60 · Nguội 0', () => {
    expect(interestLevelForTier(85, 'nong')).toBe(85);
    expect(interestLevelForTier(20, 'nong')).toBe(60);
    expect(interestLevelForTier(20, 'am')).toBe(35);
    expect(interestLevelForTier(90, 'lanh')).toBe(20);
    expect(interestLevelForTier(90, 'nguoi')).toBe(0);
    expect(interestLevelForTier(10, 'lanh')).toBe(10);
    expect(interestLevelForTier(null, 'lanh')).toBe(20);
    expect(interestLevelForTier(50, 'ratnong')).toBeNull();
  });
});

describe('withInterestRule — tự đổi theo trạng thái (D-033)', () => {
  const now = '2026-11-10T02:00:00.000Z';
  it('Loại → Nguội (0)', () => {
    expect(withInterestRule(c({ interest_level: 60 }), { disqualified_at: now })).toEqual({
      disqualified_at: now,
      interest_level: 0,
    });
    expect(withInterestRule(c({ interest_level: 60 }), { care_stage: 'Loại' })).toEqual({
      care_stage: 'Loại',
      interest_level: 0,
    });
  });
  it('lưu trữ → Nguội (0)', () => {
    expect(withInterestRule(c({ interest_level: 40 }), { archived_at: now })).toEqual({
      archived_at: now,
      interest_level: 0,
    });
  });
  it('Nuôi dài hạn → Lạnh (20); đã Lạnh thì giữ số cũ, không ghi', () => {
    expect(
      withInterestRule(c({ interest_level: 60, care_stage: 'Xem dự án' }), { care_stage: 'Nuôi dài hạn' }),
    ).toEqual({
      care_stage: 'Nuôi dài hạn',
      interest_level: 20,
    });
    expect(withInterestRule(c({ interest_level: 25 }), { care_stage: 'Nuôi dài hạn' })).toEqual({
      care_stage: 'Nuôi dài hạn',
    });
  });
  it('bỏ Loại / bỏ lưu trữ / rời bậc Loại → Lạnh (20)', () => {
    const dropped = c({ interest_level: 0, disqualified_at: now });
    expect(withInterestRule(dropped, { disqualified_at: null })).toEqual({ disqualified_at: null, interest_level: 20 });
    expect(withInterestRule(c({ interest_level: 0, archived_at: now }), { archived_at: null })).toEqual({
      archived_at: null,
      interest_level: 20,
    });
    expect(withInterestRule(c({ interest_level: 0, care_stage: 'Loại' }), { care_stage: 'Đang chăm sóc' })).toEqual({
      care_stage: 'Đang chăm sóc',
      interest_level: 20,
    });
  });
  it('còn lại chỉnh tay: Đạt, đổi bậc khác, ghi chú… không đổi; patch có sẵn interest_level thì giữ', () => {
    expect(withInterestRule(c({ interest_level: 20 }), { qualified_at: now, care_stage: 'Đang chăm sóc' })).toEqual({
      qualified_at: now,
      care_stage: 'Đang chăm sóc',
    });
    expect(withInterestRule(c({ interest_level: 20, care_stage: 'Đang chăm sóc' }), { care_stage: 'Booking' })).toEqual(
      {
        care_stage: 'Booking',
      },
    );
    expect(withInterestRule(c({ interest_level: 60 }), { disqualified_at: now, interest_level: 35 })).toEqual({
      disqualified_at: now,
      interest_level: 35,
    });
    expect(withInterestRule(c({ interest_level: 0 }), { disqualified_at: now })).toEqual({ disqualified_at: now });
  });
});

describe('tự chuyển SLA mang theo mức quan tâm (D-033 + D-008)', () => {
  const ME = 'me-1';
  const entered = '2026-10-20T09:00:00+07:00';
  const now = Date.parse('2026-12-01T10:00:00+07:00');
  const care = (over: Partial<Customer> = {}) =>
    ({
      id: 'k1',
      phone: '0900000000',
      full_name: 'Khách thử',
      owner_id: ME,
      qualified_at: entered,
      care_stage: 'Đang chăm sóc',
      care_stage_history: [{ stage: 'Đang chăm sóc', at: entered, note: null }],
      created_at: entered,
      ...over,
    }) as Customer;

  it('tự chuyển Nuôi dài hạn: Nóng → Lạnh, mốc lịch sử giữ mức cũ; Hoàn tác trả mức cũ', () => {
    const [ch] = planSlaAutomation([care({ interest_level: 70 })], now, ME, () => null).changes;
    expect(ch?.patch).toEqual({ care_stage: 'Nuôi dài hạn', interest_level: 20 });
    expect(ch?.opts?.historyMeta).toEqual({ auto: 'sla', interest_before: 70 });
    const after = care({
      interest_level: 20,
      care_stage: 'Nuôi dài hạn',
      care_stage_history: [
        { stage: 'Đang chăm sóc', at: entered, note: null },
        { stage: 'Nuôi dài hạn', at: new Date(now).toISOString(), note: null, auto: 'sla', interest_before: 70 },
      ],
    });
    expect(planSlaUndo(after, now, ME)?.patch).toEqual({ care_stage: 'Đang chăm sóc', interest_level: 70 });
  });

  it('khách đã Lạnh: không ghi mức, Hoàn tác chỉ trả bậc', () => {
    const [ch] = planSlaAutomation([care({ interest_level: 20 })], now, ME, () => null).changes;
    expect(ch?.patch).toEqual({ care_stage: 'Nuôi dài hạn' });
    expect(ch?.opts?.historyMeta).toEqual({ auto: 'sla' });
  });
});
