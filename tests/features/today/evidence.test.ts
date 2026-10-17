import { describe, expect, it } from 'vitest';
import { formatSignalEvidence } from '@/features/today/route';

const date = '2026-10-07T03:54:48.994+00:00';
const timestamp = Date.parse(date);
const displayedDate = new Date(timestamp).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

describe('T5.3a readable Next Best Action evidence', () => {
  it('labels booking steps from config and formats ISO and millisecond dates', () => {
    expect(
      formatSignalEvidence([
        { field: 'booking_steps', value: { cu_tru: { done: false } } },
        { field: 'care_stage_updated_at', value: date },
        { field: 'step', value: 'cu_tru' },
        { field: 'due', value: timestamp },
      ]),
    ).toEqual([`Cập nhật bậc: ${displayedDate}`, 'Bước hồ sơ: Xác nhận cư trú', `Hạn: ${displayedDate}`]);
  });

  it('omits malformed, missing and structured values rather than exposing technical content', () => {
    expect(
      formatSignalEvidence([
        { field: 'task', value: { text: 'Hẹn khách' } },
        { field: 'calls', value: [] },
        { field: 'care_stage', value: { key: 'booking' } },
        { field: 'reason', value: '[object Object]' },
        { field: 'reason', value: '  ' },
        { field: 'due', value: 'not-a-date' },
        { field: 'due', value: Infinity },
        { field: 'due', value: 9e20 },
        { field: 'due', value: null },
        { field: 'reason', value: date },
        { field: 'step', value: 'unknown_step' },
        { field: 'unrecognized_field', value: 'raw' },
      ]),
    ).toEqual([]);
  });

  it('uses configured labels for retarget reasons while retaining readable free text', () => {
    expect(
      formatSignalEvidence([
        { field: 'reason', value: 'tai_chinh' },
        { field: 'reason', value: 'thoi_diem' },
        { field: 'reason', value: 'khong_du_dieu_kien' },
        { field: 'reason', value: 'Khách muốn xem căn tầng thấp' },
      ]),
    ).toEqual([
      'Lý do: Chưa phù hợp tài chính',
      'Lý do: Chưa đúng thời điểm',
      'Lý do: Không đủ điều kiện',
      'Lý do: Khách muốn xem căn tầng thấp',
    ]);
  });

  it('keeps readable proof with Vietnamese labels and formatting', () => {
    expect(
      formatSignalEvidence([
        { field: 'phase', value: 'booking' },
        { field: 'interest_level', value: 80 },
        { field: 'care_stage', value: 'Đang chăm sóc' },
        { field: 'next_call_reason', value: 'Xác nhận lịch xem nhà' },
        { field: 'lastTouch', value: timestamp },
      ]),
    ).toEqual([
      'Giai đoạn: Booking & Làm hồ sơ',
      'Mức quan tâm: 80%',
      'Bậc chăm sóc: Đang chăm sóc',
      'Lý do hẹn gọi: Xác nhận lịch xem nhà',
      `Liên hệ cuối: ${displayedDate}`,
    ]);
  });
});
