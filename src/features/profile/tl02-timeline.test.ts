import { describe, expect, it } from 'vitest';
import { formatStageDuration } from '@/components/crm/timeline';
import { stageDisplayTitle, timelineEntryTarget } from './model';

const at = (day: string, time: string) => new Date(`2026-${day}T${time}:00+07:00`);

describe('TL-02 · thời gian ở bậc', () => {
  it('ba số chuẩn của luật 3', () => {
    expect(formatStageDuration(at('10-08', '16:10'), at('10-09', '22:29'), at('11-09', '10:53'))).toBe('1 ngày 6 giờ');
    expect(formatStageDuration(at('10-09', '22:29'), at('10-30', '10:53'), at('11-09', '10:53'))).toBe(
      '20 ngày 12 giờ',
    );
    expect(formatStageDuration(at('10-30', '10:53'), undefined, at('11-09', '10:53'))).toBe('10 ngày · đang ở');
  });

  it('dưới 1 ngày dùng giờ/phút, dưới 1 giờ dùng phút, tối thiểu 1 phút', () => {
    expect(formatStageDuration(at('11-09', '09:00'), at('11-09', '10:30'), at('11-09', '10:53'))).toBe('1 giờ 30 phút');
    expect(formatStageDuration(at('11-09', '10:08'), at('11-09', '10:53'), at('11-09', '10:53'))).toBe('45 phút');
    expect(formatStageDuration(at('11-09', '10:52'), at('11-09', '10:53'), at('11-09', '10:53'))).toBe('1 phút');
  });
});

describe('TL-02 · tên bậc và con trỏ dòng', () => {
  it('bỏ tiền tố "Bậc: " khi hiển thị, không đổi dữ liệu gốc', () => {
    expect(stageDisplayTitle('Bậc: Đang chăm sóc')).toBe('Đang chăm sóc');
    expect(stageDisplayTitle('Bậc: Booking')).toBe('Booking & Làm hồ sơ');
    expect(stageDisplayTitle('Ghi chú bậc')).toBe('Ghi chú bậc');
  });

  it('đọc đúng giờ ISO có dấu ":" và chỉ số cuối ID', () => {
    expect(timelineEntryTarget('call:2026-10-09T22:29:00.000Z:3')).toEqual({
      kind: 'call',
      at: '2026-10-09T22:29:00.000Z',
      index: 3,
    });
  });

  it('bỏ qua ID không phải phần tử đã lưu', () => {
    expect(timelineEntryTarget('stage-current:2026-11-04T09:00:00.000Z')).toBeNull();
    expect(timelineEntryTarget('archive:2026-11-04T09:00:00.000Z:0')).toBeNull();
  });
});
