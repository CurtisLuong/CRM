/**
 * NGUỒN DUY NHẤT — D-006 (icon), D-010 (việc). Loại việc: nhãn + khái niệm icon (src/config/icons.ts).
 * Mã và thứ tự lấy từ legacy/js/app.js (TASK_KINDS, TASK_KIND_PICK); CP-03 đổi nhãn/icon 5 hành động
 * theo yêu cầu Curtis, giữ nguyên mã đã lưu. "Hẹn gọi" là lịch gọi next_call_at, không phải việc.
 */

import type { IconName } from './icons';

export const TASK_KINDS = {
  call: { label: 'Gọi điện', icon: 'call' },
  message: { label: 'Zalo', icon: 'message' },
  cafe: { label: 'Cafe và Gặp', icon: 'cafe' },
  docs: { label: 'Hồ sơ', icon: 'docs' },
  visit: { label: 'Tham quan', icon: 'visit' },
  contract: { label: 'Kí HĐ', icon: 'contract' },
  other: { label: 'Việc', icon: 'task' },
} as const satisfies Record<string, { label: string; icon: IconName }>;

export type TaskKind = keyof typeof TASK_KINDS;

/**
 * Nút chọn trong hộp Thêm việc của v1 — AI dùng làm hợp đồng sinh next_tasks (đừng đổi thứ tự/mã).
 * Giao diện Thêm việc dùng TASK_ACTION_KINDS bên dưới.
 */
export const TASK_KIND_PICK = [
  'message',
  'cafe',
  'docs',
  'visit',
  'contract',
  'other',
] as const satisfies readonly TaskKind[];

/** 5 hành động Thêm việc (CP-03), đúng thứ tự Curtis duyệt; "call" mở lịch hẹn gọi chứ không tạo next_tasks. */
export const TASK_ACTION_KINDS = ['call', 'message', 'cafe', 'visit', 'docs'] as const satisfies readonly TaskKind[];

export type TaskActionKind = (typeof TASK_ACTION_KINDS)[number];

/** Lịch hẹn gọi (next_call_at) — cam kết riêng, không phải việc trong next_tasks. */
export const CALL_APPOINTMENT = TASK_KINDS.call as const satisfies {
  label: string;
  icon: IconName;
};

/** Loại việc đã lưu → nhãn + icon; mã lạ (dữ liệu cũ) rơi về "Việc", không làm mất mã gốc. */
export function taskKindOf(kind: unknown): { key: TaskKind; label: string; icon: IconName } {
  const key = typeof kind === 'string' && Object.hasOwn(TASK_KINDS, kind) ? (kind as TaskKind) : 'other';
  return { key, ...TASK_KINDS[key] };
}
