import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it } from 'vitest';
import { useShellSync } from '@/app/layout.slots';
import { setRepositorySession, useCustomer, useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import { LocalDB } from '@/data/localdb';
import { RepositorySession } from '@/data/repositories/session';
import { CustomerSync } from '@/data/sync';

afterEach(() => setRepositorySession(null));
it('hooks publish local/remote writes, filter archives and reset cleanly on account switches', async () => {
  const storage = { getItem: () => null, setItem: () => {} } as unknown as Storage;
  const session = new RepositorySession({} as SupabaseClient, { storage });
  const local = await LocalDB.open('a', new IDBFactory());
  const sync = new CustomerSync(local, {} as SupabaseClient, () => false);
  setRepositorySession(session);
  const hook = renderHook(() => ({
    list: useCustomers(),
    single: useCustomer('c'),
    status: useSyncStatus(),
    shell: useShellSync(),
    account: useRepositoryAccount(),
  }));
  expect(hook.result.current.list).toEqual([]);
  await act(async () => {
    session.auth.callbacks.onAccount?.(sync);
    await session.getSnapshot()?.customers.refresh();
  });
  const repository = session.getSnapshot()?.customers;
  if (!repository) throw new Error('Missing account');
  await act(async () => {
    await repository.create({ id: 'c', phone: '0', full_name: 'Trường', x_unknown: 1 });
  });
  expect(hook.result.current.list).toHaveLength(1);
  expect(hook.result.current.status.pending).toBe(1);
  expect(hook.result.current.shell).toEqual({ kind: 'offline' });
  const reference = repository.getSnapshot();
  await act(async () => {
    await repository.refresh();
  });
  expect(repository.getSnapshot()).toBe(reference);
  await act(async () => {
    await repository.remove('c');
  });
  expect(hook.result.current.list).toEqual([]);
  expect(hook.result.current.single?.archived_at).toBeTruthy();
  await act(async () => {
    await local.put({ id: 'remote', owner_id: 'a', phone: '1', full_name: 'Hưởng' });
    session.auth.callbacks.onChange?.();
    await repository.refresh();
  });
  expect(hook.result.current.list.map((c) => c.id)).toEqual(['remote']);
  const other = await LocalDB.open('b', new IDBFactory());
  await act(async () => {
    local.close();
    session.auth.callbacks.onAccount?.(null);
    session.auth.callbacks.onAccount?.(new CustomerSync(other, {} as SupabaseClient, () => true));
    await session.getSnapshot()?.customers.refresh();
  });
  expect(hook.result.current.list).toEqual([]);
  expect(hook.result.current.single).toBeNull();
  expect(hook.result.current.status.pending).toBe(0);
  await expect(repository.addNote('c', 'old account')).rejects.toThrow('Phiên dữ liệu');
  await act(async () => {
    session.getSnapshot()?.sync.status.set({ error: { message: 'x', code: null, at: 'now' } });
  });
  expect(hook.result.current.shell).toEqual({ kind: 'error' });
  await act(async () => {
    session.auth.callbacks.onAccount?.(null);
  });
  expect(hook.result.current.account).toBeNull();
  expect(hook.result.current.shell).toBeNull();
  hook.unmount();
  other.close();
  session.dispose();
});
it('useCustomers accepts a filter and sync indicator maps pending and synced status', async () => {
  const storage = { getItem: () => null, setItem: () => {} } as unknown as Storage;
  const session = new RepositorySession({} as SupabaseClient, { storage });
  const local = await LocalDB.open('a', new IDBFactory());
  const sync = new CustomerSync(local, {} as SupabaseClient, () => true);
  setRepositorySession(session);
  const hook = renderHook(() => {
    useSyncStatus();
    return { customers: useCustomers((c) => c.full_name === 'Ngữ'), shell: useShellSync() };
  });
  await act(async () => {
    await local.put({ id: '1', owner_id: 'a', full_name: 'Ngữ', phone: '0' });
    await local.put({ id: '2', owner_id: 'a', full_name: 'Tự', phone: '1' });
    session.auth.callbacks.onAccount?.(sync);
    await session.getSnapshot()?.customers.refresh();
    sync.status.set({ pending: 2 });
  });
  expect(hook.result.current.customers.map((c) => c.id)).toEqual(['1']);
  expect(hook.result.current.shell).toEqual({ kind: 'pending', count: 2 });
  await act(async () => {
    sync.status.set({ pending: 0, lastSyncedAt: '2026-12-01T03:00:00.000Z' });
  });
  expect(hook.result.current.shell).toMatchObject({ kind: 'synced' });
  hook.unmount();
  local.close();
  session.dispose();
});
