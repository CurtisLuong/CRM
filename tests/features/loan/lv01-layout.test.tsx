import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compute } from '@/domain/loan';
import { LoanCalculator } from '@/features/loan/LoanCalculator';
import {
  appendFixedRateTier,
  buildInput,
  initialState,
  money,
  quoteToAutoOpen,
  remainingRateMonths,
  removeLastFixedRateTier,
  restoreLoanState,
} from '@/features/loan/model';

const sample = () => {
  const state = initialState({}, new Date('2026-10-05T09:00:00+07:00'));
  state.dates.handoverDate = '2027-11-15';
  return state;
};

describe('LV-01: bậc cố định nối tiếp, thả nổi ở cuối', () => {
  it('240 → 180 tháng; thêm/xoá giữ nguyên thả nổi và không sửa đầu vào', () => {
    const original = sample().loan;
    expect(remainingRateMonths(original)).toBe(240);
    const added = appendFixedRateTier(original);
    added.rateTiers[1] = { months: 60, rate: 7.5 };
    expect(remainingRateMonths(added)).toBe(180);
    expect(added.floatingRate).toBe(10);
    const removed = removeLastFixedRateTier(added);
    expect(removed).toEqual(original);
    expect(original.rateTiers).toEqual([{ months: 60, rate: 6.5 }]);
  });

  it('bậc cố định phủ đủ/vượt thời hạn: còn lại 0, vẫn tính được', () => {
    const state = sample();
    for (const months of [300, 360]) {
      state.loan.rateTiers = [{ months, rate: 6.5 }];
      expect(remainingRateMonths(state.loan)).toBe(0);
      expect(compute(buildInput(state)).schedule?.totalInterest).toBeGreaterThan(0);
    }
  });

  it('tổng trên màn khớp compute với hai bậc 60 tháng 6,5% / 60 tháng 7,5%', () => {
    render(<LoanCalculator />);
    fireEvent.change(screen.getByLabelText('Ngày ký hợp đồng', { exact: true }), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Ngày bàn giao', { exact: true }), { target: { value: '2027-11-15' } });
    expect((screen.getByLabelText('Bậc 2: còn lại') as HTMLInputElement).value).toBe(String('240 tháng'));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm bậc lãi' }));
    fireEvent.change(screen.getByLabelText('Bậc 2: số tháng'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Bậc 2: lãi suất'), { target: { value: '7.5' } });
    expect((screen.getByLabelText('Bậc 3: còn lại') as HTMLInputElement).value).toBe(String('180 tháng'));
    const state = sample();
    state.loan.rateTiers = [
      { months: 60, rate: 6.5 },
      { months: 60, rate: 7.5 },
    ];
    state.loan.floatingRate = 10;
    const expected = compute(buildInput(state));
    const totals = within(screen.getByRole('table', { name: 'Tổng' }));
    expect(
      totals.getByRole('row', { name: `Tổng lãi ${money(expected.schedule?.totalInterest ?? 0)} đ` }),
    ).toBeTruthy();
    expect(
      totals.getByRole('row', { name: `Tổng trả ngân hàng ${money(expected.schedule?.totalPaid ?? 0)} đ` }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ bậc cố định cuối' }));
    expect((screen.getByLabelText('Bậc 2: còn lại') as HTMLInputElement).value).toBe(String('240 tháng'));
    expect((screen.getByLabelText('Bậc 2: thả nổi') as HTMLInputElement).value).toBe(String(10));
  });
});

describe('LV-01: chọn phương án tự mở', () => {
  const older = { id: 'old', created_at: '2026-11-01T00:00:00Z' };
  const newest = { id: 'new', created_at: '2026-11-12T00:00:00Z' };
  it('không phụ thuộc thứ tự, một bản thì chọn bản đó, không sửa danh sách', () => {
    const quotes = [older, newest];
    expect(quoteToAutoOpen(quotes, { customerId: 'a' })).toBe(newest);
    expect(quoteToAutoOpen([older], {})).toBe(older);
    expect(quoteToAutoOpen([], {})).toBeNull();
    expect(quotes).toEqual([older, newest]);
  });
  it.each(['projectName', 'building', 'code', 'aptType', 'area', 'pricePerM2', 'netOverride'])(
    'URL có %s thì không tự mở',
    (field) => {
      expect(
        quoteToAutoOpen([newest], { [field]: ['area', 'pricePerM2', 'netOverride'].includes(field) ? 60 : 'A' }),
      ).toBeNull();
    },
  );
  it('mở phương án cũ giữ consultant và thuộc tính lạ', () => {
    const state = { ...sample(), consultant: { name: 'Tên cũ', phone: '0900000000' }, extension: { keep: true } };
    expect(restoreLoanState(state)).toEqual(state);
  });
});
