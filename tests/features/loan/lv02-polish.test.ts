import { describe, expect, it } from 'vitest';
import { compute, DEFAULT_SCHEDULE } from '@/domain/loan';
import { buildInput, chartPaymentAt, initialState, scheduleLabel } from '@/features/loan/model';
import { loanPrintDocument } from '@/features/loan/print';

function sample() {
  const state = initialState({}, new Date('2026-10-05T09:00:00+07:00'));
  state.dates.handoverDate = '2027-11-15';
  return compute(buildInput(state));
}

describe('LV-02: chọn tháng/năm trên biểu đồ', () => {
  it.each([false, true])('chọn đúng số engine ở đầu, giữa và cuối lịch (theo năm: %s)', (yearly) => {
    const result = sample();
    const schedule = result.schedule;
    if (!schedule) throw new Error('Thiếu lịch trả nợ');
    const rows = yearly ? schedule.years : schedule.rows;
    for (const period of [1, yearly ? 6 : 61, rows.length]) {
      expect(chartPaymentAt(result, yearly, period)).toBe(
        yearly ? schedule.years[period - 1]?.avgPayment : schedule.rows[period - 1]?.payment,
      );
    }
  });

  it.each([false, true])('không chọn khi trống, ngoài khoảng hoặc không nguyên (theo năm: %s)', (yearly) => {
    const result = sample();
    const count = yearly ? result.schedule?.years.length : result.schedule?.rows.length;
    for (const period of [null, -1, 0, 1.5, (count ?? 0) + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(chartPaymentAt(result, yearly, period)).toBeNull();
    }
    expect(chartPaymentAt({ ...result, schedule: null }, yearly, 1)).toBeNull();
  });
});

describe('LV-02: nhãn ngắn chỉ ở lớp trình bày', () => {
  it('chỉ đổi hai nhãn mặc định, giữ nguyên tên khác và nhãn đã sửa', () => {
    expect(scheduleLabel(DEFAULT_SCHEDULE[0]?.label ?? '')).toBe('Kí HĐMB (T)');
    expect(scheduleLabel(DEFAULT_SCHEDULE[5]?.label ?? '')).toBe('Bàn giao + KPBT');
    for (const label of ['Đặt cọc riêng', 'Ký Hợp đồng mua bán (T) - đã sửa', 'constructor']) {
      expect(scheduleLabel(label)).toBe(label);
    }
  });

  it('phiếu in dùng nhãn ngắn, không đổi kết quả engine và vẫn in đủ mục', () => {
    const result = sample();
    const before = structuredClone(result);
    const html = loanPrintDocument(result, {});
    expect(html).toContain('Kí HĐMB (T)');
    expect(html).toContain('Bàn giao + KPBT');
    expect(html).not.toContain('Ký Hợp đồng mua bán (T)');
    for (const section of ['Phương án vay ngân hàng', 'Lịch trả nợ theo năm', 'Phương án tất toán sớm']) {
      expect(html).toContain(section);
    }
    expect(result).toEqual(before);
  });
});
