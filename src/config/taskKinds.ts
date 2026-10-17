/**
 * NGUỒN DUY NHẤT — D-006 (icon), D-010 (việc). Loại việc: nhãn + khái niệm icon (src/config/icons.ts).
 * Port nguyên giá trị từ legacy/js/app.js (TASK_KINDS, TASK_KIND_PICK). "Hẹn gọi" là lịch gọi next_call_at,
 * không phải việc. Thêm loại = thêm 1 dòng.
 */

import type { IconName } from './icons';

export const TASK_KINDS = {
  call: { label: 'Hẹn gọi', icon: 'call_sched' },
  message: { label: 'Nhắn tin', icon: 'message' },
  cafe: { label: 'Hẹn cafe', icon: 'cafe' },
  docs: { label: 'Hồ sơ', icon: 'docs' },
  visit: { label: 'Tham quan', icon: 'visit' },
  contract: { label: 'Kí HĐ', icon: 'contract' },
  other: { label: 'Việc', icon: 'task' },
} as const satisfies Record<string, { label: string; icon: IconName }>;

export type TaskKind = keyof typeof TASK_KINDS;

// Nút chọn trong hộp Thêm việc.
export const TASK_KIND_PICK = [
  'message',
  'cafe',
  'docs',
  'visit',
  'contract',
  'other',
] as const satisfies readonly TaskKind[];
