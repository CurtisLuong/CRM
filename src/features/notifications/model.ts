import type { Signal, SignalUiState } from '@/domain/signals';
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

export function snoozeSignalState(current: SignalUiState, signals: readonly Signal[], durationMs: number, now: number) {
  const entries = { ...current.signals };
  const previous = new Map<string, NonNullable<SignalUiState['signals']>[string] | undefined>();
  const affected = new Map<string, Signal>();
  for (const signal of signals) {
    affected.set(signal.id, signal);
    for (const secondary of signal.secondaryReasons ?? []) affected.set(secondary.id, secondary);
  }
  const until = now + durationMs;
  for (const [id, signal] of affected) {
    if (entries[id]?.hidden) continue;
    previous.set(id, entries[id]);
    entries[id] = { ...entries[id], fingerprint: signal.fingerprint, snoozedUntil: until };
  }
  return {
    until,
    state: { ...current, signals: entries },
    restore: (latest: SignalUiState = current): SignalUiState => {
      const restored = { ...latest.signals };
      for (const [id, entry] of previous) {
        if (entry) restored[id] = entry;
        else delete restored[id];
      }
      return { ...latest, signals: restored };
    },
  };
}
