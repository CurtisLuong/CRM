import { describe, expect, it } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import { compute } from '@/domain/loan';
import { applyCatalog, buildInput, initialState, LOAN_ESTIMATE_WARNING, restoreLoanState } from '@/features/loan/model';
import { buildLoanPrintHTML, loanPrintDocument } from '@/features/loan/print';

function sample() {
  const state = initialState({ projectName: 'Dự án thử' }, new Date('2026-10-05T03:00:00Z'));
  state.dates.handoverDate = '2027-11-15';
  return state;
}

describe('LV-03: VAT/KPBT riêng cho phương án', () => {
  it('bản cũ lấy dự án, thiếu dự án dùng 5/2, kể cả dự án có giá trị 0', () => {
    const state = sample();
    expect(buildInput(state).unit).toMatchObject({ vatRate: 5, kpbtRate: 2 });
    expect(buildInput(state, { vat_rate: 8, kpbt_rate: 3 }).unit).toMatchObject({ vatRate: 8, kpbtRate: 3 });
    expect(buildInput(state, { vat_rate: 0, kpbt_rate: 0 }).unit).toMatchObject({ vatRate: 0, kpbtRate: 0 });
    const old = restoreLoanState(state);
    expect(buildInput(old, { vat_rate: 10, kpbt_rate: 1 }).unit).toMatchObject({ vatRate: 10, kpbtRate: 1 });
  });

  it('sửa tay thắng dự án, lưu/mở giữ thuế, số engine và thuộc tính lạ; không sửa dữ liệu gốc', () => {
    const state = sample();
    state.unit = { ...state.unit, vatRate: 7.5, kpbtRate: 0, extension: { keep: true } };
    const project = { vat_rate: 10, kpbt_rate: 2 };
    const before = structuredClone({ state, project });
    const result = compute(buildInput(state, project));
    const restored = restoreLoanState(JSON.parse(JSON.stringify(state)));
    expect(compute(buildInput(restored, { vat_rate: 1, kpbt_rate: 9 }))).toEqual(result);
    expect(result.price.vat).toBe(Math.round((result.price.net * 7.5) / 100));
    expect(result.price.kpbt).toBe(0);
    expect(result.loan.amount).toBe(Math.round(result.price.gross * 0.7));
    expect(restored.unit.extension).toEqual({ keep: true });
    expect({ state, project }).toEqual(before);
  });

  it('áp giỏ hàng điền thuế nhưng giữ số đã chỉnh và không ghi ngược dự án', () => {
    const project = { id: 'project', vat_rate: 8, kpbt_rate: 3 };
    const catalog = {
      projectByName: () => project,
      buildingByCode: () => null,
      projectFee: () => null,
    } as unknown as RepositoryAccount['catalog'];
    const state = sample();
    const before = structuredClone({ project, state });
    const applied = applyCatalog(state, catalog);
    expect(buildInput(applied, project).unit).toMatchObject({ vatRate: 8, kpbtRate: 3 });
    expect(buildInput(applied, { ...project, vat_rate: 10, kpbt_rate: 2 }).unit).toMatchObject({
      vatRate: 10,
      kpbtRate: 2,
    });
    const manual = { ...state, unit: { ...state.unit, vatRate: 0, kpbtRate: 1.5 } };
    expect(applyCatalog(manual, catalog).unit).toMatchObject({ vatRate: 0, kpbtRate: 1.5 });
    expect({ project, state }).toEqual(before);
  });
});

describe('LV-03: cảnh báo và tư vấn viên trên phiếu PDF', () => {
  it('tiêu đề → PTG → cảnh báo có khung → tư vấn viên → bảng; giữ nhãn PDF và escape tên/SĐT', () => {
    const result = compute(buildInput(sample()));
    const html = loanPrintDocument(result, { consultant: { name: 'An <b>x</b>', phone: '<090>' } });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(
      Array.from(doc.querySelector('.lm-print')?.children ?? [])
        .slice(0, 5)
        .map((node) => node.tagName),
    ).toEqual(['H1', 'DIV', 'DIV', 'P', 'DIV']);
    expect(doc.querySelector('.sub')?.nextElementSibling?.getAttribute('role')).toBe('note');
    const warning = doc.querySelector('[role="note"]');
    expect(warning?.textContent).toBe(LOAN_ESTIMATE_WARNING);
    expect(warning?.nextElementSibling?.textContent).toBe('Tư vấn viên: An <b>x</b> · <090>');
    expect(doc.querySelectorAll('p b').length).toBe(3);
    expect(doc.querySelector('.foot')?.textContent).not.toContain('Tư vấn viên:');
    expect(doc.body.textContent).toContain('Số tiền vay');
    expect(doc.querySelector('p b')?.textContent).toBe('Tư vấn viên:');
    expect(doc.querySelector('p')?.querySelectorAll('b').length).toBe(1);
  });

  it('không có tên thì bỏ dòng tư vấn viên, cảnh báo vẫn còn', () => {
    const html = buildLoanPrintHTML(compute(buildInput(sample())), { consultant: { phone: '0900000000' } });
    expect(html).not.toContain('Tư vấn viên:');
    expect(html).toContain(LOAN_ESTIMATE_WARNING);
  });
});
