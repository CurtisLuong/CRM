import type { Signal } from '@/domain/signals';
import { type Level, signalFor } from '@/lib/crm';

/** Mức độ chỉ được tính từ hạn tín hiệu theo luật D-010. */
export function notificationLevel(signal: Signal, now: number): Level {
  return signal.due != null && Number.isFinite(signal.due) ? signalFor(signal.due, now) : 'ok';
}

/** Mức gấp nhất dùng cho màu số chuông. */
export function mostUrgentLevel(signals: readonly Signal[], now: number): Level {
  const rank: Record<Level, number> = { alert: 0, soon: 1, ok: 2 };
  return signals.reduce<Level>((urgent, signal) => {
    const level = notificationLevel(signal, now);
    return rank[level] < rank[urgent] ? level : urgent;
  }, 'ok');
}
