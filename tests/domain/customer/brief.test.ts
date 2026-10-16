import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';

const customer = (overrides: Partial<Customer> = {}) =>
  ({ id: 'c1', owner_id: 'u1', full_name: 'Trần Thị Lan', phone: '0901234567', ...overrides }) as Customer;

describe('customerBrief', () => {
  it('marks absent facts as unknown with useful questions', () => {
    const brief = customerBrief(customer());
    expect(brief).toHaveLength(7);
    expect(brief.filter((fact) => fact.value === 'Chưa biết')).toHaveLength(7);
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
});
