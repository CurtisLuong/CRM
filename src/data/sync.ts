import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer } from '@/domain/customer';
import { LOCAL_CHANGED, type LocalDB, ReadOnlyError, STORE_CUSTOMERS, STORE_QUEUE, sameRecord } from './localdb';
import { pagedFetch } from './pagedFetch';
import { discardOp, flushQueue, queueCount, queueGetAll } from './queue';
import { customerRemote } from './supabase';
import { createSyncStatus, dataError } from './syncStatus';

export class CustomerSync {
  private archiveRevision = 0;
  readonly status = createSyncStatus();
  /** Gọi khi cache local được thay bằng bản server ngoài luồng realtime/pull (sau gộp mảng, sau bỏ op). */
  readonly localReplaced = new Set<() => void>();
  lastPullError: ReturnType<typeof dataError> | null = null;
  constructor(
    readonly local: LocalDB,
    readonly client: SupabaseClient,
    readonly isOnline = () => navigator.onLine,
  ) {}

  async flushQueue() {
    if (this.local.isClosed) return { synced: 0, pending: 0, error: null, assignError: null };
    if (!this.isOnline()) {
      const pending = await queueCount(this.local);
      this.status.set({ pending });
      return { synced: 0, pending, error: null, assignError: null };
    }
    this.status.set({ syncing: true });
    try {
      const result = await flushQueue(this.local, customerRemote(this.client));
      if (!this.local.isClosed)
        this.status.set({
          pending: result.pending,
          error: result.error ? dataError(result.error) : this.lastPullError,
          assignError: result.assignError || this.status.getSnapshot().assignError,
          rejected: result.rejected ?? [],
          ...(!result.pending && !result.error && !this.lastPullError
            ? { lastSyncedAt: new Date().toISOString() }
            : {}),
        });
      // Đã gộp mảng với server → cache local thiếu phần tử máy khác thêm: tải đúng khách đó (bỏ qua nếu còn op chờ).
      if (result.merged?.length) await this.reloadFromServer(result.merged);
      return result;
    } catch (error) {
      if (!this.local.isClosed) this.status.set({ error: dataError(error) });
      throw error;
    } finally {
      if (!this.local.isClosed) this.status.set({ syncing: false });
    }
  }

  async pull() {
    if (this.local.isClosed || !this.isOnline()) return { ok: false, skipped: true };
    const revision = this.local.revision;
    const archiveRevision = this.archiveRevision;
    try {
      const pending = await queueCount(this.local);
      if (
        this.local.isClosed ||
        revision !== this.local.revision ||
        archiveRevision !== this.archiveRevision ||
        pending
      )
        return { ok: false, skipped: true };
      const data = await pagedFetch<Customer>(this.client, 'customers', '*', () => !this.local.isClosed);
      if (
        this.local.isClosed ||
        revision !== this.local.revision ||
        archiveRevision !== this.archiveRevision ||
        (await queueCount(this.local))
      )
        return { ok: false, skipped: true };
      const before = await this.local.getAll();
      const byId = new Map(before.map((r) => [r.id, r]));
      const changed = before.length !== data.length || data.some((r) => !sameRecord(r, byId.get(r.id)));
      if (this.local.isClosed || revision !== this.local.revision || archiveRevision !== this.archiveRevision)
        return { ok: false, skipped: true };
      await this.local.replaceAll(data, revision);
      this.lastPullError = null;
      this.status.set({ pending: 0, error: null, lastSyncedAt: new Date().toISOString() });
      return { ok: true, changed };
    } catch (raw) {
      if (this.local.isClosed || (raw instanceof Error && raw.message === LOCAL_CHANGED))
        return { ok: false, skipped: true };
      this.lastPullError = dataError(raw);
      this.status.set({ error: this.lastPullError });
      return { ok: false, error: this.lastPullError };
    }
  }

  async applyRemote(id: string, deleted = false): Promise<boolean> {
    return (await this.applyRemoteResult(id, deleted)) === 'applied';
  }

