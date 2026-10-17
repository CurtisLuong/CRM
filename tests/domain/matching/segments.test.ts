import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import {
  customerSegmentReasons,
  DEFAULT_RETARGET_FILTERS,
  filterRetargetCustomers,
  isRetargetEligible,
} from '@/domain/matching/segments';

const customer = (id: string, fields: Partial<Customer> = {}) =>
  ({ id, owner_id: 'me', full_name: id, phone: '0901234567', ...fields }) as Customer;

describe('retarget segments', () => {
  it('treats DNC as a hard eligibility gate for every filter', () => {
    const dnc = customer('no', { contact_prefs: { do_not_contact: true, dnc_reason: 'Đề nghị không gọi' } });
    const allowed = customer('yes', { apt_type: '2N', projects: ['P'] });
    expect(isRetargetEligible(dnc, 'me')).toBe(false);
    expect(filterRetargetCustomers([dnc, allowed], DEFAULT_RETARGET_FILTERS, 'me')).toEqual([allowed]);
    expect(filterRetargetCustomers([dnc, allowed], { ...DEFAULT_RETARGET_FILTERS, aptType: '2N' }, 'me')).toEqual([
      allowed,
    ]);
  });

  it('excludes customers assigned to someone else and matches structured fields only', () => {
    const own = customer('own', {
      apt_type: '2N-2WC',
      projects: ['Khu A'],
      purpose: 'Ở',
      residence: 'Hải Phòng',
      occupation: 'Giáo viên',
      close_reason: 'thoi_diem',
      interests: [{ project: 'Khu A', timeline: '6 tháng', status: 'open' }],
      retarget_hint: { max_price: 2_000_000_000, projects: ['Khu A'] },
    });
    const assignedElsewhere = customer('other', { owner_id: 'them', apt_type: '2N-2WC' });
    const filters = {
      ...DEFAULT_RETARGET_FILTERS,
      aptType: '2N',
      project: 'Khu A',
      purpose: 'Ở',
      region: 'hải phòng',
      occupation: 'giáo viên',
      timeline: '6 tháng',
      closeReason: 'thoi_diem',
      maxBudget: '2500000000',
    };
    expect(filterRetargetCustomers([own, assignedElsewhere], filters, 'me')).toEqual([own]);
    expect(customerSegmentReasons(own, filters)).toEqual([
      'Đúng loại căn',
      'Đã quan tâm dự án',
      'Đúng mục đích',
      'Đúng thời điểm dự kiến',
      'Phù hợp lý do kết thúc',
    ]);
  });

  it('does not invent budget from equity or accept customers with unknown budget under a cap', () => {
    const known = customer('known', { finance: 400_000_000, retarget_hint: { max_price: 1_800_000_000 } });
    const unknown = customer('unknown', { finance: 900_000_000 });
    expect(
      filterRetargetCustomers([known, unknown], { ...DEFAULT_RETARGET_FILTERS, maxBudget: '2000000000' }, 'me'),
    ).toEqual([known]);
  });

  it('filters by explicit last-contact cutoff and excludes missing history', () => {
    const old = customer('old', { interactions: [{ at: '2026-01-01T00:00:00.000Z', channel: 'meet' }] });
    const recent = customer('recent', { interactions: [{ at: '2026-10-16T00:00:00.000Z', channel: 'zalo' }] });
    const missing = customer('missing');
    expect(
      filterRetargetCustomers(
        [old, recent, missing],
        { ...DEFAULT_RETARGET_FILTERS, contactedBefore: '2026-09-01' },
        'me',
        Date.parse('2026-10-17T00:00:00.000Z'),
      ),
    ).toEqual([old]);
  });

  it('does not surface customers before their saved retarget-after date', () => {
    const customerWithFutureHint = customer('wait', { retarget_hint: { after: '2026-11-01' } });
    expect(
      filterRetargetCustomers([customerWithFutureHint], DEFAULT_RETARGET_FILTERS, 'me', Date.parse('2026-10-17')),
    ).toEqual([]);
    expect(
      filterRetargetCustomers([customerWithFutureHint], DEFAULT_RETARGET_FILTERS, 'me', Date.parse('2026-11-02')),
    ).toEqual([customerWithFutureHint]);
  });
});
