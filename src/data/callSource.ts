/** Android call-log bridge and the web return-from-dial fallback. No call result is inferred. */
import type { CallAttempt, Customer } from '@/domain/customer';
import { normalizePhoneVN, phoneDigits } from '@/domain/customer/phone';
import type { CustomerRepository } from './repositories/customers';
import type { RepositoryAccount } from './repositories/session';

export type DeviceCall = {
  id?: string | number;
  number: string;
  startedAt: number;
  durationSec?: number;
  direction: 'out' | 'in' | 'missed';
};
export interface CallSource {
  dial(customer: Customer, phone?: string): Promise<void>;
  ingest(calls: readonly DeviceCall[]): Promise<number>;
  sync(): Promise<number>;
  dispose(): void;
}
type NativeResult = { calls?: DeviceCall[] };
type BridgeWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    nativePromise?: (plugin: string, method: string, options: Record<string, unknown>) => Promise<NativeResult>;
    Plugins?: {
      CallLog?: {
        dial?: (options: { number: string }) => Promise<unknown>;
        fetchSince?: (options: { since: number }) => Promise<NativeResult>;
      };
    };
  };
  CRMCallSource?: { fetchSince(since: number): Promise<DeviceCall[]> };
  CRMCalls?: Pick<CallSource, 'ingest' | 'sync'>;
};
const ingestionQueues = new WeakMap<CustomerRepository, Promise<unknown>>();
const LOOKBACK = 24 * 60 * 60 * 1000;
const LEAVE_WINDOW = 15_000;

