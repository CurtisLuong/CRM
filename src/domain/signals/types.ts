import type { SignalGroup } from '@/config/signals';
import type { Customer } from '@/domain/customer';
export type RuleId = `S${number}`;
export type SignalAction = 'call' | 'zalo' | 'complete' | 'schedule' | 'classify' | 'open_profile' | 'record_call';
export type SignalEvidence = { field: string; value: unknown };
/** Stored beneath user_settings.ui_state.signals. Caller persists user choices, engine only reads. */
export type SignalUiState = {
  signals?: Record<string, { fingerprint: string; hidden?: boolean; snoozedUntil?: number }>;
};
export type SignalContext = { now: number; ownerId?: string; ui_state?: SignalUiState };
export type Signal = {
  id: string;
  rule: RuleId;
  customerId: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  reason: string;
  evidence: SignalEvidence[];
  due?: number;
  actions: SignalAction[];
  dedupeKey: string;
  fingerprint: string;
  group?: SignalGroup;
  sort: number[];
  secondaryReasons?: Signal[];
  notification?: { ruleKey: string; level: 'urgent' | 'warn'; sortAt: number };
};
export type SignalRule = {
  id: RuleId;
  /** Missing prerequisites => no candidate; resolving/removing evidence stops the signal. */
  evaluate(customer: Customer, context: SignalContext): Signal[];
};
