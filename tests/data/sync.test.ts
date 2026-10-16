import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountAuth, LAST_USER_KEY, rememberedUser } from '@/data/auth';
import { LocalDB } from '@/data/localdb';
import { pagedFetch } from '@/data/pagedFetch';
import { probe, startProbe } from '@/data/probe';
import { queueAdd, queueGetAll } from '@/data/queue';
import { startLive } from '@/data/realtime';
import { CustomerSync } from '@/data/sync';
import type { Customer } from '@/domain/customer';

const row = (id = 'a'): Customer => ({
  id,
  owner_id: 'u',
  phone: '0900000000',
  full_name: 'Nguyễn Ánh',
  updated_at: '2026-10-16T00:00:00Z',
  unknown: { keep: true },
});
function remote(rows: Customer[] = []) {
  const writes: unknown[][] = [];
  let readHook: (() => Promise<void>) | undefined;
  let event: (p: { eventType: string; old: { id?: string }; new: { id?: string } }) => void = () => {};
  let status: (s: string) => void = () => {};
  let authEvent: (event: string, session: { user: { id: string } } | null) => void = () => {};
  const channel = {
    on: (_name: string, _filter: unknown, cb: typeof event) => {
      event = cb;
      return channel;
    },
    subscribe: (cb: typeof status) => {
      status = cb;
      return channel;
    },
  };
  const client = {
    from: () => ({
      upsert: (p: unknown) => {
        writes.push(['upsert', p]);
        return Promise.resolve({ error: null });
      },
      update: (p: unknown) => ({
        eq: (_: string, id: string) => {
          writes.push(['update', id, p]);
          return Promise.resolve({ error: null });
        },
      }),
      delete: () => ({
        eq: (_: string, id: string) => {
          writes.push(['delete', id]);
          return Promise.resolve({ error: null });
        },
      }),
      select: (columns: string) => {
        let cursor = '';
        let id: string | undefined;
        const query = {
          order: () => query,
          limit: () => query,
          gt: (_: string, value: string) => {
            cursor = value;
            return query;
          },
          eq: (_: string, value: string) => {
            id = value;
            return query;
          },
          maybeSingle: async () => {
            await readHook?.();
            return { data: rows.find((r) => r.id === id) ?? null, error: null };
          },
          // biome-ignore lint/suspicious/noThenProperty: emulate PostgREST PromiseLike query.
          then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
            (async () => {
              await readHook?.();
              const filtered = rows.filter((r) => r.id > cursor);
              return {
                data:
                  columns === 'updated_at'
                    ? [...rows].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 1)
                    : filtered.slice(0, 2),
                count: filtered.length,
                error: null,
              };
            })().then(resolve, reject),
        };
        return query;
      },
    }),
    channel: () => channel,
    removeChannel: vi.fn(async () => 'ok'),
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: (cb: typeof authEvent) => {
        authEvent = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: async () => ({ data: { user: { id: 'u' } }, error: null }),
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    writes,
    setReadHook: (cb: typeof readHook) => {
      readHook = cb;
    },
    emit: (id: string, type = 'UPDATE') => event({ eventType: type, old: { id }, new: { id } }),
    status: (s: string) => status(s),
    authEvent: (id: string | null) => authEvent('SIGNED_IN', id ? { user: { id } } : null),
  };
}
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});
async function setup(rows: Customer[] = []) {
  const local = await LocalDB.open('u', new IDBFactory());
  const r = remote(rows);
  return { local, ...r, sync: new CustomerSync(local, r.client, () => true) };
}

