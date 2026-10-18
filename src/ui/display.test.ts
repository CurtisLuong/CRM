import { describe, expect, it } from 'vitest';
import { callResultLabel, displayDate, displayDateTime, displayText, intakeLabel, sourceLabel } from './display';

// Giờ local: test chạy với TZ của máy; dùng Date local để dựng chuỗi kỳ vọng.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('display (D-023 L3)', () => {
  it('displayText: chuỗi, số, boolean', () => {
    expect(displayText('  Đăng ký từ form ')).toBe('Đăng ký từ form');
    expect(displayText(85)).toBe('85');
    expect(displayText(Number.NaN)).toBe('');
    expect(displayText(false)).toBe('Không');
    expect(displayText(null)).toBe('');
    expect(displayText(undefined)).toBe('');
  });

  it('displayText: object/mảng không bao giờ ra "[object Object]"', () => {
    expect(displayText({ at: '2026-10-17T08:00:00.000Z', text: 'mảng thay vì chuỗi' })).toBe('mảng thay vì chuỗi');
    expect(displayText({ name: 'TD-T10' })).toBe('TD-T10');
    expect(displayText({ foo: 1 })).toBe('');
    expect(displayText([{ text: 'a' }, 'b', null])).toBe('a · b');
  });

  it('displayText: chuỗi ISO → giờ + ngày', () => {
    expect(displayText(local(2026, 10, 4, 9, 5))).toBe('09:05 04/10/2026');
  });

  it('displayDate / displayDateTime', () => {
    expect(displayDate(local(2026, 1, 9, 23, 59))).toBe('09/01/2026');
    expect(displayDateTime(local(2026, 12, 31, 7, 0))).toBe('07:00 31/12/2026');
    expect(displayDate('không phải ngày')).toBe('');
    expect(displayDate(null)).toBe('');
  });

  it('callResultLabel', () => {
    expect(callResultLabel('talked')).toBe('Nói chuyện được');
    expect(callResultLabel('no_answer')).toBe('Không nghe máy');
    expect(callResultLabel('busy')).toBe('Bận, hẹn gọi lại');
    expect(callResultLabel(null)).toBe('Chưa ghi kết quả');
    expect(callResultLabel('ma_la')).toBe('Kết quả khác');
  });

  it('sourceLabel: mã mới, mã cũ, mã lạ', () => {
    expect(sourceLabel('facebook_ads')).toBe('Facebook Ads');
    expect(sourceLabel('website')).toBe('Landing page');
    expect(sourceLabel('landing')).toBe('Landing page');
    expect(sourceLabel('tiktok_xyz')).toBe('Nguồn khác');
    expect(sourceLabel('')).toBe('');
  });

  it('intakeLabel', () => {
    expect(intakeLabel('ocr')).toBe('Từ ảnh chụp');
    expect(intakeLabel('api')).toBe('Tự động (landing / Facebook)');
    expect(intakeLabel('khác')).toBe('');
  });
});
