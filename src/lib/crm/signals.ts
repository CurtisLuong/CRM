/**
 * Ba tín hiệu khẩn (DESIGN.md §1): màu trong app chỉ nói thời gian và độ gấp.
 * Mốc quá hạn theo D-010 (src/domain/deadlines): việc có giờ quá hạn sau mốc +30 phút, việc cả ngày từ hôm sau.
 */
import { taskDueInfo } from '@/domain/deadlines';

export type Level = 'ok' | 'soon' | 'alert';

export const LEVEL_WORD: Record<Level, string> = {
  ok: 'Đúng hẹn',
  soon: 'Sắp tới',
  alert: 'Quá hạn',
};

/** Tín hiệu của một hạn: quá hạn (D-010) → alert · đến hạn / trong ngày / trong `soonHours` → soon · còn lại → ok. */
export function signalFor(
  due: Date | string | number,
  now: Date | string | number = new Date(),
  opts: { allDay?: boolean; soonHours?: number } = {},
): Level {
  const d = new Date(due);
  const n = new Date(now).getTime();
  const info = taskDueInfo({ due: d.toISOString(), due_allday: !!opts.allDay }, n);
  if (!info) return 'ok';
  if (info.state === 'overdue') return 'alert';
  if (info.state === 'due' || info.state === 'today') return 'soon';
  return d.getTime() - n <= (opts.soonHours ?? 24) * 3600e3 ? 'soon' : 'ok';
}

/** Thứ tự xếp: đỏ → vàng → xanh. */
export const LEVEL_ORDER: Record<Level, number> = { alert: 0, soon: 1, ok: 2 };

/** Class Tailwind theo mức — component không tự chọn màu tín hiệu. */
export const LEVEL_CLASS: Record<Level, { text: string; fill: string; tint: string; on: string; border: string }> = {
  ok: { text: 'text-ok-text', fill: 'fill-ok bg-ok', tint: 'bg-ok-tint', on: 'text-on-ok', border: 'border-ok' },
  soon: {
    text: 'text-soon-text',
    fill: 'fill-soon bg-soon',
    tint: 'bg-soon-tint',
    on: 'text-on-soon',
    border: 'border-soon',
  },
  alert: {
    text: 'text-alert-text',
    fill: 'fill-alert bg-alert',
    tint: 'bg-alert-tint',
    on: 'text-on-alert',
    border: 'border-alert',
  },
};