export function installCallSource(
  account: RepositoryAccount,
  onPending: (customerId: string, attempt?: CallAttempt, estimateSec?: number) => void,
): CallSource {
  const host = window as BridgeWindow;
  const repo = account.customers;
  const local = account.sync.local;
  const cursorKey = `crm_call_sync_at:${local.userId}`;
  let disposed = false;
  let outgoing: { id: string; at: number; left: number | null } | null = null;
  let manualFallback = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let syncTail: Promise<number> = Promise.resolve(0);
  const active = () => !disposed && !local.isClosed;
  const owned = (c: Customer | null | undefined): c is Customer => !!c && c.owner_id === local.userId && !c.archived_at;
  const cap = () => {
    const value = host.Capacitor;
    return value?.isNativePlatform?.() ? value : undefined;
  };
  const deviceFetcher = (): ((since: number) => Promise<DeviceCall[]>) | undefined => {
    const external = host.CRMCallSource;
    if (external) return (since) => external.fetchSince(since);
    const native = cap();
    const nativePromise = native?.nativePromise?.bind(native);
    if (nativePromise) return async (since) => (await nativePromise('CallLog', 'fetchSince', { since })).calls ?? [];
    const plugin = native?.Plugins?.CallLog;
    const fetchSince = plugin?.fetchSince?.bind(plugin);
    if (fetchSince) return async (since) => (await fetchSince({ since })).calls ?? [];
  };
  async function ingestNow(calls: readonly DeviceCall[]) {
    if (!active()) return 0;
    const customers = await repo.list();
    let added = 0;
    let newest: { id: string; attempt: CallAttempt } | undefined;
    for (const call of calls) {
      if (!active()) break;
      if (!call || !['out', 'in'].includes(call.direction) || !Number.isFinite(call.startedAt)) continue;
      const at = new Date(call.startedAt);
      if (Number.isNaN(at.getTime())) continue;
      if (!phoneDigits(call.number)) continue;
      const digits = phoneDigits(normalizePhoneVN(call.number));
      if (!digits) continue;
      const match = customers.find((c) => owned(c) && phoneDigits(normalizePhoneVN(c.phone)) === digits);
      if (!match) continue;
      // Read again after every queued write: dedup both repeated batches and IDs inside one batch.
      const current = await repo.get(match.id);
      if (!active() || !owned(current)) continue;
      const deviceId = String(call.id ?? call.startedAt);
      if (current.call_attempts?.some((a) => a?.device_id === deviceId)) continue;
      const duration = Number(call.durationSec);
      const attempt: CallAttempt = {
        at: at.toISOString(),
        result: null,
        note: null,
        duration: Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0,
        origin: 'device',
        device_id: deviceId,
        direction: call.direction,
      };
      const saved = await repo.logCall(current.id, attempt);
      if (!saved) continue;
      added++;
      if (!newest || String(attempt.at) > String(newest.attempt.at)) newest = { id: current.id, attempt };
    }
    if (active() && newest) onPending(newest.id, newest.attempt);
    return added;
  }
  function ingest(calls: readonly DeviceCall[]) {
    const previous = ingestionQueues.get(repo) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => ingestNow(calls));
    ingestionQueues.set(repo, next);
    return next;
  }
  function sync() {
    const run = async () => {
      if (!active()) return 0;
      const fetch = deviceFetcher();
      if (!fetch) {
        manualFallback = true;
        return 0;
      }
      let since = Date.now() - LOOKBACK;
      try {
        const stored = Number(localStorage.getItem(cursorKey));
        if (Number.isFinite(stored) && stored > 0) since = stored;
      } catch {
        /* Storage may be blocked; device_id still prevents duplicates. */
      }
      try {
        const calls = await fetch(since);
        if (!active()) return 0;
        const added = await ingest(calls);
        if (!active()) return added;
        manualFallback = false;
        // Android inserts after hang-up, using start time. Never advance the cursor to now.
        const latest = calls.reduce(
          (max, call) => (Number.isFinite(call?.startedAt) ? Math.max(max, call.startedAt) : max),
          since,
        );
        try {
          localStorage.setItem(cursorKey, String(latest));
        } catch {
          /* Optional cursor. */
        }
        return added;
      } catch {
        manualFallback = true;
        return 0;
      }
    };
    syncTail = syncTail.catch(() => 0).then(run);
    return syncTail;
  }
  function leave() {
    if (outgoing && outgoing.left === null && Date.now() - outgoing.at < LEAVE_WINDOW) outgoing.left = Date.now();
  }
  async function back() {
    if (!active()) return;
    if (deviceFetcher()) {
      for (const timer of timers) clearTimeout(timer);
      timers = [4000, 12000].map((delay) =>
        setTimeout(() => {
          void sync();
        }, delay),
      );
      await sync();
    } else manualFallback = true;
    if (!active() || !outgoing) return;
    const call = outgoing;
    if (call.left === null) {
      if (Date.now() - call.at >= LEAVE_WINDOW) outgoing = null;
      return;
    }
    outgoing = null;
    if (!manualFallback) return;
    const seconds = Math.round((Date.now() - call.at) / 1000);
    if (seconds < 3) return;
    const customer = await repo.get(call.id);
    if (active() && owned(customer)) onPending(call.id, undefined, seconds);
  }
  const onVisibility = () => {
    if (document.hidden) leave();
    else void back();
  };
  const onBack = () => {
    void back();
  };
  window.addEventListener('blur', leave);
  window.addEventListener('focus', onBack);
  window.addEventListener('crm:resume', onBack);
  document.addEventListener('visibilitychange', onVisibility);
  const bridge = { ingest, sync };
  const previousBridge = host.CRMCalls;
  host.CRMCalls = bridge;
  return {
    ingest,
    sync,
    async dial(customer, phone = customer.phone) {
      if (!active() || !owned(await repo.get(customer.id))) return;
      if (!phoneDigits(phone)) return;
      const number = normalizePhoneVN(phone).replace(/[^\d+]/g, '');
      if (!number) return;
      outgoing = { id: customer.id, at: Date.now(), left: null };
      manualFallback = !deviceFetcher();
      const native = cap();
      try {
        if (native?.nativePromise) {
          await native.nativePromise('CallLog', 'dial', { number });
          return;
        }
        if (native?.Plugins?.CallLog?.dial) {
          await native.Plugins.CallLog.dial({ number });
          return;
        }
      } catch {
        /* Older APK or denied CALL_PHONE: use the system dialer. */
      }
      if (active()) host.location.href = `tel:${number}`;
    },
    dispose() {
      disposed = true;
      outgoing = null;
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', onBack);
      window.removeEventListener('crm:resume', onBack);
      document.removeEventListener('visibilitychange', onVisibility);
      if (host.CRMCalls === bridge) {
        if (previousBridge) host.CRMCalls = previousBridge;
        else delete host.CRMCalls;
      }
    },
  };
}
