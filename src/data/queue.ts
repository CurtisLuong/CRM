/**
 * Hàng đợi đồng bộ — port 1-1 legacy/js/db.js (queueAdd/queueGetAll/queueDelete/flushQueue/clearQueue).
 * Định dạng op GIỮ NGUYÊN như v1 (v1 và v2 flush được op của nhau — D-012):
 *   { opId (autoIncrement), type: 'insert' | 'update' | 'delete', recordId, payload?, ts }
 *   insert → upsert theo id · update → patch (chỉ trường đổi + updated_at) · delete.
 * Thuộc tính lạ trong op được giữ nguyên (không ghi lại op khi đọc).
 *
 * flushQueue nhận `remote` (adapter Supabase do src/data/sync.ts cung cấp) → test được không cần mạng.
 *
 * T5.9 (D-021): op `update` có cột mảng JSONB được gộp với hàng server trước khi ghi (src/data/arrayMerge.ts);
 * op bị server từ chối vĩnh viễn không chặn khách khác và người dùng bỏ được (discardOp).
 */
import { type ArrayBase, arrayColumnsOf, mergePayload } from './arrayMerge';
import { type LocalDB, STORE_META, STORE_QUEUE } from './localdb';

export type OpType = 'insert' | 'update' | 'delete';

export type QueueOp = {
  opId?: number;
  type: OpType;
  recordId: string;
  payload?: Record<string, unknown>;
  ts: string;
  /** Local-only rollback metadata for v2 customer assignment rejections. Never sent to Supabase. */
  assignmentRollback?: AssignmentRollback;
  /** Local-only: mảng local ngay trước khi sửa (bản gốc gộp 3 chiều — D-021). Không gửi lên Supabase. */
  arrayBase?: ArrayBase;
  [k: string]: unknown;
};

export type SnapshotField = { present: boolean; value?: unknown };
export type AssignmentRollback = {
  owner_id: SnapshotField;
  followers: SnapshotField;
  updated_at: SnapshotField;
  notes_manual: SnapshotField;
};

/** Lỗi từ Supabase/PostgREST (chỉ dùng code + message). */
export type RemoteError = { code?: string | null; message?: string } | null | undefined;

/** Adapter ghi lên server — mỗi hàm trả `{ error }` như supabase-js. */
export type CustomerRemote = {
  upsert(payload: Record<string, unknown>): PromiseLike<{ error: RemoteError }>;
  update(id: string, payload: Record<string, unknown>): PromiseLike<{ error: RemoteError }>;
  delete(id: string): PromiseLike<{ error: RemoteError }>;
  /** Đọc vài cột của 1 hàng (gộp mảng). Không có → op ghi đè mảng như v1. */
  read?(id: string, columns: string[]): PromiseLike<{ data: Record<string, unknown> | null; error: RemoteError }>;
  /** Patch chỉ khi `updated_at` trên server vẫn là giá trị đã đọc; `matched` = có hàng được ghi. */
  updateIf?(
    id: string,
    payload: Record<string, unknown>,
    expectedUpdatedAt: unknown,
  ): PromiseLike<{ error: RemoteError; matched: boolean }>;
};

export type SyncError = { opId?: number; type: OpType; recordId: string; message: string; code: string | null };

export type FlushResult = {
  synced: number;
  pending: number;
  /** Lỗi đẩy lên gần nhất (op bị kẹt, hàng đợi dừng để giữ thứ tự); null = không lỗi. */
  error: SyncError | null;
  /** Lỗi giao khách (op đã bỏ) — app hiện thông báo 1 lần; null = không có. */
  assignError: string | null;
  /** Op server từ chối vĩnh viễn (vẫn nằm trong hàng đợi, chờ người dùng bỏ). Chỉ có khi khác rỗng. */
  rejected?: SyncError[];
  /** Khách có cột mảng đã gộp với server → nên tải lại từ server. Chỉ có khi khác rỗng. */
  merged?: string[];
};

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Thêm 1 op (opId tự tăng). Trả opId. */
export async function queueAdd(ldb: LocalDB, op: Omit<QueueOp, 'opId'>): Promise<number> {
  return (await reqResult(ldb.store(STORE_QUEUE, 'readwrite').add(op))) as number;
}