  /** 'stale' = local vừa đổi trong lúc tải (thử lại được); 'pending' = khách còn op chờ (không được đè). */
  private async applyRemoteResult(id: string, deleted = false): Promise<'applied' | 'unchanged' | 'pending' | 'stale'> {
    if (!id || this.local.isClosed) return 'unchanged';
    const revision = this.local.revision;
    const archiveRevision = this.archiveRevision;
    const stale = () =>
      this.local.isClosed || revision !== this.local.revision || archiveRevision !== this.archiveRevision;
    const hasPending = async () => (await queueGetAll(this.local)).some((op) => op.recordId === id);
    if (this.local.isClosed) return 'unchanged';
    if (await hasPending()) return 'pending';
    if (stale()) return 'stale';
    let row: Customer | null = null;
    if (!deleted) {
      const { data, error } = await this.client.from('customers').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      row = data as Customer | null;
    }
    if (this.local.isClosed) return 'unchanged';
    if (await hasPending()) return 'pending';
    if (stale()) return 'stale';
    const local = await this.local.get(id);
    if (stale()) return 'stale';
    if (!row) {
      if (!local) return 'unchanged';
      await this.local.delete(id);
      return 'applied';
    }
    if (sameRecord(local, row)) return 'unchanged';
    await this.local.put(row);
    return 'applied';
  }

  private async reloadFromServer(ids: string[]) {
    let changed = false;
    for (const id of ids) {
      if (this.local.isClosed) return;
      try {
        // Local đổi trong lúc tải (vd. tự động SLA khi mở app) → thử lại, tối đa 3 lần.
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await this.applyRemoteResult(id);
          if (result === 'applied') changed = true;
          if (result !== 'stale') break;
        }
      } catch {
        // Không tải được: realtime/probe/pull sẽ sửa sau.
      }
    }
    if (changed && !this.local.isClosed) for (const fn of this.localReplaced) fn();
  }

  /**
   * Người dùng bỏ 1 op bị server từ chối (đã xác nhận). Op được lưu bản sao trong meta `discarded-ops`;
   * bản local của khách quay về giá trị server nếu không còn op nào khác chờ cho khách đó. Rồi đẩy tiếp hàng đợi.
   */
  async discardRejected(opId: number) {
    const op = await discardOp(this.local, opId);
    if (this.local.isClosed) return op;
    this.status.set({
      rejected: this.status.getSnapshot().rejected.filter((r) => r.opId !== opId),
      pending: await queueCount(this.local),
    });
    // Đẩy tiếp op còn lại (kể cả op sau của cùng khách), rồi đưa local của khách về giá trị server.
    await this.flushQueue();
    if (op && this.isOnline()) await this.reloadFromServer([op.recordId]);
    return op;
  }

  /** Ordinary UI deletion is an owner-checked patch; legacy queue deletes remain compatible. */
  async archiveCustomer(id: string) {
    await this.local.assertWritable(id);
    const now = new Date().toISOString();
    const patch = { archived_at: now, updated_at: now };
    // Commit queue + cache together, reading the latest record inside the same transaction.
    this.local.assertOpen();
    this.archiveRevision++;
    await new Promise<void>((resolve, reject) => {
      const tx = this.local.db.transaction([STORE_CUSTOMERS, STORE_QUEUE], 'readwrite');
      let failure: unknown;
      const customers = tx.objectStore(STORE_CUSTOMERS);
      const read = customers.get(id);
      read.onsuccess = () => {
        try {
          const record = read.result as Customer | undefined;
          if (!record) throw new Error('Không tìm thấy khách.');
          if (record.owner_id && record.owner_id !== this.local.userId) throw new ReadOnlyError();
          customers.put({ ...record, ...patch });
          tx.objectStore(STORE_QUEUE).add({ type: 'update', recordId: id, payload: patch, ts: now });
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure || tx.error);
      tx.onerror = () => reject(tx.error);
    });
    if (this.local.isClosed) return;
    this.status.set({ pending: await queueCount(this.local) });
  }
}
