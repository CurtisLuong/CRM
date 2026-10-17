import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountAuth } from '@/data/auth';
import { queueAdd, queueGetAll } from '@/data/queue';
import type { Customer } from '@/domain/customer';

const row = (id = 'a'): Customer => ({
  id,
  owner_id: 'u',
  phone: '0900000000',
  full_name: 'Nguyễn Ánh',
  updated_at: '2026-10-16T00:00:00Z',
  unknown: { keep: true },
});

// Standalone PostgREST fake, including the guarded array update introduced by T5.9.
function remote(rows: Customer[], userId: () => string | undefined, isOnline: () => boolean) {
  const writes: unknown[][] = [];
  const visible = () => rows.filter((r) => r.owner_id === userId());
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  const client = {
    from: () => ({
      upsert: (payload: Customer) => {
        writes.push(['upsert', payload]);
        return Promise.resolve({ error: null });
      },
      update: (payload: Partial<Customer>) => {
        const filters = new Map<string, unknown>();
        const write = () => {
          writes.push(['update', filters.get('id'), payload]);
          const matched = visible().filter((r) => [...filters].every(([key, value]) => r[key] === value));
          for (const record of matched) {
            Object.assign(record, payload);
          }
          return { data: matched.map((r) => ({ id: r.id })), error: null };
        };
        const query = {
          eq: (column: string, value: unknown) => {
            filters.set(column, value);
            return query;
          },
          is: (column: string, value: null) => {
            filters.set(column, value);
            return query;
          },
          select: async () => write(),
          // biome-ignore lint/suspicious/noThenProperty: emulate PostgREST PromiseLike query.
          then: (resolve: (r: unknown) => unknown) => Promise.resolve(write()).then(resolve),
        };
        return query;
      },
      delete: () => ({
        eq: (_column: string, id: string) => {
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
          gt: (_column: string, value: string) => {
            cursor = value;
            return query;
          },
          eq: (_column: string, value: string) => {
            id = value;
            return query;
          },
          maybeSingle: async () => ({ data: visible().find((r) => r.id === id) ?? null, error: null }),
          // biome-ignore lint/suspicious/noThenProperty: emulate PostgREST PromiseLike query.
          then: (resolve: (r: unknown) => unknown) => {
            const filtered = visible().filter((r) => r.id > cursor);
            return Promise.resolve({
              data:
                columns === 'updated_at'
                  ? [...visible()].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 1)
                  : filtered.slice(0, 2),
              count: filtered.length,
              error: null,
            }).then(resolve);
          },
        };
        return query;
      },
    }),
    channel: () => channel,
    removeChannel: vi.fn(async () => 'ok'),
    auth: {
      signOut: vi.fn(async () => {
        if (!isOnline()) throw new Error('Offline');
        return { error: null };
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

const accounts: AccountAuth[] = [];
afterEach(() => {
  for (const auth of accounts.splice(0)) auth.dispose();
  localStorage.clear();
});

async function setup() {
  let online = false;
  const onError = vi.fn();
  const r = remote(
    [row()],
    () => auth.user?.id,
    () => online,
  );
  const auth = new AccountAuth(r.client, { onError }, { idb: new IDBFactory(), isOnline: () => online });
  accounts.push(auth);
  await auth.setAccount({ id: 'u' });
  const local = auth.sync?.local;
  if (!local) throw new Error('Account A cache did not open');
  const note = { at: '2026-10-17T00:00:00Z', text: 'Ghi chú của A khi ngoại tuyến' };
  const payload = { notes_manual: [note], updated_at: note.at };
  await local.put({ ...row(), ...payload });
  await queueAdd(local, { type: 'update', recordId: 'a', payload, ts: note.at });
  const pending = await queueGetAll(local);
  expect(pending).toHaveLength(1);
  expect(r.writes).toEqual([]);
  return { auth, local, pending, payload, onError, ...r, goOnline: () => (online = true) };
}

describe('T5.2a account switching with offline edits (E5)', () => {
  it('isolates B from A and sends A’s queued note exactly once when A returns online', async () => {
    const s = await setup();
    await s.auth.signOut();
    expect(s.local.isClosed).toBe(true);
    expect(s.auth.sync).toBeNull();
    s.goOnline();
    await s.auth.setAccount({ id: 'other' });
    const otherLocal = s.auth.sync?.local;
    if (!otherLocal) throw new Error('Account B cache did not open');
    expect(otherLocal.userId).toBe('other');
    expect(await otherLocal.get('a')).toBeNull();
    expect(await otherLocal.getAll()).toEqual([]);
    expect(await queueGetAll(otherLocal)).toEqual([]);
    expect(s.writes).toEqual([]);

    await s.auth.signOut();
    expect(otherLocal.isClosed).toBe(true);
    await s.auth.setAccount({ id: 'u' });
    const restoredLocal = s.auth.sync?.local;
    if (!restoredLocal) throw new Error('Account A cache did not reopen');
    expect(restoredLocal.userId).toBe('u');
    expect(s.writes).toEqual([['update', 'a', s.payload]]);
    expect(await queueGetAll(restoredLocal)).toEqual([]);
    expect((await restoredLocal.get('a'))?.notes_manual).toEqual(s.payload.notes_manual);
    expect(s.onError).not.toHaveBeenCalled();
  });

  it('keeps A’s original queued note unsent when A signs back in while still offline', async () => {
    const s = await setup();
    await s.auth.signOut();
    expect(s.local.isClosed).toBe(true);
    await s.auth.setAccount({ id: 'u' });
    const restoredLocal = s.auth.sync?.local;
    if (!restoredLocal) throw new Error('Account A cache did not reopen');
    expect(restoredLocal).not.toBe(s.local);
    expect(restoredLocal.userId).toBe('u');
    expect(await queueGetAll(restoredLocal)).toEqual(s.pending);
    expect((await restoredLocal.get('a'))?.notes_manual).toEqual(s.payload.notes_manual);
    expect(s.writes).toEqual([]);
    expect(s.onError).not.toHaveBeenCalled();
  });
});
