/**
 * Loại thông báo = nhóm tín hiệu D-015 (src/config/signals.ts). Tiêu đề lấy từ SIGNAL_GROUPS;
 * ở đây chỉ thêm icon hành động + chữ nút cho <NotificationItem>/<NotificationGroup>. Mức gấp lấy từ dữ liệu.
 */
import { SIGNAL_GROUPS, type SignalGroup } from '@/config/signals';
import type { ActionId } from './actions';

export type NotifType = SignalGroup | 'system';

type NotifDef = { title: string; action?: ActionId; cta?: string; ctaAction?: ActionId; bulk?: string };

const UI: Record<SignalGroup, Omit<NotifDef, 'title'>> = {
  due: { action: 'call', cta: 'Gọi', bulk: 'Gọi lần lượt' },
  sla: { action: 'note', cta: 'Xử lý', bulk: 'Xem danh sách' },
  tasks: { action: 'note', cta: 'Xem việc' },
  today: { action: 'call', cta: 'Gọi', bulk: 'Gọi lần lượt' },
  new: { action: 'call', cta: 'Gọi', bulk: 'Gọi lần lượt' },
  retry: { action: 'call', cta: 'Gọi lại', bulk: 'Gọi lần lượt' },
  decide: { action: 'note', cta: 'Phân loại' },
  pending: { action: 'note', cta: 'Ghi chú' },
  hot: { action: 'message', cta: 'Nhắn' },
  warm: { action: 'message', cta: 'Nhắn' },
  nonext: { action: 'call_sched', cta: 'Hẹn gọi' },
};

export const NOTIF_TYPES: Record<NotifType, NotifDef> = {
  ...(Object.fromEntries(
    Object.entries(UI).map(([k, v]) => [k, { title: SIGNAL_GROUPS[k as SignalGroup].title, ...v }]),
  ) as Record<SignalGroup, NotifDef>),
  system: { title: 'Hệ thống' },
};
