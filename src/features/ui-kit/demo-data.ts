import type { NotificationSection } from '@/components/crm/notifications';
import type { TimelineStageGroup } from '@/components/crm/timeline';
import type { Level, Stage } from '@/lib/crm';

/** Fixed "now" so every demo reads the same. */
export const NOW = '2026-10-27T13:15:00+07:00';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  stage: Stage;
  hrs: number | null;
  action: 'call' | 'visit' | 'docs' | 'booking' | 'message' | 'note' | 'call_sched';
  next: string;
  level: Level;
  due: string;
  src: string;
  upd: string;
}

export const CUSTOMERS: Customer[] = [
  {
    id: 1,
    name: 'Hồng D',
    phone: '0342 851 805',
    stage: 'Đang chăm sóc',
    hrs: 830,
    action: 'call',
    next: 'Gọi lại',
    level: 'alert',
    due: 'Trễ 4n',
    src: 'FB Ads',
    upd: '2 giờ',
  },
  {
    id: 2,
    name: 'Bân Ca',
    phone: '0912 345 678',
    stage: 'Đang tiếp cận',
    hrs: 96,
    action: 'call',
    next: 'Gọi lại',
    level: 'alert',
    due: 'Trễ 4n',
    src: 'FB Ads',
    upd: '3 giờ',
  },
  {
    id: 3,
    name: 'Nguyễn Văn An',
    phone: '0987 654 321',
    stage: 'Đang chăm sóc',
    hrs: 51,
    action: 'visit',
    next: 'Gọi lại báo giá',
    level: 'soon',
    due: 'Còn 45m',
    src: 'Giới thiệu',
    upd: '5 giờ',
  },
  {
    id: 4,
    name: 'Lê Thu Hà',
    phone: '0903 111 222',
    stage: 'Booking & Làm hồ sơ',
    hrs: 120,
    action: 'docs',
    next: 'Bổ sung hồ sơ',
    level: 'soon',
    due: 'Hôm nay',
    src: 'Zalo OA',
    upd: '1 ngày',
  },
  {
    id: 5,
    name: 'Vũ Minh',
    phone: '0961 222 333',
    stage: 'Booking & Làm hồ sơ',
    hrs: 410,
    action: 'booking',
    next: 'Nhắc cọc đợt 2',
    level: 'alert',
    due: 'Trễ 1n',
    src: 'Sự kiện',
    upd: '1 ngày',
  },
  {
    id: 6,
    name: 'Phạm Hồng Nhung',
    phone: '0975 444 555',
    stage: 'Nuôi dài hạn',
    hrs: 500,
    action: 'message',
    next: 'Nhắn Zalo',
    level: 'ok',
    due: '12/11',
    src: 'FB Ads',
    upd: '4 ngày',
  },
  {
    id: 7,
    name: 'Đỗ Thanh Tùng',
    phone: '0938 666 777',
    stage: 'Kí HĐMB',
    hrs: null,
    action: 'note',
    next: 'Ghi chú bàn giao',
    level: 'ok',
    due: '—',
    src: 'Giới thiệu',
    upd: '6 ngày',
  },
  {
    id: 8,
    name: 'Trần Bảo Ngọc',
    phone: '0356 888 999',
    stage: 'Đăng kí mới',
    hrs: 0.1,
    action: 'call',
    next: 'Gọi lần đầu',
    level: 'soon',
    due: 'Còn 1h 51m',
    src: 'FB Ads',
    upd: '6 phút',
  },
  {
    id: 9,
    name: 'Hoàng Đức',
    phone: '0868 121 314',
    stage: 'Đang tiếp cận',
    hrs: 20,
    action: 'call_sched',
    next: 'Hẹn gọi',
    level: 'ok',
    due: '29/10',
    src: 'Hotline',
    upd: '1 ngày',
  },
  {
    id: 10,
    name: 'Bùi Hương Lan',
    phone: '0342 851 806',
    stage: 'Loại',
    hrs: null,
    action: 'note',
    next: '—',
    level: 'ok',
    due: '—',
    src: 'FB Ads',
    upd: '9 ngày',
  },
];

