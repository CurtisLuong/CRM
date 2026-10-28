import type { CustomerSync } from './sync';

/** Debounced row notifications; old sessions and disposed channels cannot mutate cache. */
export function startLive(sync: CustomerSync, callbacks: { onChange?: () => void; onResync?: () => void } = {}) {
  if (sync.demoMode) return () => {};
  let stopped = false;
  let joinedOnce = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, boolean>();
  const current = () => !stopped && !sync.local.isClosed;
  const drain = async () => {
    timer = undefined;
    const batch = [...pending];
    pending.clear();
    let changed = false;
    for (const [id, deleted] of batch) {
      if (!current()) return;
      try {
        if (await sync.applyRemote(id, deleted)) changed = true;
      } catch (error) {
        if (current()) {
          sync.status.set({ error: { message: String(error), code: null, at: new Date().toISOString() } });
          callbacks.onResync?.();
        }
        return;
      }
    }
    if (changed && current()) callbacks.onChange?.();
  };
  const channel = sync.client
    .channel(`crm-customers-${sync.local.userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
      if (!current()) return;
      const deleted = payload.eventType === 'DELETE';
      const id = (deleted ? payload.old : payload.new).id;
      if (typeof id !== 'string' || !id) return;
      pending.set(id, deleted);
      clearTimeout(timer);
      timer = setTimeout(() => {
        void drain();
      }, 300);
    })
    .subscribe((status) => {
      if (!current()) return;
      sync.status.set({ liveStatus: status });
      if (status === 'SUBSCRIBED') {
        if (joinedOnce) callbacks.onResync?.();
        joinedOnce = true;
      }
    });
  return () => {
    stopped = true;
    clearTimeout(timer);
    pending.clear();
    sync.status.set({ liveStatus: 'off' });
    void sync.client.removeChannel(channel).catch(() => {});
  };
}