describe('T2.A3 sync', () => {
  it('offline writes stay queued; online flush preserves order and update patches', async () => {
    const s = await setup();
    let online = false;
    const sync = new CustomerSync(s.local, s.client, () => online);
    await queueAdd(s.local, { type: 'insert', recordId: 'a', payload: row(), ts: '' });
    await queueAdd(s.local, { type: 'update', recordId: 'a', payload: { full_name: 'Ánh mới' }, ts: '' });
    await queueAdd(s.local, { type: 'delete', recordId: 'a', ts: '' });
    expect((await sync.flushQueue()).pending).toBe(3);
    expect(s.writes).toEqual([]);
    online = true;
    expect((await sync.flushQueue()).synced).toBe(3);
    expect(s.writes).toEqual([
      ['upsert', row()],
      ['update', 'a', { full_name: 'Ánh mới' }],
      ['delete', 'a'],
    ]);
    expect(sync.status.getSnapshot().lastSyncedAt).toBeTruthy();
    s.local.close();
  });
  it('pull refuses pending work and changes during fetch; keeps unknown fields', async () => {
    const s = await setup([row()]);
    await s.local.put({ ...row(), full_name: 'Local' });
    await queueAdd(s.local, { type: 'update', recordId: 'a', payload: {}, ts: '' });
    expect(await s.sync.pull()).toEqual({ ok: false, skipped: true });
    s.local.close();
    const t = await setup([row()]);
    t.setReadHook(async () => {
      t.setReadHook(undefined);
      await t.local.put({ ...row(), full_name: 'Concurrent' });
    });
    expect(await t.sync.pull()).toEqual({ ok: false, skipped: true });
    expect((await t.local.get('a'))?.full_name).toBe('Concurrent');
    expect((await t.sync.pull()).ok).toBe(true);
    expect((await t.local.get('a'))?.unknown).toEqual({ keep: true });
    t.local.close();
  });
  it('account close during pull or remote fetch cannot overwrite local', async () => {
    const s = await setup([row()]);
    s.setReadHook(async () => s.local.close());
    expect(await s.sync.pull()).toEqual({ ok: false, skipped: true });
    const t = await setup([row()]);
    t.setReadHook(async () => t.local.close());
    expect(await t.sync.applyRemote('a')).toBe(false);
  });
  it('echo timestamps do not redraw; pending edits win; inaccessible rows leave cache', async () => {
    const s = await setup([{ ...row(), updated_at: '2026-10-16T00:00:00+00:00' }]);
    await s.local.put(row());
    expect(await s.sync.applyRemote('a')).toBe(false);
    await queueAdd(s.local, { type: 'update', recordId: 'a', payload: {}, ts: '' });
    expect(await s.sync.applyRemote('a', true)).toBe(false);
    s.local.close();
    const t = await setup();
    await t.local.put(row());
    expect(await t.sync.applyRemote('a')).toBe(true);
    expect(await t.local.get('a')).toBeNull();
    t.local.close();
  });
  it('archive preserves unknown fields and sends only archive patch', async () => {
    const s = await setup();
    await s.local.put(row());
    await s.sync.archiveCustomer('a');
    const [op] = await queueGetAll(s.local);
    expect(op?.type).toBe('update');
    expect(Object.keys(op?.payload ?? {}).sort()).toEqual(['archived_at', 'updated_at']);
    expect((await s.local.get('a'))?.unknown).toEqual({ keep: true });
    s.local.close();
  });
  it('archive rolls back customer cache when the queue write fails', async () => {
    const s = await setup();
    await s.local.put(row());
    const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new Error('queue failure');
    });
    await expect(s.sync.archiveCustomer('a')).rejects.toThrow('queue failure');
    add.mockRestore();
    expect((await s.local.get('a'))?.archived_at).toBeUndefined();
    expect(await queueGetAll(s.local)).toEqual([]);
    s.local.close();
  });
  it('paged fetch traverses API caps and rejects incomplete or changing counts', async () => {
    const r = remote([row('a'), row('b'), row('c')]);
    expect((await pagedFetch(r.client)).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    const changingRows = [row('a'), row('b'), row('c')];
    const changing = remote(changingRows);
    let pages = 0;
    changing.setReadHook(async () => {
      if (++pages === 2) changingRows.push(row('d'));
    });
    await expect(pagedFetch(changing.client)).rejects.toThrow('Dữ liệu thay đổi');
    const bad = {
      from: () => ({
        select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], count: 2, error: null }) }) }),
      }),
    } as unknown as SupabaseClient;
    await expect(pagedFetch(bad)).rejects.toThrow('chưa đầy đủ');
    await expect(pagedFetch(r.client, 'customers', '*', () => false)).rejects.toThrow('Phiên');
  });
  it('probe compares count and normalized latest timestamp', async () => {
    const s = await setup([row()]);
    expect(await probe(s.sync)).toBe(true);
    await s.local.put(row());
    expect(await probe(s.sync)).toBe(false);
    s.local.close();
  });
  it('realtime debounces one row and unsubscribes without late redraws', async () => {
    const s = await setup([row()]);
    const changed = vi.fn();
    const resync = vi.fn();
    const apply = vi.spyOn(s.sync, 'applyRemote');
    const stop = startLive(s.sync, { onChange: changed, onResync: resync });
    s.status('SUBSCRIBED');
    s.status('CLOSED');
    s.status('SUBSCRIBED');
    expect(resync).toHaveBeenCalledOnce();
    s.emit('a');
    s.emit('a');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledOnce();
    s.emit('a');
    stop();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(apply).toHaveBeenCalledTimes(1);
    s.local.close();
  });
  it('probe scheduling uses 15/60s and foreground/online, then disposes', async () => {
    const s = await setup();
    vi.useFakeTimers();
    const flush = vi
      .spyOn(s.sync, 'flushQueue')
      .mockResolvedValue({ synced: 0, pending: 0, error: null, assignError: null });
    vi.spyOn(s.local, 'getAll').mockResolvedValue([]);
    const fetch = vi.spyOn(s.client, 'from');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const monitor = startProbe(s.sync);
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetch).toHaveBeenCalledTimes(1);
    s.sync.status.set({ liveStatus: 'SUBSCRIBED' });
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetch).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(4);
    monitor.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(flush).toHaveBeenCalledTimes(6);
    s.local.close();
  });
  it('offline auth remembers v1 user, switches isolated stores and logs out locally', async () => {
    const r = remote();
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: 'u', email: 'u@example.test' }));
    const auth = new AccountAuth(r.client, {}, { idb: new IDBFactory(), isOnline: () => false });
    await auth.boot();
    const first = auth.sync;
    expect(auth.user?.id).toBe('u');
    await first?.local.put(row());
    await auth.setAccount({ id: 'other' });
    expect(first?.local.isClosed).toBe(true);
    expect(await auth.sync?.local.list()).toEqual([]);
    await auth.signOut();
    expect(auth.sync).toBeNull();
    expect(rememberedUser()).toBeNull();
    auth.dispose();
  });
  it('null cancels an account while IndexedDB is still opening', async () => {
    const r = remote();
    const auth = new AccountAuth(r.client, {}, { idb: new IDBFactory(), isOnline: () => false });
    const opening = auth.setAccount({ id: 'u' });
    await auth.setAccount(null);
    await opening;
    expect(auth.sync).toBeNull();
    expect(auth.user).toBeNull();
    auth.dispose();
  });
  it('latest queued authenticated account wins and old session closes', async () => {
    const r = remote();
    const auth = new AccountAuth(r.client, {}, { idb: new IDBFactory(), isOnline: () => false });
    await auth.boot();
    r.authEvent('u');
    r.authEvent('other');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(auth.user?.id).toBe('other');
    auth.dispose();
  });
  it('dispose during getSession prevents bootstrap resurrection', async () => {
    const r = remote();
    let release!: (value: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>) => void;
    vi.spyOn(r.client.auth, 'getSession').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const auth = new AccountAuth(r.client, {}, { idb: new IDBFactory(), isOnline: () => false });
    const boot = auth.boot();
    auth.dispose();
    release({ data: { session: null }, error: null });
    await boot;
    expect(auth.sync).toBeNull();
  });
  it('queued auth event and boot cannot revive a disposed or signed out scope', async () => {
    const r = remote();
    const auth = new AccountAuth(r.client, {}, { idb: new IDBFactory(), isOnline: () => false });
    await auth.boot();
    r.authEvent('u');
    await auth.signOut();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(auth.sync).toBeNull();
    r.authEvent('u');
    auth.dispose();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(auth.sync).toBeNull();
  });
});
