import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { setShellSync } from '@/app/layout.slots';
import type { Customer } from '@/domain/customer';
import type { RepositorySession } from '../repositories/session';
import { createSyncStatus } from '../syncStatus';

let session: RepositorySession | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const fn of listeners) fn();
};
const emptyCustomers: Customer[] = [];
const emptyStatus = createSyncStatus().getSnapshot();
let detach: (() => void) | undefined;
/** Install the composition root before boot; disposing clears all account snapshots. */
export function setRepositorySession(next: RepositorySession | null) {
  detach?.();
  session = next;
  detach = next?.subscribe(emit);
  emit();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const rows = () => session?.getSnapshot()?.customers.getSnapshot() ?? emptyCustomers;
export function useCustomers(filter?: (customer: Customer) => boolean) {
  const all = useSyncExternalStore(subscribe, rows, () => emptyCustomers);
  return useMemo(() => all.filter((c) => !c.archived_at && (!filter || filter(c))), [all, filter]);
}
export function useCustomer(id: string | null | undefined) {
  const all = useSyncExternalStore(subscribe, rows, () => emptyCustomers);
  return all.find((c) => c.id === id) ?? null;
}
const status = () => session?.getSyncSnapshot() ?? emptyStatus;
export function useSyncStatus() {
  const snapshot = useSyncExternalStore(subscribe, status, () => emptyStatus);
  useEffect(() => {
    if (!session?.getSnapshot()) {
      setShellSync(null);
      return;
    }
    const online = session.getSnapshot()?.sync.isOnline();
    setShellSync(
      snapshot.error
        ? { kind: 'error' }
        : !online
          ? { kind: 'offline' }
          : snapshot.pending
            ? { kind: 'pending', count: snapshot.pending }
            : snapshot.lastSyncedAt
              ? {
                  kind: 'synced',
                  at: new Date(snapshot.lastSyncedAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }
              : null,
    );
  }, [snapshot]);
  return snapshot;
}
export function useRepositoryAccount() {
  return useSyncExternalStore(
    subscribe,
    () => session?.getSnapshot() ?? null,
    () => null,
  );
}
