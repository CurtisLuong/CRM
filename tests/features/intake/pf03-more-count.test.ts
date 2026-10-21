import { describe, expect, it } from 'vitest';
import { defaultIntakeValues } from '@/features/intake/model';
import { countMoreFilled, dobToIso } from '@/features/intake/view';

describe('PF-03: đếm trường đã điền trong khu "Thêm thông tin"', () => {
  it('form trống → 0', () => {
    expect(countMoreFilled({})).toBe(0);
    expect(countMoreFilled(defaultIntakeValues())).toBe(0);
    expect(countMoreFilled(null)).toBe(0);
  });

  it('đếm mỗi trường có giá trị và mỗi khoá advanced khác rỗng đúng 1', () => {
    expect(
      countMoreFilled({
        gender: 'nữ',
        dob: '15/08/1988',
        campaign: 'TC_T10',
        advanced: { life_stage: 'Mới cưới', pain_points: '' },
      }),
    ).toBe(4);
  });

  it('không đếm trường hiện sẵn, Mệnh/Cung hay giá trị rỗng', () => {
    const values = {
      ...defaultIntakeValues(),
      full_name: 'Nguyễn Thị Mai',
      phone: '0912345678',
      source_channel: 'facebook_ads',
      apt_type: '2N',
      projects: ['Dự án A'],
      qualify_now: true,
      care_stage_note: 'Đã gọi',
    };
    expect(countMoreFilled(values)).toBe(0);
    expect(countMoreFilled({ ...values, income: '   ', advanced: { household: null } })).toBe(0);
    expect(countMoreFilled({ ...values, income: '15 triệu', advanced: { household: '3 người' } })).toBe(2);
  });
});

describe('PF-03: ngày sinh dùng chung cho form và dòng Mệnh/Cung', () => {
  it('giữ nguyên cách đọc ngày/tháng và ngày/tháng/năm như trước', () => {
    expect(dobToIso('15/08/1988')).toBe('1988-08-15');
    expect(dobToIso('15/08')).toBe('--08-15');
    expect(dobToIso('')).toBeUndefined();
    expect(() => dobToIso('32/08/1988')).toThrow('Ngày sinh không hợp lệ.');
  });
});