/** Mọi op đang chờ, theo thứ tự opId (thứ tự ghi). */
export async function queueGetAll(ldb: LocalDB): Promise<QueueOp[]> {
  return (await reqResult(ldb.store(STORE_QUEUE).getAll())) as QueueOp[];
}

export async function queueCount(ldb: LocalDB): Promise<number> {
  return reqResult(ldb.store(STORE_QUEUE).count());
}

export async function queueDelete(ldb: LocalDB, opId: number): Promise<void> {
  await reqResult(ldb.store(STORE_QUEUE, 'readwrite').delete(opId));
}

function sameValue(left: unknown, right: unknown) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/** Drop a server-rejected assignment and restore only its still-current assignment fields atomically. */
async function rejectAssignment(ldb: LocalDB, op: QueueOp): Promise<boolean> {
  ldb.markChanged();
  return new Promise((resolve, reject) => {
    const tx = ldb.db.transaction(['customers', STORE_QUEUE], 'readwrite');
    const customers = tx.objectStore('customers');
    const queue = tx.objectStore(STORE_QUEUE);
    const rowRequest = customers.get(op.recordId);
    const queueRequest = queue.getAll();
    let changed = false;
    let failure: unknown;
    let rowReady = false;
    let queueReady = false;
    const apply = () => {
      if (!rowReady || !queueReady) return;
      try {
        const pending = queueRequest.result as QueueOp[];
        const current = rowRequest.result as Record<string, unknown> | undefined;
        if (op.opId != null) queue.delete(op.opId);
        const rollback = op.assignmentRollback;
        const laterAssignments = pending
          .filter(
            (candidate) =>
              candidate.opId != null &&
              op.opId != null &&
              candidate.opId > op.opId &&
              candidate.recordId === op.recordId &&
              candidate.type === 'update' &&
              !!candidate.payload &&
              Object.hasOwn(candidate.payload, 'owner_id'),
          )
          .sort((a, b) => (a.opId || 0) - (b.opId || 0));

        if (laterAssignments.length && rollback) {
          // Carry the earliest baseline forward so consecutive rejected handoffs restore the server state.
          queue.put({ ...laterAssignments[0], assignmentRollback: rollback });
        } else if (current && rollback && op.payload) {
          const ownerMatches = sameValue(current.owner_id, op.payload.owner_id);
          const followersMatch =
            !Object.hasOwn(op.payload, 'followers') || sameValue(current.followers, op.payload.followers);
          if (ownerMatches && followersMatch) {
            const restored = { ...current };
            for (const key of ['owner_id', 'followers'] as const) {
              const snapshot = rollback[key];
              if (snapshot.present) restored[key] = snapshot.value;
              else delete restored[key];
            }
            // Restore the timestamp and timeline notes only if no later local edit touched the row.
            if (current.updated_at === op.ts) {
              const timestamp = rollback.updated_at;
              if (timestamp.present) restored.updated_at = timestamp.value;
              else delete restored.updated_at;
              const notes = rollback.notes_manual;
              if (notes.present) restored.notes_manual = notes.value;
              else delete restored.notes_manual;
            }
            customers.put(restored);
            changed = true;
          }
        }
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    rowRequest.onsuccess = () => {
      rowReady = true;
      apply();
    };
    queueRequest.onsuccess = () => {
      queueReady = true;
      apply();
    };
    rowRequest.onerror = queueRequest.onerror = () => {
      failure = rowRequest.error || queueRequest.error;
      tx.abort();
    };
    tx.oncomplete = () => resolve(changed);
    tx.onabort = () => reject(failure || tx.error);
    tx.onerror = () => {
      failure ||= tx.error;
    };
  });
}

/** Escape hatch khi 1 op kẹt vĩnh viễn: bỏ mọi op chờ (dữ liệu local vẫn còn). Trả số op đã bỏ. */
export async function clearQueue(ldb: LocalDB): Promise<number> {
  const ops = await queueGetAll(ldb);
  for (const op of ops) if (op.opId != null) await queueDelete(ldb, op.opId);
  return ops.length;
}

const DUP_RE = /duplicate key|unique constraint/i;
const isDuplicate = (e: { code?: string | null; message?: string }) =>
  e.code === '23505' || DUP_RE.test(e.message || '');

/**
 * Lỗi server từ chối vĩnh viễn: thử lại cũng hỏng (dữ liệu sai ràng buộc, thiếu quyền, cột không có).
 * SQLSTATE lớp 22 (giá trị sai), 23 (ràng buộc), 42 (quyền/cú pháp/cột) + PGRST1xx/2xx (yêu cầu sai).
 * Còn lại (mạng, 5xx, hết phiên PGRST3xx, timeout 57014…) = tạm thời → dừng + thử lại như v1.
 */
export const isPermanentError = (e: RemoteError) =>
  !!e?.code && (/^(22|23|42)[0-9A-Z]{3}$/.test(e.code) || /^PGRST[12]\d\d$/.test(e.code));

const MERGE_ATTEMPTS = 3;

/** Trả true nếu đã gộp cột mảng với server. */
async function runOp(remote: CustomerRemote, op: QueueOp): Promise<boolean> {
  let res: { error: RemoteError } | undefined;
  let merged = false;
  // insert → upsert (theo id): record đã có trên server thì đè, tránh "trùng khoá" làm kẹt hàng đợi.
  if (op.type === 'insert') res = await remote.upsert(op.payload ?? {});
  else if (op.type === 'update') {
    const payload = op.payload ?? {};
    const cols = arrayColumnsOf(payload);
    if (cols.length && remote.read && remote.updateIf) {
      // Đọc → gộp → ghi có điều kiện updated_at; máy khác ghi chen giữa → đọc lại (tối đa 3 lần).
      let next = payload;
      for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
        const read = await remote.read(op.recordId, ['updated_at', ...cols]);
        if (read.error) throw read.error;
        if (!read.data) break; // không thấy hàng (đã xoá / RLS ẩn) → ghi như cũ
        next = mergePayload(payload, op.arrayBase, read.data);
        const write = await remote.updateIf(op.recordId, next, read.data.updated_at);
        if (write.error) throw write.error;
        if (write.matched) return true;
      }
      merged = next !== payload;
      res = await remote.update(op.recordId, next);
    } else res = await remote.update(op.recordId, payload);
  } else if (op.type === 'delete') res = await remote.delete(op.recordId);
  if (res?.error) throw res.error;
  return merged;
}

const DISCARDED_KEY = 'discarded-ops';
const DISCARDED_MAX = 50;

/**
 * Người dùng bỏ 1 op bị server từ chối. Op được chép vào meta `discarded-ops` (50 op gần nhất,
 * để còn khôi phục tay) rồi mới xoá khỏi hàng đợi — không âm thầm mất dữ liệu. Trả op đã bỏ.
 */
export async function discardOp(ldb: LocalDB, opId: number): Promise<QueueOp | null> {
  ldb.assertOpen();
  return new Promise((resolve, reject) => {
    const tx = ldb.db.transaction([STORE_QUEUE, STORE_META], 'readwrite');
    const queue = tx.objectStore(STORE_QUEUE);
    const meta = tx.objectStore(STORE_META);
    const opRequest = queue.get(opId);
    let found: QueueOp | null = null;
    opRequest.onsuccess = () => {
      found = (opRequest.result as QueueOp | undefined) ?? null;
      if (!found) return;
      const op = found;
      const logRequest = meta.get(DISCARDED_KEY);
      logRequest.onsuccess = () => {
        const log = (logRequest.result as { key: string; ops?: unknown[] } | undefined) ?? { key: DISCARDED_KEY };
        const ops = [...(Array.isArray(log.ops) ? log.ops : []), { ...op, discarded_at: new Date().toISOString() }];
        meta.put({ ...log, key: DISCARDED_KEY, ops: ops.slice(-DISCARDED_MAX) });
        queue.delete(opId);
      };
    };
    tx.oncomplete = () => resolve(found);
    tx.onabort = () => reject(tx.error);
  });
}

const flights = new WeakMap<LocalDB, Promise<FlushResult>>();

/**
 * Đẩy các op đang chờ lên server theo thứ tự (= v1 flushQueue). Chỉ 1 lượt flush chạy cùng lúc / phiên.
 *  - insert trùng (23505 / duplicate key) → bỏ op (khách đã có trên server; pull sau sẽ sửa lại).
 *  - update có owner_id (giao khách) lỗi 23505 / 42501 → bỏ op + assignError.
 *  - update có cột mảng → gộp với hàng server (D-021), ghi có điều kiện updated_at.
 *  - lỗi vĩnh viễn (isPermanentError) → op nằm lại + `rejected`; bỏ qua op sau của cùng khách, khách khác tiếp tục.
 *  - lỗi tạm thời (mạng/5xx) → ghi error và DỪNG (giữ thứ tự, thử lại sau).
 *  - phiên đóng giữa chừng (đổi tài khoản) → dừng, không xoá op nào của phiên cũ sau đó.
 */
export function flushQueue(ldb: LocalDB, remote: CustomerRemote): Promise<FlushResult> {
  const running = flights.get(ldb);
  if (running) return running;
  const flight = (async (): Promise<FlushResult> => {
    let synced = 0;
    let error: SyncError | null = null;
    let assignError: string | null = null;
    const rejected: SyncError[] = [];
    const merged = new Set<string>();
    // Khách có op bị từ chối: op sau của CÙNG khách phải chờ (giữ thứ tự); khách khác vẫn đẩy tiếp.
    const blocked = new Set<string>();
    const ops = await queueGetAll(ldb);
    for (const op of ops) {
      if (ldb.isClosed) break;
      if (blocked.has(op.recordId)) continue;
      try {
        if (await runOp(remote, op)) merged.add(op.recordId);
        if (ldb.isClosed) break;
        if (op.opId != null) await queueDelete(ldb, op.opId);
        synced++;
        error = null;
      } catch (raw) {
        if (ldb.isClosed) break;
        const e = (raw ?? {}) as { code?: string | null; message?: string };
        if (op.type === 'insert' && isDuplicate(e)) {
          if (op.opId != null) await queueDelete(ldb, op.opId);
          error = null;
          continue;
        }
        if (op.type === 'update' && op.payload && 'owner_id' in op.payload && (isDuplicate(e) || e.code === '42501')) {
          await rejectAssignment(ldb, op);
          assignError =
            e.code === '42501'
              ? e.message || 'Không có quyền giao khách này'
              : 'Không giao được: người nhận đã có khách trùng số điện thoại trong danh sách của họ';
          continue;
        }
        const failure: SyncError = {
          opId: op.opId,
          type: op.type,
          recordId: op.recordId,
          message: e.message || String(raw),
          code: e.code || null,
        };
        if (isPermanentError(e)) {
          rejected.push(failure);
          blocked.add(op.recordId);
          continue;
        }
        error = failure;
        break;
      }
    }
    const pending = ldb.isClosed ? 0 : await queueCount(ldb);
    return {
      synced,
      pending,
      error,
      assignError,
      ...(rejected.length ? { rejected } : {}),
      ...(merged.size ? { merged: [...merged] } : {}),
    };
  })();
  const tracked = flight.finally(() => {
    if (flights.get(ldb) === tracked) flights.delete(ldb);
  });
  flights.set(ldb, tracked);
  return tracked;
}
