// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { expect, it, vi } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { clearQueue } from '@/data/queue';
import { CustomerRepository } from '@/data/repositories/customers';
import { CustomerSync } from '@/data/sync';

const barrier = vi.hoisted(() => ({
  kind: null as 'count' | 'all' | null,
  entered: () => {},
  wait: Promise.resolve(),
}));
vi.mock('@/data/queue', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/queue')>();
  return {
    ...real,
    queueCount: async (local: LocalDB) => {
      const value = await real.queueCount(local);
      if (barrier.kind === 'count') {
        barrier.kind = null;
        barrier.entered();
        await barrier.wait;
      }
      return value;
    },
    queueGetAll: async (local: LocalDB) => {
      const value = await real.queueGetAll(local);
      if (barrier.kind === 'all') {
        barrier.kind = null;
        barrier.entered();
        await barrier.wait;
      }
      return value;
    },
  };
});
for (const method of ['pull', 'applyRemote'] as const)
  it(`${method} rejects an empty queue snapshot captured before atomic write and queue drain`, async () => {
    const local = await LocalDB.open('a', new IDBFactory());
    const from = vi.fn(() => {
      throw new Error('stale request started');
    });
    const sync = new CustomerSync(local, { from } as unknown as SupabaseClient, () => true);
    // Avoid automatic online flush; this test explicitly simulates a completed queue drain.
    sync.flushQueue = async () => ({ synced: 0, pending: 0, error: null, assignError: null });
    const repository = new CustomerRepository(sync);
    await repository.create({ id: 'c', phone: '0', full_name: 'Trường' });
    await clearQueue(local);
    let entered!: () => void, release!: () => void;
    const paused = new Promise<void>((r) => {
      entered = r;
    });
    barrier.kind = method === 'pull' ? 'count' : 'all';
    barrier.entered = entered;
    barrier.wait = new Promise<void>((r) => {
      release = r;
    });
    const flight = method === 'pull' ? sync.pull() : sync.applyRemote('c');
    await paused;
    await repository.update('c', { full_name: 'New local' });
    await clearQueue(local);
    release();
    expect(await flight).toEqual(method === 'pull' ? { ok: false, skipped: true } : false);
    expect(from).not.toHaveBeenCalled();
    expect((await local.get('c'))?.full_name).toBe('New local');
    local.close();
  });
