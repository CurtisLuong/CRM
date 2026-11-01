/**
 * NGUỒN DUY NHẤT — D-006. Khái niệm → icon (tên glyph lucide-react). Một khái niệm = một icon ở mọi nơi;
 * đổi 1 dòng là đổi toàn app. Feature KHÔNG import lucide trực tiếp — dùng <Icon name="call" /> (src/ui).
 * Khái niệm port từ legacy/js/icons.js (ICON_PATHS, STAGE_ICON) + khái niệm mới của v2.
 */

import type * as Lucide from 'lucide-react';

export type LucideName = keyof typeof Lucide;

export const ICONS = {
  // ── Điều hướng / khái niệm chính (v1) ──
  home: 'House', // Tổng quan
  customers: 'Users', // Khách hàng · Tiềm năng · Đang chăm sóc
  new_lead: 'UserPlus', // Khách mới · Thêm khách
  person: 'User', // Thông tin cá nhân
  apartment: 'Building2', // Căn hộ · Giỏ hàng
  loan: 'Calculator', // Tính vay
  note: 'NotebookPen', // Ghi chú · ghi chú cuộc gọi
  apps: 'Grip', // Tiện ích
  team: 'UsersRound', // Đồng nghiệp · nhóm sale
  logout: 'LogOut', // Đăng xuất
  history: 'History', // Lịch sử chăm sóc
  chart: 'ChartColumn', // Phân tích
  ai: 'Sparkles', // Trợ lý AI
  settings: 'Settings', // Cài đặt
  insight: 'Lightbulb', // Gợi ý
  calendar: 'Calendar', // Lịch hẹn
  bell: 'Bell', // Thông báo · Việc cần làm hôm nay
  assign: 'ArrowLeftRight', // Giao khách
  // ── Hành động / loại việc (v1) ──
  call: 'Phone', // Gọi · Cuộc gọi · Ghi cuộc gọi
  call_sched: 'CalendarClock', // Hẹn gọi
  call_again: 'PhoneForwarded', // Gọi lại (chưa liên lạc được)
  talked: 'PhoneCall', // Nói chuyện được
  message: 'MessageCircleMore', // Nhắn tin / Zalo (D-028)
  cafe: 'Coffee', // Hẹn cafe
  docs: 'FolderCheck', // Hồ sơ · Tài liệu (D-028)
  visit: 'MapPinHouse', // Xem dự án · Tham quan (CP-03: cùng bộ nét với Gọi/Zalo/Cafe/Hồ sơ)
  booking: 'HandCoins', // Booking (D-028)
  contract: 'Signature', // Kí HĐMB · Kí HĐ · Chốt (D-028)
  task: 'SquareCheckBig', // Việc · Việc tiếp theo
  drop: 'CircleX', // Loại / không chốt
  nurture: 'Sprout', // Nuôi dài hạn
  sla: 'Timer', // SLA · tốc độ phễu
  // ── Tình trạng / nhắc việc (v1) ──
  alarm: 'AlarmClock', // Đến giờ / quá giờ hẹn
  decide: 'Scale', // Chờ phân loại (Đạt / Loại)
  hot: 'Flame', // Khách nóng
  idle: 'Clock', // Lâu chưa liên hệ
  alert: 'TriangleAlert', // Thiếu việc tiếp theo · cảnh báo
  birthday: 'Cake', // Sinh nhật
  // ── Khái niệm mới v2 ──
  voice: 'Mic', // Ghi chú giọng nói
  voice_stop: 'Square', // Đang nghe giọng nói → bấm để dừng
  promise_me: 'HandHelping', // Lời hứa của mình với khách
  promise_customer: 'HeartHandshake', // Lời hứa của khách
  segment: 'Layers', // Phân khúc
  retarget: 'Target', // Retarget
  health: 'HeartPulse', // Sức khoẻ chăm sóc
  capacity: 'Gauge', // Công suất
  session: 'Headset', // Phiên gọi
  command: 'Command', // Bảng lệnh
  sync: 'RefreshCw', // Đồng bộ
  offline: 'CloudOff', // Ngoại tuyến
  // ── Khái niệm v4 (D-023) ──
  done: 'Check', // Đánh dấu xong (nút trên thẻ việc)
  start: 'Play', // Bắt đầu phiên gọi
  more: 'Ellipsis', // Thêm thao tác (⋯)
  filter: 'ListFilter', // Lọc
  open: 'ChevronRight', // Mở / đi tới
  expand: 'ChevronDown', // Mở rộng / chọn · xu hướng giảm
  up: 'ChevronUp', // Xu hướng tăng
  copy: 'Copy', // Sao chép
  back: 'ArrowLeft', // Quay lại
  add: 'Plus', // Thêm ảnh / thêm mục
  delete: 'Trash2', // Xoá ảnh / tài liệu
  image: 'Image', // Ảnh đại diện / ảnh bìa
  file: 'File', // Tệp đính kèm
  // ── Menu có nhóm (PF-04, 2026-10-21) ──
  archive: 'Archive', // Khách đã lưu trữ
  quick: 'Zap', // Thao tác nhanh
  import_export: 'ArrowDownUp', // Nhập / Xuất dữ liệu
  theme: 'SunMoon', // Giao diện sáng / tối
} as const satisfies Record<string, LucideName>;

export type IconName = keyof typeof ICONS;

// Khái niệm lạ → icon này (v1: icon() rơi về 'task').
export const ICON_FALLBACK: IconName = 'task';

// Bậc chăm sóc → khái niệm icon (tên cũ trong lịch sử = bậc đã gộp).
export const STAGE_ICON: Readonly<Record<string, IconName>> = {
  'Đăng kí mới': 'new_lead',
  'Đang tiếp cận': 'call',
  'Đang chăm sóc': 'customers',
  'Xem dự án': 'visit',
  'Booking & Làm hồ sơ': 'booking',
  'Nuôi dài hạn': 'nurture',
  'Kí HĐMB': 'contract',
  Loại: 'drop',
  'Hỗ trợ hồ sơ': 'booking',
  Booking: 'booking',
};

// Bậc lạ → khái niệm này (v1: stageIcon() rơi về 'customers').
export const STAGE_ICON_FALLBACK: IconName = 'customers';
