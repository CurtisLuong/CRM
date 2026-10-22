import { describe, expect, it } from 'vitest';
import { CARE_STAGE_BRANCH } from '@/config/stages';
import { stageOptionLabel } from '@/features/intake/model';

// CL-02 (Curtis 2026-10-22): ô Tiến độ ở form giữ giá trị lưu, chỉ thêm dấu nhánh cho Nuôi dài hạn.
describe('stageOptionLabel — ô Tiến độ', () => {
  it('Nuôi dài hạn có dấu nhánh + lời giải thích lấy từ CARE_STAGE_BRANCH', () => {
    const label = stageOptionLabel('Nuôi dài hạn');
    const hint = CARE_STAGE_BRANCH['Nuôi dài hạn']?.hint ?? '';
    expect(hint).not.toBe('');
    expect(label.startsWith('↳ Nuôi dài hạn')).toBe(true);
    expect(label).toContain(hint);
  });

  it('các bậc khác giữ nguyên tên, không thêm dấu nhánh', () => {
    for (const stage of ['Đăng kí mới', 'Đang tiếp cận', 'Đang chăm sóc', 'Xem dự án', 'Booking & Làm hồ sơ']) {
      expect(stageOptionLabel(stage)).toBe(stage);
    }
  });
});