export const JOURNEY_AN: TimelineStageGroup[] = [
  {
    stage: 'Đăng kí mới',
    start: '2026-10-21T21:03:00+07:00',
    end: '2026-10-21T21:41:00+07:00',
    items: [
      {
        action: 'note',
        title: 'Đăng ký từ FB Ads',
        at: '2026-10-21T21:03:00+07:00',
        note: 'Form "Happy Home 2PN" · quan tâm căn 2 phòng ngủ, vay ngân hàng.',
        by: 'Tự động',
      },
      {
        action: 'call',
        title: 'Gọi lần đầu',
        at: '2026-10-21T21:41:00+07:00',
        outcome: 'Nghe máy · 6 phút',
        level: 'ok',
        note: 'Vợ chồng trẻ, đang thuê nhà ở Lê Chân. Đủ điều kiện NOXH.',
      },
    ],
  },
  {
    stage: 'Đang tiếp cận',
    start: '2026-10-21T21:41:00+07:00',
    end: '2026-10-25T10:00:00+07:00',
    items: [
      { action: 'call', at: '2026-10-22T09:39:00+07:00', outcome: 'Không nghe máy', level: 'alert' },
      {
        action: 'message',
        title: 'Nhắn Zalo',
        at: '2026-10-23T20:15:00+07:00',
        note: 'Gửi bảng giá + chính sách vay 70%, ân hạn gốc 24 tháng.',
      },
      {
        action: 'call_sched',
        title: 'Hẹn xem nhà mẫu',
        at: '2026-10-23T20:20:00+07:00',
        outcome: 'CN 25/10 10:00',
        level: 'soon',
      },
    ],
  },
  {
    stage: 'Đang chăm sóc',
    start: '2026-10-25T10:00:00+07:00',
    items: [
      {
        action: 'visit',
        at: '2026-10-25T10:00:00+07:00',
        outcome: 'Đã đến',
        level: 'ok',
        note: 'Đi cùng vợ. Thích view hồ, lo về tiến độ bàn giao.',
      },
      {
        action: 'call',
        at: '2026-10-27T09:12:00+07:00',
        outcome: 'Nghe máy · 4 phút',
        level: 'ok',
        note: 'Muốn căn góc tầng thấp. Hỏi lại giá trước 14h.',
        by: 'Curtis',
      },
      {
        action: 'call_sched',
        title: 'Hẹn gọi lại',
        at: '2026-10-27T09:16:00+07:00',
        outcome: 'Hôm nay 14:00',
        level: 'soon',
      },
    ],
  },
];

const NEW = [
  'Nguyễn Bùi Nhật Minh',
  'Quang Vinh',
  'Phương Phạm Văn',
  'Bão Cát',
  'Bùi Như Hạnh',
  'Đinh Thanh Tùng',
  'Lê Hoài Nam',
].map((n, i) => ({
  customer: n,
  reason: `Trễ ${i > 4 ? 6 : 7} ngày`,
  context: 'FB Ads · Happy Home 2PN',
  time: `${i > 4 ? 6 : 7}n`,
}));

export const NOTIFS: NotificationSection[] = [
  {
    level: 'alert',
    title: 'Cần làm ngay',
    entries: [
      { type: 'new', items: NEW, count: 38, reason: 'Trễ 6–7 ngày', time: '7n', unread: true },
      {
        type: 'sla',
        customer: 'Vũ Minh',
        reason: 'Booking & hồ sơ +3n 02h',
        context: 'Quá SLA 14 ngày · thiếu xác nhận thu nhập',
        time: '3n',
        onOpen: () => {},
        onSnooze: () => {},
      },
      {
        type: 'tasks',
        customer: 'Lê Văn Sơn',
        reason: 'Trễ 1 ngày',
        context: 'Cọc đợt 2 · 150 triệu',
        time: '1n',
        onOpen: () => {},
        onSnooze: () => {},
      },
    ],
  },
  {
    level: 'soon',
    title: 'Sắp tới',
    entries: [
      {
        type: 'due',
        customer: 'Nguyễn Văn An',
        reason: 'Còn 45m',
        context: 'Hẹn gọi lại 14:00 · hỏi giá căn góc',
        time: '13:15',
        onOpen: () => {},
        onSnooze: () => {},
      },
      {
        type: 'today',
        customer: 'Lê Thu Hà',
        reason: 'Hôm nay 16:30',
        context: 'Xem nhà mẫu · Happy Home',
        time: '09:02',
        onOpen: () => {},
        onSnooze: () => {},
      },
    ],
  },
  {
    level: 'ok',
    title: 'Khác',
    entries: [
      {
        type: 'warm',
        customer: 'Phạm Hồng Nhung',
        reason: 'Đến hạn 12/11',
        context: 'Chạm lần cuối 28 ngày trước',
        time: 'Hôm qua',
        read: true,
        onOpen: () => {},
      },
      {
        type: 'system',
        level: null,
        title: 'Đã đồng bộ 248 khách',
        reason: 'Từ Facebook Lead Ads',
        time: '08:00',
        read: true,
        onPrimary: false,
      },
    ],
  },
];
