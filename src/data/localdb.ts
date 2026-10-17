/**
 * IndexedDB local theo tài khoản — port 1-1 legacy/js/db.js (D-012: v1 và v2 dùng CHUNG DB này).
 * KHÔNG đổi: tên DB `crm_khach_hang__<encodeURIComponent(userId)>`, version 2, store `customers` (keyPath id),
 * `queue` (keyPath opId, autoIncrement), `meta` (keyPath key). Bản ghi lưu nguyên trạng (không parse/biến đổi).
 *
 * Khác v1 (cùng hành vi): thay biến toàn cục + `_scopeEpoch` bằng 1 instance LocalDB cho mỗi phiên tài khoản;
 * close() = v1 suspend(): mọi thao tác sau đó báo "Phiên dữ liệu đã thay đổi." → không ghi lẫn tài khoản.
 */
import type { Customer } from '@/domain/customer';

export const DB_NAME = 'crm_khach_hang';
export const DB_VERSION = 2;
export const STORE_CUSTOMERS = 'customers';
export const STORE_QUEUE = 'queue';
export const STORE_META = 'meta';

export const SCOPE_CHANGED = 'Phiên dữ liệu đã thay đổi.';
export const LOCAL_CHANGED = 'Dữ liệu local đã thay đổi trong lúc tải.';

/** Tên DB riêng của 1 tài khoản (giống v1). */
export function dbNameFor(userId: string): string {
  return `${DB_NAME}__${encodeURIComponent(userId)}`;
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Mở 1 DB: DB gốc `crm_khach_hang` mở không kèm version (như v1); DB theo tài khoản mở version 2. */
export function openNamedDB(name: string, idb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = name === DB_NAME ? idb.open(name) : idb.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_QUEUE))
        db.createObjectStore(STORE_QUEUE, { keyPath: 'opId', autoIncrement: true });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

// So 2 bản ghi: coi là GIỐNG nếu chỉ khác cách viết giờ ("…Z" local vs "…+00:00" server) — tránh vẽ lại
// thừa khi nhận "tiếng vọng" của chính thiết bị này.
const TS_RE = /^\d{4}-\d\d-\d\dT/;
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string' && TS_RE.test(a) && TS_RE.test(b))
    return Date.parse(a) === Date.parse(b);
  return JSON.stringify(a) === JSON.stringify(b);
}
export function sameRecord(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
) {
  if (!a || !b) return a === b;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (!sameValue(a[k] ?? null, b[k] ?? null)) return false;
  return true;
}

/** CHỈ NGƯỜI PHỤ TRÁCH được ghi (D-003). Thao tác giao khách (assign) không đi qua kiểm tra này. */
export class ReadOnlyError extends Error {
  readonly code = 'READ_ONLY';
  constructor(name?: string) {
    super(`Khách do ${name || 'đồng nghiệp'} phụ trách — bạn chỉ xem được`);
  }
}

export class LocalDB {
  private closed = false;
  private rev = 0;

  constructor(
    readonly db: IDBDatabase,
    readonly userId: string,
  ) {}

  /** Mở DB của 1 tài khoản (chưa nhập DB gốc — xem legacyImport.openUserDB). */
  static async open(userId: string, idb: IDBFactory = indexedDB): Promise<LocalDB> {
    if (!userId) throw new Error('Thiếu tài khoản dữ liệu.');
    return new LocalDB(await openNamedDB(dbNameFor(userId), idb), userId);
  }

  /** Invalidate in-flight remote reads before an atomic repository transaction. */
  markChanged(): void {
    this.assertOpen();
    this.rev++;
  }

  /** Số lần local đổi — pull dùng để bỏ kết quả khi local đổi trong lúc kéo. */
  get revision(): number {
    return this.rev;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** = v1 suspend(): đóng DB, mọi thao tác sau đó bị từ chối. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  /** Object store trong 1 transaction mới. Ném lỗi nếu phiên đã đóng. */
  store(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    this.assertOpen();
    return this.db.transaction(name, mode).objectStore(name);
  }

  assertOpen(): void {
    if (this.closed) throw new Error(SCOPE_CHANGED);
  }

  async get(id: string): Promise<Customer | null> {
    return ((await reqResult(this.store(STORE_CUSTOMERS).get(id))) as Customer | undefined) ?? null;
  }

  async getAll(): Promise<Customer[]> {
    return (await reqResult(this.store(STORE_CUSTOMERS).getAll())) as Customer[];
  }

  /** = v1 CRM.list(): mới sửa nhất lên đầu. */
  async list(): Promise<Customer[]> {
    return (await this.getAll()).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  async put<T extends Customer>(record: T): Promise<T> {
    await reqResult(this.store(STORE_CUSTOMERS, 'readwrite').put(record));
    this.rev++;
    return record;
  }

  async delete(id: string): Promise<void> {
    await reqResult(this.store(STORE_CUSTOMERS, 'readwrite').delete(id));
    this.rev++;
  }

  /**
   * Thay toàn bộ cache bằng dữ liệu server (pull). Từ chối (LOCAL_CHANGED) nếu local đổi kể từ
   * expectedRevision hoặc hàng đợi còn thao tác — tránh ghi đè thay đổi chưa đồng bộ.
   */
  replaceAll(records: readonly Customer[], expectedRevision: number = this.rev): Promise<void> {
    this.assertOpen();
    if (expectedRevision !== this.rev) return Promise.reject(new Error(LOCAL_CHANGED));
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_CUSTOMERS, STORE_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORE_CUSTOMERS);
      let failure: Error | null = null;
      const pending = transaction.objectStore(STORE_QUEUE).count();
      pending.onsuccess = () => {
        if (this.closed || expectedRevision !== this.rev || pending.result) {
          failure = new Error(this.closed ? SCOPE_CHANGED : LOCAL_CHANGED);
          transaction.abort();
          return;
        }
        store.clear();
        for (const r of records) store.put(r);
      };
      transaction.oncomplete = () => {
        if (!this.closed) this.rev++;
        resolve();
      };
      transaction.onabort = () => reject(failure || transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /** Chặn ghi khách của đồng nghiệp (D-003) — gọi TRƯỚC khi đụng cache local. */
  async assertWritable(customerId: string | null | undefined): Promise<void> {
    if (!customerId) return;
    const rec = await this.get(customerId);
    if (rec?.owner_id && rec.owner_id !== this.userId) throw new ReadOnlyError();
  }

  async getMeta<T = Record<string, unknown>>(key: string): Promise<T | null> {
    return ((await reqResult(this.store(STORE_META).get(key))) as T | undefined) ?? null;
  }

  async putMeta(entry: { key: string; [k: string]: unknown }): Promise<void> {
    await reqResult(this.store(STORE_META, 'readwrite').put(entry));
  }
}
