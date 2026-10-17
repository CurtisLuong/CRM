export type QuickAction = 'call' | 'outcome' | 'zalo' | 'note' | 'schedule';

import type { CallDraft } from './model';
export type ActionRequest = { customerId: string; kind: QuickAction; draft?: CallDraft; serial: number };
let request: ActionRequest | null = null;
const listeners = new Set<() => void>();
export function openQuickAction(customerId: string, kind: QuickAction, draft?: CallDraft) {
  request = { customerId, kind, draft, serial: (request?.serial ?? 0) + 1 };
  for (const listener of listeners) listener();
}
export function clearQuickAction() {
  request = null;
  for (const listener of listeners) listener();
}
export const actionStore = {
  get: () => request,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
