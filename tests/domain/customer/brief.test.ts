import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';

const customer = (overrides: Partial<Customer> = {}) =>
  ({ id: 'c1', owner_id: 'u1', full_name: 'Trần Thị Lan', phone: '0901234567', ...overrides }) as Customer;

describe('customerBrief', () => {
  it('marks absent facts as unknown with useful questions', () => {
    const brief = customerBrief(customer());
    expect(brief).toHaveLength(8);
    expect(brief.filter((fact) => fact.value === 'Chưa biết')).toHaveLength(8);
    expect(brief[0]?.question).toContain('mua để');
  });

  it('uses only saved facts and the latest contact/promise, without changing customer data', () => {
    const c = customer({
      purpose: 'Ở',
      projects: ['Tràng Cát'],
      apt_type: '2N-2WC',
      finance: 500000000,
      advanced: { decision_influencers: 'Chồng', loan_need: '700000000', x_unknown: { keep: true } },
      next_tasks: [{ at: '2026-10-15T00:00:00.000Z', text: 'Gửi bảng giá', side: 'me' }],
      notes_manual: [{ at: '2026-10-15T00:00:00.000Z', text: 'Ngại lãi suất' }],
    });
    const before = structuredClone(c);
    const brief = customerBrief(c);
    expect(brief.find((fact) => fact.key === 'purpose')?.value).toBe('Ở');
    expect(brief.find((fact) => fact.key === 'need')?.value).toContain('Tràng Cát');
    expect(brief.find((fact) => fact.key === 'decision')?.value).toBe('Chồng');
    expect(brief.find((fact) => fact.key === 'promise')?.value).toBe('Gửi bảng giá');
    expect(brief.find((fact) => fact.key === 'objection')?.value).toBe('Ngại lãi suất');
    expect(c).toStrictEqual(before);
  });

  it('counts a sent interaction as last contact even when it has no note', () => {
    const c = customer({
      notes_manual: [{ at: '2026-10-15T00:00:00.000Z', text: 'Ghi chú cũ' }],
      interactions: [{ at: '2026-10-16T04:30:00.000Z', channel: 'zalo', kind: 'sent' }],
    });
    expect(customerBrief(c).find((fact) => fact.key === 'last_contact')?.value).toBe(
      new Date('2026-10-16T04:30:00.000Z').toLocaleString('vi-VN'),
    );
  });

  it('uses open interest cycles and their budget in the brief', () => {
    const brief = customerBrief(
      customer({
        projects: ['Dự án đầu'],
        interests: [
          {
            id: 'i1',
            project: 'Dự án thứ hai',
            apt_type: '2N',
            budget_max: 1_500_000_000,
            purpose: 'Ở',
            status: 'open',
          },
          { id: 'i2', project: 'Đợt đã khép', status: 'lost' },
        ],
      }),
    );
    expect(brief.find((fact) => fact.key === 'need')?.value).toContain('Dự án thứ hai');
    expect(brief.find((fact) => fact.key === 'need')?.value).toContain('Dự án đầu');
    expect(brief.find((fact) => fact.key === 'finance')?.value).toContain('1500000000');
    expect(brief.find((fact) => fact.key === 'purpose')?.value).toBe('Ở');
  });

  it('surfaces the no-contact preference in the brief', () => {
    const brief = customerBrief(customer({ contact_prefs: { do_not_contact: true, dnc_reason: 'Khách xin dừng' } }));
    expect(brief.find((fact) => fact.key === 'contact_preference')?.value).toBe('Không liên hệ · Khách xin dừng');
  });
});
