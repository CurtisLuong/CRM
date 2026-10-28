/**
 * Hành động CRM cho component giao diện mới (DESIGN.md §3). Một hành động = một icon ở mọi nơi:
 * icon lấy từ src/config/icons.ts (D-006), nhãn từ src/config/taskKinds.ts. Mã = khái niệm/mã loại việc đã lưu.
 */
import type { IconName } from '@/config/icons';
import { TASK_KINDS } from '@/config/taskKinds';

export type ActionId = 'call' | 'call_sched' | 'message' | 'note' | 'cafe' | 'visit' | 'booking' | 'docs' | 'contract';

export interface ActionDef {
  id: ActionId;
  label: string;
  /** Nhãn ngắn cho nút xếp chồng trên điện thoại. */
  short: string;
  icon: IconName;
}

// Thứ tự theo hành trình khách (gọi → hẹn → nhắn → ghi → gặp → xem → booking → hồ sơ → ký).
export const ACTIONS: readonly ActionDef[] = [
  { id: 'call', label: TASK_KINDS.call.label, short: 'Gọi', icon: 'call' },
  { id: 'call_sched', label: 'Hẹn gọi', short: 'Hẹn gọi', icon: 'call_sched' },
  { id: 'message', label: TASK_KINDS.message.label, short: 'Zalo', icon: 'message' },
  { id: 'note', label: 'Ghi chú', short: 'Ghi chú', icon: 'note' },
  { id: 'cafe', label: TASK_KINDS.cafe.label, short: 'Gặp', icon: 'cafe' },
  { id: 'visit', label: TASK_KINDS.visit.label, short: 'Xem DA', icon: 'visit' },
  { id: 'booking', label: 'Booking', short: 'Booking', icon: 'booking' },
  { id: 'docs', label: TASK_KINDS.docs.label, short: 'Hồ sơ', icon: 'docs' },
  { id: 'contract', label: TASK_KINDS.contract.label, short: 'Ký HĐ', icon: 'contract' },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;
