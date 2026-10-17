import type { CustomerSync } from './sync';
import { dataError } from './syncStatus';

export async function probe(sync: CustomerSync): Promise<boolean> {
  if (!sync.isOnline() || sync.local.isClosed) return false;
  const { data, error, count } = await sync.client
    .from('customers')
    .select('updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  if (sync.local.isClosed) return false;
  const local = await sync.local.getAll();
  const latest = Math.max(0, ...local.map((r) => Date.parse(r.updated_at || '') || 0));
  return count !== local.length || (Date.parse(data?.[0]?.updated_at || '') || 0) !== latest;
}

/** Flush every 15s; probe 15s on a dropped socket, 60s on a healthy one and on foreground/online. */
export function startProbe(sync: CustomerSync, onChange: () => void = () => {}) {
  let stopped = false;
  let tick = 0;
  let flight: Promise<void> | null = null;
  const current = () => !stopped && !sync.local.isClosed;
  const run = (check = true) => {
    if (!current() || !sync.isOnline()) return Promise.resolve();
    if (flight) return flight;
    flight = (async () => {
      try {
        await sync.flushQueue();
        if (!current()) return;
        if (sync.lastPullError || (check && (await probe(sync)))) {
          const result = await sync.pull();
          if (current() && result.ok && result.changed) onChange();
        }
      } catch (error) {
        if (current()) sync.status.set({ error: dataError(error) });
      }
    })().finally(() => {
      flight = null;
    });
    return flight;
  };
  const onWake = () => {
    if (!document.hidden) void run();
  };
  const timer = setInterval(() => {
    tick++;
    void run(!document.hidden && (sync.status.getSnapshot().liveStatus !== 'SUBSCRIBED' || tick % 4 === 0));
  }, 15000);
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', onWake);
  return {
    checkRemote: () => run(),
    stop() {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
    },
  };
}
