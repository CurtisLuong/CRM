/**
 * db.js — Lớp lưu trữ local (IndexedDB) + hàng đợi đồng bộ lên Supabase.
 *
 * Nguyên tắc:
 *  - Mọi thao tác đọc (list/search/filter) luôn đọc từ IndexedDB (nhanh, chạy offline được).
 *  - Mọi thao tác ghi (thêm/sửa/xoá) ghi vào IndexedDB NGAY LẬP TỨC, đồng thời
 *    đẩy vào hàng đợi "queue". Nếu đang online, queue được xử lý ngay; nếu
 *    offline, queue nằm chờ tới khi có mạng trở lại (event 'online').
 *  - Xung đột xử lý theo kiểu "last write wins" dựa trên updated_at — chấp
 *    nhận được vì đây là CRM cá nhân, xác suất 2 thiết bị sửa cùng 1 khách
 *    cùng lúc là rất thấp.
 */

const DB_NAME = 'crm_khach_hang';
const DB_VERSION = 1;
const STORE_CUSTOMERS = 'customers';
const STORE_QUEUE = 'queue';

let _db = null;
let _supabase = null;
let _currentUserId = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
        db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'opId', autoIncrement: true });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function localGetAll() {
  return tx(STORE_CUSTOMERS, 'readonly').then((store) => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function localPut(record) {
  return tx(STORE_CUSTOMERS, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  }));
}

function localDelete(id) {
  return tx(STORE_CUSTOMERS, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function localReplaceAll(records) {
  return tx(STORE_CUSTOMERS, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      records.forEach((r) => store.put(r));
      resolve();
    };
    clearReq.onerror = () => reject(clearReq.error);
  }));
}

function queueAdd(op) {
  return tx(STORE_QUEUE, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.add(op);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function queueGetAll() {
  return tx(STORE_QUEUE, 'readonly').then((store) => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function queueDelete(opId) {
  return tx(STORE_QUEUE, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.delete(opId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CRM = {
  /** Gọi 1 lần khi app khởi động, sau khi đã có session đăng nhập */
  init(supabaseClient, userId) {
    _supabase = supabaseClient;
    _currentUserId = userId;
    window.addEventListener('online', () => CRM.flushQueue().then(() => CRM.pull()));
  },

  isOnline() {
    return navigator.onLine;
  },

  async list() {
    return (await localGetAll()).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  },

  /** Kéo dữ liệu mới nhất từ Supabase về local (chỉ nên gọi khi queue đã rỗng) */
  async pull() {
    if (!this.isOnline() || !_supabase) return;
    const pending = await queueGetAll();
    if (pending.length > 0) return; // tránh ghi đè thay đổi chưa đồng bộ
    const { data, error } = await _supabase.from('customers').select('*');
    if (error) { console.error('Pull error:', error); return; }
    await localReplaceAll(data);
  },

  async create(payload) {
    const now = new Date().toISOString();
    const record = {
      id: uuid(),
      owner_id: _currentUserId,
      created_at: now,
      updated_at: now,
      ...payload,
    };
    await localPut(record);
    await queueAdd({ type: 'insert', recordId: record.id, payload: record, ts: now });
    this.flushQueue();
    return record;
  },

  async update(id, payload) {
    const existing = (await localGetAll()).find((r) => r.id === id) || { id };
    const now = new Date().toISOString();
    const record = { ...existing, ...payload, id, updated_at: now };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload, ts: now });
    this.flushQueue();
    return record;
  },

  async remove(id) {
    await localDelete(id);
    await queueAdd({ type: 'delete', recordId: id, ts: new Date().toISOString() });
    this.flushQueue();
  },

  /** Đẩy các thao tác đang chờ lên Supabase. Bỏ qua im lặng nếu offline. */
  async flushQueue() {
    if (!this.isOnline() || !_supabase) return { synced: 0, pending: (await queueGetAll()).length };
    const ops = await queueGetAll();
    let synced = 0;
    for (const op of ops) {
      try {
        if (op.type === 'insert') {
          const { error } = await _supabase.from('customers').insert(op.payload);
          if (error) throw error;
        } else if (op.type === 'update') {
          const { error } = await _supabase.from('customers').update(op.payload).eq('id', op.recordId);
          if (error) throw error;
        } else if (op.type === 'delete') {
          const { error } = await _supabase.from('customers').delete().eq('id', op.recordId);
          if (error) throw error;
        }
        await queueDelete(op.opId);
        synced++;
      } catch (e) {
        console.warn('Sync tạm hoãn cho op', op.opId, e.message);
        break; // giữ thứ tự: dừng lại, thử lại ở lần flush sau
      }
    }
    return { synced, pending: (await queueGetAll()).length };
  },

  async pendingCount() {
    return (await queueGetAll()).length;
  },
};

window.CRM = CRM;
