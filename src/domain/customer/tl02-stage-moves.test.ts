import { describe, expect, it } from 'vitest';
import { canMoveStage } from './stageMoves';

describe('TL-02 · không lùi bậc', () => {
  it('chặn Đang chăm sóc → Đăng kí mới, cho sang Nuôi dài hạn', () => {
    expect(canMoveStage('Đang chăm sóc', 'Đăng kí mới')).toBe(false);
    expect(canMoveStage('Đang chăm sóc', 'Nuôi dài hạn')).toBe(true);
  });

  it('Nuôi dài hạn cùng hạng Đang chăm sóc: quay lại Đang chăm sóc được, xuống Đang tiếp cận thì không', () => {
    expect(canMoveStage('Nuôi dài hạn', 'Đang chăm sóc')).toBe(true);
    expect(canMoveStage('Nuôi dài hạn', 'Đang tiếp cận')).toBe(false);
  });

  it('từ Xem dự án vẫn vào Nuôi dài hạn (nhánh luôn mở)', () => {
    expect(canMoveStage('Xem dự án', 'Nuôi dài hạn')).toBe(true);
  });

  it('tên cũ "Booking" đọc như Booking & Làm hồ sơ', () => {
    expect(canMoveStage('Xem dự án', 'Booking')).toBe(true);
    expect(canMoveStage('Booking', 'Xem dự án')).toBe(false);
    expect(canMoveStage('Booking', 'Booking & Làm hồ sơ')).toBe(false);
    expect(canMoveStage('Hỗ trợ hồ sơ', 'Booking')).toBe(false);
  });

  it('cùng bậc, Loại và bậc lạ không phải đích hợp lệ', () => {
    expect(canMoveStage('Đang chăm sóc', 'Đang chăm sóc')).toBe(false);
    expect(canMoveStage('Đang chăm sóc', 'Loại')).toBe(false);
    expect(canMoveStage('Đang chăm sóc', 'Bậc lạ')).toBe(false);
  });

  it('lên Kí HĐMB được, từ Kí HĐMB không lùi', () => {
    expect(canMoveStage('Booking & Làm hồ sơ', 'Kí HĐMB')).toBe(true);
    expect(canMoveStage('Kí HĐMB', 'Booking & Làm hồ sơ')).toBe(false);
  });
});
