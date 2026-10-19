import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { listCardSub, relativeAgo } from '@/features/customers/model';

const now = new Date(2026, 9, 19, 9, 30).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const c = (over: Partial<Customer> = {}) =>
  ({ id: 'c', owner_id: 'u', full_name: 'A', phone: '0901234567', ...over }) as Customer;

describe('relativeAgo', () => {
  it.each([
    [at(19, 8), 'Hôm nay'],
    [at(18, 23), 'Hôm qua'],
    [at(16, 9), '3 ngày trước'],
    [at(5, 9), '2 tuần trước'],
    [new Date(2026, 7, 1).toISOString(), '2 tháng trước'],
  ])('%s → %s', (iso, text) => {
    expect(relativeAgo(Date.parse(iso), now)).toBe(text);
  });
});

describe('listCardSub', () => {
  it('quên gọi (khung 07:00–08:00, giờ 09:30 — D-010) → đỏ, đứng đầu', () => {
    expect(
      listCardSub(
        c({ next_call_at: at(19, 7), next_call_end: at(19, 8), care_stage: 'Xem dự án', projects: ['NOXH Yên Mỹ'] }),
        now,
      ),
    ).toEqual({ lead: { text: 'Quên gọi 07:00', tone: 'over' }, rest: 'Xem dự án · NOXH Yên Mỹ' });
  });

  it('đến giờ gọi → vàng', () => {
    expect(listCardSub(c({ next_call_at: at(19, 9, 15), next_call_end: at(19, 9, 45) }), now).lead).toEqual({
      text: 'Đến giờ gọi',
      tone: 'soon',
    });
  });

  it('hẹn gọi trong 24 giờ tới → "Hẹn gọi HH:mm", không màu', () => {
    expect(listCardSub(c({ next_call_at: at(19, 14), next_call_end: at(19, 15) }), now).lead).toEqual({
      text: 'Hẹn gọi 14:00',
    });
  });

  it('không hẹn → lần liên hệ cuối tương đối; bậc + loại căn', () => {
    expect(
      listCardSub(
        c({ call_attempts: [{ at: at(17, 10), result: 'talked' }], care_stage: 'Đang chăm sóc', apt_type: '2PN' }),
        now,
      ),
    ).toEqual({ lead: { text: '2 ngày trước' }, rest: 'Đang chăm sóc · 2PN' });
  });

  it('khách trống → không lead, rest rỗng', () => {
    expect(listCardSub(c(), now)).toEqual({ lead: undefined, rest: '' });
  });
});
