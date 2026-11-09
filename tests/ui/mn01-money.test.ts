import { describe, expect, it } from 'vitest';
import { customerBrief } from '@/domain/customer/brief';
import type { Customer } from '@/domain/customer/types';
import { formatMoney, incomeText, moneyValue, parseIncome, parseMoneyInput } from '@/ui/display';

describe('MN-01 định dạng tiền từ đồng', () => {
  it.each([
    [500_000_000, '500 triệu'],
    [12_500_000, '12,5 triệu'],
    [500_000, '0,5 triệu'],
    [1_000_000_000, '1 tỷ'],
    [1_250_000_000, '1,25 tỷ'],
    [2_058_000_000, '2,058 tỷ'],
    [15_000_000_000, '15 tỷ'],
    [1_234_567_890, '1,235 tỷ'],
    [12_345_678, '12,346 triệu'],
    [0, '0 triệu'],
    [null, ''],
    [undefined, ''],
    ['', ''],
  ])('%s → %s', (amount, expected) => expect(formatMoney(amount)).toBe(expected));

  it('dùng cùng quy tắc cho tiền mỗi tháng và chuỗi số cũ', () => {
    expect(formatMoney(25_000_000, true)).toBe('25 triệu/tháng');
    expect(formatMoney(1_250_000_000, true)).toBe('1,25 tỷ/tháng');
    expect(formatMoney('1250000000')).toBe('1,25 tỷ');
    expect(moneyValue('1250000000')).toBe(1_250_000_000);
    expect(moneyValue('2 tỷ')).toBeNull();
  });

  it('brief chỉ đổi định dạng, giữ nguyên dữ liệu và khoá lạ', () => {
    const customer = {
      id: 'c1',
      owner_id: 'u1',
      full_name: 'Lan',
      phone: '0901234567',
      finance: 500_000_000,
      advanced: { loan_need: '1250000000', monthly_payment: 12_500_000, unknown: { keep: true } },
      interests: [{ budget_max: 1_200_000_000, status: 'open' }],
    } as Customer;
    const before = structuredClone(customer);
    expect(customerBrief(customer).find((fact) => fact.key === 'finance')?.value).toBe(
      'Vốn 500 triệu · Ngân sách đợt quan tâm 1,2 tỷ · Vay 1,25 tỷ · Trả tháng 12,5 triệu/tháng',
    );
    expect(customer).toEqual(before);
  });
});

describe('MN-01 đọc ô số triệu', () => {
  it.each([
    ['1250', 1_250_000_000],
    ['0,5', 500_000],
    ['0.5', 500_000],
    ['1.250', 1_250_000_000],
    ['12,5', 12_500_000],
    ['1.250,5', 1_250_500_000],
    ['1.250.000', 1_250_000_000_000],
    ['0', 0],
    ['', null],
    [' ', null],
    ['500 triệu', undefined],
    ['abc', undefined],
    ['-2', undefined],
    ['1e3', undefined],
    ['1,2,3', undefined],
    ['NaN', undefined],
  ])('%s → %s đồng', (raw, expected) => expect(parseMoneyInput(raw)).toBe(expected));
});

describe('MN-01 thu nhập cũ và chuỗi chuẩn', () => {
  it.each([
    ['25', 25_000_000],
    ['25tr', 25_000_000],
    ['25 triệu', 25_000_000],
    ['25 tr/tháng', 25_000_000],
    ['khoảng 30 triệu', 30_000_000],
    ['25.000.000', 25_000_000],
    ['25000000', 25_000_000],
    ['25000000000', 25_000_000_000],
    ['100000', 100_000],
    ['0,5', 500_000],
    ['1250 triệu/tháng', 1_250_000_000],
    ['150000 triệu/tháng', 150_000_000_000],
    ['lương cứng + hoa hồng', undefined],
    ['', null],
    [null, null],
  ])('%s → %s đồng (chỉ đọc)', (raw, expected) => expect(parseIncome(raw)).toBe(expected));

  it('chuẩn hoá khi lưu, luôn dùng triệu và giữ cột chữ', () => {
    expect(incomeText(25_000_000)).toBe('25 triệu/tháng');
    expect(incomeText(1_250_000_000)).toBe('1250 triệu/tháng');
    expect(incomeText(12_500_000)).toBe('12,5 triệu/tháng');
    expect(incomeText(null)).toBeNull();
  });
});
