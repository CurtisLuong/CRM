import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { compute } from '@/domain/loan';
import {
  buildInput,
  customerUnit,
  initialState,
  loanPath,
  quoteSummary,
  readPrefill,
  restoreLoanState,
  validateState,
} from '@/features/loan/model';
import { buildLoanPrintHTML } from '@/features/loan/print';

const sample = () => {
  const s = initialState(
    { code: 'R30413', area: 53.6, pricePerM2: 19911530, netOverride: 1067258010 },
    new Date('2026-10-05T09:00:00'),
  );
  s.dates.handoverDate = '2027-11-15';
  return s;
};
describe('loan feature contract', () => {
  it('encodes apartment prefill, omits arbitrary/customer PII fields', () => {
    const url = loanPath({
      customerId: 'customer-a',
      projectName: 'Tràng Cát & Rise',
      area: 53.6,
      phone: 'do not put in URL',
    });
    expect(url).not.toContain('phone');
    expect(readPrefill(new URL(url, 'https://crm.test').searchParams)).toEqual({
      customerId: 'customer-a',
      projectName: 'Tràng Cát & Rise',
      area: 53.6,
    });
  });
  it('prefills apartment fields without changing supplied customer data', () => {
    const c = {
      id: 'a',
      owner_id: 'u',
      phone: '0900000000',
      full_name: 'Lan',
      projects: ['Tràng Cát'],
      apt_code: 'R30413',
      apt_area: 53.6,
      building_code: 'R3',
      apt_type: '2N-2WC',
      unknown: { keep: true },
    };
    const before = structuredClone(c);
    expect(customerUnit(c)).toEqual({
      projectName: 'Tràng Cát',
      code: 'R30413',
      area: 53.6,
      building: 'R3',
      aptType: '2N-2WC',
    });
    expect(c).toEqual(before);
  });
  it('builds exact v1 inputs, including 1.5-month title date, preserving unknown state', () => {
    const s = sample();
    s.future = { keep: true };
    s.unit.future = 'yes';
    const before = structuredClone(s);
    const input = buildInput(s);
    expect(input.schedule?.at(-1)?.due).toEqual({ type: 'afterHandoverMonths', value: 1.5 });
    const r = compute(input);
    expect(r.price.full).toBe(1141966071);
    expect(quoteSummary(r)).toMatchObject({ loan: 784434638, full: 1141966071, presetKey: 'nq33' });
    expect(s).toEqual(before);
  });
  it('rejects incomplete/unsafe inputs before invoking engine', () => {
    expect(validateState(initialState())).toContain('ngày');
    const s = sample();
    s.loan.termYears = 100;
    expect(validateState(s)).toContain('50');
    s.loan.termYears = 25;
    s.loan.rateTiers[0] = { months: 0, rate: -1 };
    expect(validateState(s)).toContain('bậc lãi');
  });
  it('round-trips stored quote extensions and rejects malformed rate arrays', () => {
    const s = sample();
    s.future = { keep: true };
    s.unit.future = 'retained';
    expect(restoreLoanState(s)).toEqual(s);
    expect(() => restoreLoanState({ ...s, loan: { ...s.loan, rateTiers: null } })).toThrow('không hợp lệ');
  });
});
describe('PDF content parity with v1', () => {
  it('retains every v1 report field and section, escaping customer data', () => {
    const context = { window: { LoanPDF: undefined as unknown } };
    runInNewContext(readFileSync('legacy/js/loan/loan-pdf.js', 'utf8'), context);
    const old = context.window.LoanPDF as { buildHTML: (r: unknown, c: unknown) => string };
    const r = compute(buildInput(sample()));
    const ctx = {
      projectName: 'Tràng Cát',
      unitCode: 'R30413',
      building: 'R3',
      aptType: '2N-2WC',
      customer: { name: 'Lan <script>x</script>' },
      consultant: { name: 'Curtis', phone: '0900000000' },
    };
    expect(buildLoanPrintHTML(r, ctx)).toBe(old.buildHTML(r, ctx));
    expect(buildLoanPrintHTML(r, ctx)).toContain('&lt;script&gt;');
    expect(buildLoanPrintHTML(r, ctx)).toContain('Lịch trả nợ theo năm');
    expect(buildLoanPrintHTML(r, ctx)).toContain('Phương án tất toán sớm');
  });
  it('refuses a report with no repayment schedule', () => {
    const r = compute(buildInput(sample()));
    expect(() => buildLoanPrintHTML({ ...r, schedule: null })).toThrow('Chưa có lịch');
  });
});
