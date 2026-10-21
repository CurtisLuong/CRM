import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { interactionTitle, isSaleTouch, LEAD_FORM_KIND } from '@/domain/customer/interactions';
import { customerTimeline } from '@/domain/customer/timeline';
import { lastTouchMs } from '@/domain/signals/shared';

// Worker Meta Lead Ads gắn lần đăng ký lại vào khách cũ bằng 1 phần tử interactions kind 'lead_form'.
const leadForm = {
  at: '2026-10-19T02:00:00.000Z',
  channel: 'other',
  kind: LEAD_FORM_KIND,
  note: 'Form "NOXH Hải Phòng" · Loại căn: 2 phòng ngủ',
  campaign: 'NOXH HP T10',
  by: 'meta',
  origin: 'meta_lead_ads',
  lead_id: '1234567890',
};

const customer = (extra: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    phone: '0912345678',
    full_name: 'Nguyễn Văn A',
    owner_id: 'u1',
    created_at: '2026-09-01T02:00:00.000Z',
    call_attempts: [{ at: '2026-10-01T02:00:00.000Z', result: 'talked' }],
    ...extra,
  }) as Customer;

describe('lead form (khách tự đăng ký lại) không phải sale chạm khách', () => {
  it('có nhãn tiếng Việt, không lộ mã', () => {
    expect(interactionTitle(leadForm)).toBe('Đăng ký qua form quảng cáo');
    expect(customerTimeline(customer({ interactions: [leadForm] }))[0]).toMatchObject({
      kind: 'interaction',
      title: 'Đăng ký qua form quảng cáo',
    });
  });

  it('isSaleTouch loại lead_form, giữ mọi loại khác', () => {
    expect(isSaleTouch(leadForm)).toBe(false);
    expect(isSaleTouch({ kind: 'sent' })).toBe(true);
    expect(isSaleTouch({ kind: null })).toBe(true);
    expect(isSaleTouch(null)).toBe(false);
  });

  it('mốc lần cuối chạm khách bỏ qua lần đăng ký lại', () => {
    const plain = lastTouchMs(customer());
    expect(plain).toBe(Date.parse('2026-10-01T02:00:00.000Z'));
    expect(lastTouchMs(customer({ interactions: [leadForm] }))).toBe(plain);
    const zalo = { at: '2026-10-10T02:00:00.000Z', channel: 'zalo', kind: 'sent', origin: 'v2' };
    expect(lastTouchMs(customer({ interactions: [leadForm, zalo] }))).toBe(Date.parse(zalo.at));
  });
});
