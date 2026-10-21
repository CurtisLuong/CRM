import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
      snapshot.error || snapshot.rejected.length
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

/** Một dòng public.integration_health (SQL/v2/007_meta_lead_ads.sql). Worker ghi; app chỉ đọc. */
export type IntegrationHealth = {
  id: string;
  owner_id: string | null;
  status: 'ok' | 'warning' | 'error';
  message: string | null;
  token_expires_at: string | null;
  last_lead_at: string | null;
  last_webhook_at: string | null;
  pending_count: number;
  stuck_count: number;
  details: Record<string, unknown>;
  checked_at: string;
};
/**
 * Tình trạng một tích hợp (vd. 'meta_lead_ads'), đọc thẳng server, không lưu IndexedDB.
 * 'none' = đọc được nhưng không có dòng (chưa thiết lập / không có quyền xem) — KHÁC 'error' (đọc lỗi ≠ trống).
 */
export type IntegrationHealthState =
  | { state: 'loading' | 'offline' | 'none' | 'error'; row: null }
  | { state: 'ready'; row: IntegrationHealth };
export function useIntegrationHealth(id: string): IntegrationHealthState {
  const account = useRepositoryAccount();
  const [result, setResult] = useState<IntegrationHealthState>({ state: 'loading', row: null });
  useEffect(() => {
    let alive = true;
    const sync = account?.sync;
    if (!sync) {
      setResult({ state: 'loading', row: null });
      return;
    }
    if (!sync.isOnline()) {
      setResult({ state: 'offline', row: null });
      return;
    }
    setResult({ state: 'loading', row: null });
    Promise.resolve(sync.client.from('integration_health').select('*').eq('id', id).maybeSingle())
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setResult({ state: 'error', row: null });
        else setResult(data ? { state: 'ready', row: data as IntegrationHealth } : { state: 'none', row: null });
      })
      .catch(() => alive && setResult({ state: 'error', row: null }));
    return () => {
      alive = false;
    };
  }, [account, id]);
  return result;
}
