import { describe, expect, it } from 'vitest';
import { ACTION_BY_ID, ACTIONS, FUNNEL_STEPS, NOTIF_TYPES, STAGE_PATH, signalFor, slaFor, stageDef } from '@/lib/crm';

// Lớp nối component mới ↔ luật app: số phải đúng src/config/velocity.ts (D-008) và mốc quá hạn D-010.
describe('stageDef / STAGE_PATH', () => {
  it('phễu 5 bậc thật của app + bậc chốt', () => {
    expect(FUNNEL_STEPS).toBe(5);
    expect(STAGE_PATH).toEqual([
      'Đăng kí mới',
      'Đang tiếp cận',
      'Đang chăm sóc',
      'Xem dự án',
      'Booking & Làm hồ sơ',
      'Kí HĐMB',
    ]);
  });

  it('SLA theo giờ từ VELOCITY_CONFIG', () => {
    expect(stageDef('Đăng kí mới').sla).toEqual({ ideal: 0.5, max: 4 });
    expect(stageDef('Đang tiếp cận').sla).toEqual({ ideal: 48, max: 168 });
    expect(stageDef('Đang chăm sóc').sla).toEqual({ ideal: 240, max: 480 });
    expect(stageDef('Xem dự án').sla).toEqual({ ideal: 168, max: 336 });
    expect(stageDef('Booking & Làm hồ sơ').sla).toEqual({ ideal: 1080, max: 1800 });
  });

  it('Nuôi dài hạn là nhánh của Đang chăm sóc, không tính SLA; Kí HĐMB / Loại là kết thúc với nhãn hiển thị', () => {
    expect(stageDef('Nuôi dài hạn')).toMatchObject({ step: 3, branch: true });
    expect(stageDef('Nuôi dài hạn').sla).toBeUndefined();
    expect(stageDef('Kí HĐMB')).toMatchObject({ end: 'won', label: 'Đã ký HĐMB' });
    expect(stageDef('Loại')).toMatchObject({ end: 'lost', label: 'Không chốt' });
  });

  it('bậc cũ đã gộp → bậc mới; bậc lạ không làm vỡ màn', () => {
    expect(stageDef('Hỗ trợ hồ sơ').id).toBe('Booking & Làm hồ sơ');
    expect(stageDef('Bậc lạ')).toMatchObject({ id: 'Bậc lạ', label: 'Bậc lạ', step: 0 });
    expect(stageDef(null).label).toBe('Chưa có bậc');
  });
});

describe('slaFor', () => {
  it('< mục tiêu → ok, < hạn mức → soon, ≥ hạn mức → alert kèm phần quá', () => {
    expect(slaFor('Đăng kí mới', 0.25)).toMatchObject({ level: 'ok', time: '15m' });
    expect(slaFor('Đăng kí mới', 3)).toMatchObject({ level: 'soon', time: 'còn 1h 00m' });
    expect(slaFor('Đăng kí mới', 6)).toMatchObject({ level: 'alert', time: '+2h 00m' });
    expect(slaFor('Đang chăm sóc', 500)).toMatchObject({ level: 'alert', time: '+20h 00m' });
  });

  it('bậc không tính SLA → không có mức', () => {
    expect(slaFor('Nuôi dài hạn', 2000)).toMatchObject({ status: 'none', level: null });
  });
});

describe('signalFor (D-010)', () => {
  const at = (h: number, m = 0, day = 15) => new Date(2026, 9, day, h, m).getTime();

  it('việc có giờ: quá hạn sau mốc +30 phút', () => {
    expect(signalFor(at(10), at(10, 29))).toBe('soon');
    expect(signalFor(at(10), at(10, 31))).toBe('alert');
  });

  it('việc cả ngày: hôm nay = soon, từ hôm sau = alert', () => {
    expect(signalFor(at(0, 0, 15), at(18), { allDay: true })).toBe('soon');
    expect(signalFor(at(0, 0, 15), at(8, 0, 16), { allDay: true })).toBe('alert');
  });

  it('còn ≤ 24 giờ → soon, xa hơn → ok', () => {
    expect(signalFor(at(8, 0, 16), at(23))).toBe('soon');
    expect(signalFor(at(10, 0, 17), at(9))).toBe('ok');
  });
});

describe('ACTIONS / NOTIF_TYPES', () => {
  it('mỗi hành động một icon riêng, icon theo src/config/icons.ts', () => {
    expect(new Set(ACTIONS.map((a) => a.icon)).size).toBe(ACTIONS.length);
    expect(ACTION_BY_ID.cafe).toMatchObject({ label: 'Cafe và Gặp', icon: 'cafe' });
  });

  it('loại thông báo = nhóm tín hiệu D-015, tiêu đề lấy từ SIGNAL_GROUPS', () => {
    expect(NOTIF_TYPES.due.title).toBe('Đến giờ / quá giờ hẹn gọi');
    expect(NOTIF_TYPES.new).toMatchObject({ title: 'Khách mới chưa gọi', action: 'call' });
  });
});
