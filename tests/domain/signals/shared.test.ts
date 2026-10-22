import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { hasSaleTouch, lastTouchMs } from '@/domain/signals/shared';

describe('lastTouchMs', () => {
  it('uses the latest saved interaction as a contact touch', () => {
    const customer = {
      id: 'c1',
      owner_id: 'u1',
      full_name: 'Lan',
      phone: '0901234567',
      call_attempts: [{ at: '2026-10-12T00:00:00.000Z' }],
      interactions: [{ at: '2026-10-16T03:00:00.000Z', channel: 'visit', kind: 'project_view' }],
    } as Customer;
    expect(lastTouchMs(customer)).toBe(Date.parse('2026-10-16T03:00:00.000Z'));
  });
});

describe('hasSaleTouch', () => {
  const base = { id: 'c1', owner_id: 'u1', full_name: 'Lan', phone: '0901234567' } as Customer;
  it('khách mới chỉ có mốc bậc lúc tạo + form quảng cáo → chưa tương tác', () => {
    const customer = {
      ...base,
      care_stage_updated_at: '2026-10-12T00:00:00.000Z',
      care_stage_history: [{ stage: 'Mới', at: '2026-10-12T00:00:00.000Z' }],
      interactions: [{ at: '2026-10-12T00:00:00.000Z', channel: 'facebook', kind: 'lead_form' }],
      notes_manual: [{ at: '2026-10-12T00:00:00.000Z', text: 'Dự kiến mua: 2026', origin: 'meta_lead_ads' }],
    } as unknown as Customer;
    expect(hasSaleTouch(customer)).toBe(false);
  });
  it.each([
    ['cuộc gọi', { call_attempts: [{ at: '2026-10-12T00:00:00.000Z' }] }],
    ['ghi chú của sale', { notes_manual: [{ at: '2026-10-12T00:00:00.000Z', text: 'Hỏi giá' }] }],
    ['gửi Zalo', { interactions: [{ at: '2026-10-12T00:00:00.000Z', channel: 'zalo', kind: 'sent' }] }],
  ])('%s → đã tương tác', (_label, over) => {
    expect(hasSaleTouch({ ...base, ...over } as unknown as Customer)).toBe(true);
  });
});
