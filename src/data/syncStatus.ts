export type DataError = { message: string; code: string | null; at: string };
export type SyncSnapshot = {
  syncing: boolean;
  pending: number;
  lastSyncedAt: string | null;
  error: DataError | null;
  assignError: string | null;
  liveStatus: string;
};

/** One store per account session; compatible with useSyncExternalStore. */
export function createSyncStatus() {
  let state: SyncSnapshot = {
    syncing: false,
    pending: 0,
    lastSyncedAt: null,
    error: null,
    assignError: null,
    liveStatus: 'off',
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(patch: Partial<SyncSnapshot>) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
  };
}
export type SyncStatusStore = ReturnType<typeof createSyncStatus>;
export function dataError(raw: unknown): DataError {
  const e = raw as { message?: string; code?: string } | null;
  return { message: e?.message || String(raw), code: e?.code || null, at: new Date().toISOString() };
}
