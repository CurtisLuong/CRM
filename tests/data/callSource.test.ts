import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CallSource, type DeviceCall, installCallSource } from '@/data/callSource';
import { LocalDB } from '@/data/localdb';
import { CustomerRepository } from '@/data/repositories/customers';
import type { RepositoryAccount } from '@/data/repositories/session';
import { CustomerSync } from '@/data/sync';
import type { Customer } from '@/domain/customer';

type TestHost = Window & {
  Capacitor?: unknown;
  CRMCallSource?: unknown;
  CRMCalls?: unknown;
};
const host = window as TestHost;
const NOW = Date.parse('2026-10-16T03:00:00Z');
const row: Customer = { id: 'c', owner_id: 'u', phone: '0901234567', full_name: 'Trường' };
const call: DeviceCall = {
  id: 'd',
  number: '+84901234567',
  startedAt: NOW - 10_000,
  durationSec: 60,
  direction: 'out',
};
let local: LocalDB;
let repo: CustomerRepository;
let source: CallSource;
let account: RepositoryAccount;
const pending = vi.fn();
async function settle() {
  // IndexedDB uses real tasks, while only lifecycle timeout/Date are faked.
  for (let n = 0; n < 12; n++) await new Promise((resolve) => setImmediate(resolve));
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  pending.mockClear();
  local = await LocalDB.open('u', new IDBFactory());
  const sync = new CustomerSync(local, {} as SupabaseClient, () => false);
  repo = new CustomerRepository(sync);
  account = { customers: repo, sync } as RepositoryAccount;
  await local.put({ ...row, future: { keep: true }, call_attempts: [{ at: '2026-01-01', result: 'busy', x: 42 }] });
});
afterEach(() => {
  source?.dispose();
  local.close();
  delete host.Capacitor;
  delete host.CRMCallSource;
  delete host.CRMCalls;
  vi.useRealTimers();
});
describe('device call bridge', () => {
  it('serializes batches, deduplicates device IDs and preserves unknown JSONB', async () => {
    source = installCallSource(account, pending);
    expect(host.CRMCalls).toBeDefined();
    const [a, b] = await Promise.all([source.ingest([call, call]), source.ingest([call, { ...call, id: 'd2' }])]);
    expect([a, b]).toEqual([1, 1]);
    const saved = await repo.get('c');
    expect(saved?.call_attempts).toHaveLength(3);
    expect(saved?.call_attempts?.[0]?.x).toBe(42);
    expect(saved?.future).toEqual({ keep: true });
    expect(saved?.call_attempts?.[1]).toMatchObject({ result: null, duration: 60, direction: 'out' });
    expect(saved?.qualified_at).toBeUndefined();
    expect(pending).toHaveBeenCalledWith('c', expect.objectContaining({ result: null }));
  });
  it('ignores personal, missed, invalid, archived and unowned calls', async () => {
    await local.put({ ...row, id: 'other', phone: '0901234568', owner_id: 'other' });
    await local.put({ ...row, id: 'archived', phone: '0901234569', archived_at: '2026-01-01' });
    source = installCallSource(account, pending);
    expect(
      await source.ingest([
        { ...call, direction: 'missed' },
        { ...call, number: '0901234568' },
        { ...call, number: '0901234569' },
        { ...call, number: '0911111111' },
        { ...call, startedAt: Number.NaN },
        { ...call, number: '' },
      ]),
    ).toBe(0);
    expect(pending).not.toHaveBeenCalled();
  });
  it('uses account-scoped start-time cursor and retains inclusive boundary for late logs', async () => {
    const fetchSince = vi.fn().mockResolvedValue({ calls: [call] });
    host.Capacitor = { isNativePlatform: () => true, Plugins: { CallLog: { fetchSince } } };
    localStorage.setItem('crm_call_sync_at:other', String(NOW));
    source = installCallSource(account, pending);
    expect(await source.sync()).toBe(1);
    expect(fetchSince).toHaveBeenNthCalledWith(1, { since: NOW - 86_400_000 });
    expect(localStorage.getItem('crm_call_sync_at:u')).toBe(String(call.startedAt));
    expect(await source.sync()).toBe(0);
    expect(fetchSince).toHaveBeenNthCalledWith(2, { since: call.startedAt });
  });
  it('syncs resume immediately and retries after 4 and 12 seconds', async () => {
    const nativePromise = vi.fn().mockResolvedValue({ calls: [] });
    host.Capacitor = { isNativePlatform: () => true, nativePromise };
    source = installCallSource(account, pending);
    window.dispatchEvent(new Event('crm:resume'));
    await settle();
    expect(nativePromise).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(nativePromise).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(8000);
    expect(nativePromise).toHaveBeenCalledTimes(3);
    source.dispose();
    window.dispatchEvent(new Event('crm:resume'));
    expect(nativePromise).toHaveBeenCalledTimes(3);
  });
  it('refuses writes and callbacks when disposed or account closes during fetch', async () => {
    let resolve: (calls: DeviceCall[]) => void = () => {};
    host.CRMCallSource = {
      fetchSince: () =>
        new Promise<DeviceCall[]>((done) => {
          resolve = done;
        }),
    };
    source = installCallSource(account, pending);
    const run = source.sync();
    await settle();
    local.close();
    resolve([call]);
    expect(await run).toBe(0);
    expect(pending).not.toHaveBeenCalled();
    source.dispose();
    expect(await source.ingest([call])).toBe(0);
    expect(host.CRMCalls).toBeUndefined();
  });
});
describe('dial lifecycle', () => {
  function native(permissionFailure = false) {
    const dial = vi.fn().mockResolvedValue({});
    const fetchSince = permissionFailure ? vi.fn().mockRejectedValue(new Error('Permission denied')) : undefined;
    host.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { CallLog: { dial, ...(fetchSince ? { fetchSince } : {}) } },
    };
    return dial;
  }
  it('opens manual sheet only after actual leave and >=3 seconds, preserving estimate as estimate', async () => {
    const dial = native(); // Plugin can dial but cannot read logs, like an older APK.
    source = installCallSource(account, pending);
    await source.dial(row);
    expect(dial).toHaveBeenCalledWith({ number: '0901234567' });
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(pending).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('blur'));
    vi.setSystemTime(NOW + 20_000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(pending).toHaveBeenCalledExactlyOnceWith('c', undefined, 20);
    expect((await repo.get('c'))?.call_attempts).toHaveLength(1);
  });
  it('does not open for short return or leave after the 15-second acceptance window', async () => {
    native();
    source = installCallSource(account, pending);
    await source.dial(row);
    window.dispatchEvent(new Event('blur'));
    vi.setSystemTime(NOW + 2000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(pending).not.toHaveBeenCalled();
    await source.dial(row);
    vi.setSystemTime(NOW + 18_000);
    window.dispatchEvent(new Event('blur'));
    vi.setSystemTime(NOW + 30_000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(pending).not.toHaveBeenCalled();
  });
  it('falls back to manual lifecycle after READ_CALL_LOG permission failure', async () => {
    native(true);
    source = installCallSource(account, pending);
    await source.dial(row);
    window.dispatchEvent(new Event('blur'));
    vi.setSystemTime(NOW + 10_000);
    window.dispatchEvent(new Event('crm:resume'));
    await settle();
    expect(pending).toHaveBeenCalledExactlyOnceWith('c', undefined, 10);
  });
  it('uses nativePromise dial and imports a delayed device log without manual inference', async () => {
    let calls: DeviceCall[] = [];
    const nativePromise = vi.fn(async (_plugin: string, method: string) => (method === 'fetchSince' ? { calls } : {}));
    host.Capacitor = { isNativePlatform: () => true, nativePromise };
    source = installCallSource(account, pending);
    await source.dial(row);
    expect(nativePromise).toHaveBeenCalledWith('CallLog', 'dial', { number: '0901234567' });
    window.dispatchEvent(new Event('blur'));
    vi.setSystemTime(NOW + 15_000);
    window.dispatchEvent(new Event('crm:resume'));
    await settle();
    expect(pending).not.toHaveBeenCalled();
    calls = [call];
    await vi.advanceTimersByTimeAsync(4000);
    await settle();
    expect(pending).toHaveBeenCalledExactlyOnceWith('c', expect.objectContaining({ result: null, duration: 60 }));
    await vi.advanceTimersByTimeAsync(8000);
    await settle();
    expect(pending).toHaveBeenCalledTimes(1);
  });
  it('handles mobile visibility return and cancels callbacks after disposal', async () => {
    native();
    source = installCallSource(account, pending);
    await source.dial(row);
    const hidden = vi.spyOn(document, 'hidden', 'get');
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.setSystemTime(NOW + 5000);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(pending).toHaveBeenCalledExactlyOnceWith('c', undefined, 5);
    await source.dial(row);
    window.dispatchEvent(new Event('blur'));
    source.dispose();
    vi.setSystemTime(NOW + 10_000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(pending).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });
  it('refuses dial for a customer reassigned after rendering', async () => {
    const dial = native();
    source = installCallSource(account, pending);
    await local.put({ ...row, owner_id: 'other' });
    await source.dial(row);
    expect(dial).not.toHaveBeenCalled();
  });
});
