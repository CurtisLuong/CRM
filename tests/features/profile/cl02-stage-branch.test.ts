import { describe, expect, it } from 'vitest';
import { CARE_STAGE_BRANCH } from '@/config/stages';
import { stageChoiceRows, stageChoicesFor } from '@/features/profile/model';

// CL-02 (Curtis 2026-10-22): Nuôi dài hạn là nhánh của Đang chăm sóc, đứng ngay sau bậc đó.
describe('stageChoicesFor — thứ tự có nhánh (CL-02)', () => {
  it('Đang chăm sóc → Nuôi dài hạn đứng ngay sau, rồi mới tới Xem dự án / Booking', () => {
    expect(stageChoicesFor('Đang chăm sóc')).toEqual([
      'Đăng kí mới',
      'Đang tiếp cận',
      'Đang chăm sóc',
      'Nuôi dài hạn',
      'Xem dự án',
      'Booking & Làm hồ sơ',
    ]);
  });

  it('bậc ngoài danh sách (đã chốt/loại) vẫn đứng đầu, không đổi hợp đồng cũ', () => {
    expect(stageChoicesFor('Kí HĐMB')[0]).toBe('Kí HĐMB');
    expect(stageChoicesFor('Loại')[0]).toBe('Loại');
    expect(stageChoicesFor('Kí HĐMB').slice(1)).toEqual(stageChoicesFor('Đang chăm sóc'));
  });

  it('không cho chọn Kí HĐMB / Loại khi khách đang trong phễu', () => {
    const options = stageChoicesFor('Đang chăm sóc');
    expect(options).not.toContain('Kí HĐMB');
    expect(options).not.toContain('Loại');
  });

  it('Nuôi dài hạn đang là bậc hiện tại → giữ nguyên vị trí nhánh, không nhân đôi', () => {
    const options = stageChoicesFor('Nuôi dài hạn');
    expect(options.filter((option) => option === 'Nuôi dài hạn')).toHaveLength(1);
    expect(options.indexOf('Nuôi dài hạn')).toBe(options.indexOf('Đang chăm sóc') + 1);
  });
});

describe('stageChoiceRows — dấu nhánh trong sheet', () => {
  it('chỉ Nuôi dài hạn có hint nhánh, lấy từ CARE_STAGE_BRANCH', () => {
    const rows = stageChoiceRows('Đang chăm sóc');
    const hint = CARE_STAGE_BRANCH['Nuôi dài hạn']?.hint;
    expect(hint).toBeTruthy();
    expect(rows.find((row) => row.stage === 'Nuôi dài hạn')?.hint).toBe(hint);
    expect(hint).toContain('không tính SLA');
    expect(rows.filter((row) => row.hint)).toHaveLength(1);
  });

  it('nhãn hiển thị lấy CARE_STAGE_DISPLAY khi có (Kí HĐMB → Đã ký HĐMB)', () => {
    const won = stageChoiceRows('Kí HĐMB')[0];
    expect(won).toMatchObject({ stage: 'Kí HĐMB', label: 'Đã ký HĐMB' });
    expect(won?.hint).toBeUndefined();
  });
});
