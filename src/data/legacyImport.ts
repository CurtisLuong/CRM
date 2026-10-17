/**
 * Nhập 1 lần từ DB gốc `crm_khach_hang` (bản v1 rất cũ, chưa tách theo tài khoản) — port 1-1 migrateLegacy
 * trong legacy/js/db.js. DB gốc chỉ ĐỌC (vẫn còn để khôi phục). Op không xác định được chủ KHÔNG bao giờ
 * gán cho tài khoản khác. Cờ meta `legacy-imported` dùng chung với v1 → v1 và v2 không nhập 2 lần.
 */
import { DB_NAME, LocalDB, openNamedDB, STORE_CUSTOMERS, STORE_META, STORE_QUEUE } from './localdb';
import type { QueueOp } from './queue';

export const LEGACY_IMPORTED_KEY = 'legacy-imported';
/** localStorage: {id, email} người dùng đăng nhập gần nhất (v1 ghi, v2 đọc). */
export const LS_LAST_USER = 'crm_last_user';

/** id tài khoản đăng nhập gần nhất trên máy này (v1 lưu ở localStorage) — null nếu không có/hỏng. */
export function readPreviousUserId(storage: Pick<Storage, 'getItem'> | null | undefined): string | null {
  try {
    const v = JSON.parse(storage?.getItem(LS_LAST_USER) || 'null') as { id?: unknown } | null;
    return typeof v?.id === 'string' ? v.id : null;
  } catch {
    return null;
  }
}

function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Nhập khách + op của userId từ DB gốc vào target (nếu chưa nhập). */
export async function migrateLegacy(
  target: LocalDB,
  previousUserId: string | null,
  idb: IDBFactory = indexedDB,
): Promise<void> {
  if (await target.getMeta(LEGACY_IMPORTED_KEY)) return;
  const userId = target.userId;
  const legacy = await openNamedDB(DB_NAME, idb);
  try {
    const records = await readAll<Record<string, unknown>>(legacy, STORE_CUSTOMERS);
    const ops = await readAll<QueueOp>(legacy, STORE_QUEUE);
    const mine = records.filter((r) => r.owner_id === userId);
    const owners = new Map(records.map((r) => [r.id, r.owner_id]));
    const pending = ops.filter((op) =>
      op.payload?.owner_id
        ? op.payload.owner_id === userId
        : previousUserId === userId && (!owners.has(op.recordId) || owners.get(op.recordId) === userId),
    );
    target.assertOpen();
    await new Promise<void>((resolve, reject) => {
      const transaction = target.db.transaction([STORE_CUSTOMERS, STORE_QUEUE, STORE_META], 'readwrite');
      for (const r of mine) transaction.objectStore(STORE_CUSTOMERS).put(r);
      for (const op of pending) {
        const { opId: _drop, ...copy } = op;
        transaction.objectStore(STORE_QUEUE).add(copy);
      }
      transaction.objectStore(STORE_META).put({ key: LEGACY_IMPORTED_KEY, at: new Date().toISOString() });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    legacy.close();
  }
}

/** = v1 CRM.init (phần dữ liệu): mở DB của tài khoản + nhập DB gốc 1 lần. Lỗi nhập → đóng DB, ném lỗi. */
export async function openUserDB(
  userId: string,
  opts: { previousUserId?: string | null; idb?: IDBFactory } = {},
): Promise<LocalDB> {
  const idb = opts.idb ?? indexedDB;
  const ldb = await LocalDB.open(userId, idb);
  try {
    await migrateLegacy(ldb, opts.previousUserId ?? null, idb);
  } catch (error) {
    ldb.close();
    throw error;
  }
  return ldb;
}
