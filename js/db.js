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
const DB_VERSION = 2;
const STORE_META = 'meta';
let _dbName = null, _scopeEpoch = 0, _localRevision = 0, _ready = Promise.resolve();
let _flushFlight = null;
const STORE_CUSTOMERS = 'customers';
const STORE_QUEUE = 'queue';
const DOC_BUCKET = 'customer-docs'; // Supabase Storage bucket cho tài liệu khách (PRIVATE)
const AVATAR_BUCKET = 'customer-avatars'; // bucket PUBLIC riêng cho ảnh đại diện (xem add_avatar_public_bucket.sql)

let _db = null;
let _supabase = null;
let _currentUserId = null;
let _lastAssignError = null; // lỗi giao khách gần nhất (xem flushQueue)
let _lastSyncError = null; // lỗi ĐẨY LÊN gần nhất (để hiển thị nếu hàng đợi kẹt)
let _lastPullError = null; // lỗi KÉO XUỐNG gần nhất (mạng lỗi → dữ liệu đang hiển thị có thể CŨ)

function openNamedDB(name) {
  return new Promise((resolve, reject) => {
    const req = name === DB_NAME ? indexedDB.open(name) : indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'opId', autoIncrement: true });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
    };
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

function openDB() {
  if (!_currentUserId || !_dbName) return Promise.reject(new Error('Chưa có phiên dữ liệu.'));
  const epoch = _scopeEpoch, name = _dbName;
  return _ready.then(async () => {
    if (epoch !== _scopeEpoch) throw new Error('Phiên dữ liệu đã thay đổi.');
    if (!_db) _db = await openNamedDB(name);
    return _db;
  });
}

// Import the old cache once per account. The original DB remains recoverable;
// unidentifiable operations are never assigned to a different account.
async function migrateLegacy(target, userId, previousUser) {
  const read = (db, store, key) => new Promise((resolve, reject) => {
    const req = key ? db.transaction(store).objectStore(store).get(key) : db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  if (await read(target, STORE_META, 'legacy-imported')) return;
  const legacy = await openNamedDB(DB_NAME);
  try {
    const records = await read(legacy, STORE_CUSTOMERS), ops = await read(legacy, STORE_QUEUE);
    const mine = records.filter((r) => r.owner_id === userId);
    const owners = new Map(records.map((r) => [r.id, r.owner_id]));
    const pending = ops.filter((op) => op.payload && op.payload.owner_id ? op.payload.owner_id === userId
      : previousUser === userId && (!owners.has(op.recordId) || owners.get(op.recordId) === userId));
    await new Promise((resolve, reject) => {
      const transaction = target.transaction([STORE_CUSTOMERS, STORE_QUEUE, STORE_META], 'readwrite');
      mine.forEach((r) => transaction.objectStore(STORE_CUSTOMERS).put(r));
      pending.forEach((op) => { const copy = { ...op }; delete copy.opId; transaction.objectStore(STORE_QUEUE).add(copy); });
      transaction.objectStore(STORE_META).put({ key: 'legacy-imported', at: new Date().toISOString() });
      transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { legacy.close(); }
}

function tx(storeName, mode) {
  const epoch = _scopeEpoch;
  return openDB().then((db) => { if (epoch !== _scopeEpoch) throw new Error('Phiên dữ liệu đã thay đổi.'); return db.transaction(storeName, mode).objectStore(storeName); });
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
    req.onsuccess = () => { _localRevision++; resolve(record); };
    req.onerror = () => reject(req.error);
  }));
}

function localDelete(id) {
  return tx(STORE_CUSTOMERS, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => { _localRevision++; resolve(); };
    req.onerror = () => reject(req.error);
  }));
}

async function localReplaceAll(records, expectedEpoch = _scopeEpoch, expectedRevision = _localRevision) {
  const db = await openDB();
  if (expectedEpoch !== _scopeEpoch || expectedRevision !== _localRevision) throw new Error('Dữ liệu local đã thay đổi trong lúc tải.');
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CUSTOMERS, STORE_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORE_CUSTOMERS); let failure = null;
    const pending = transaction.objectStore(STORE_QUEUE).count();
    pending.onsuccess = () => {
      if (expectedEpoch !== _scopeEpoch || expectedRevision !== _localRevision || pending.result) {
        failure = new Error('Dữ liệu local đã thay đổi trong lúc tải.'); transaction.abort(); return;
      }
      store.clear(); records.forEach((r) => store.put(r));
    };
    transaction.oncomplete = () => { if (expectedEpoch === _scopeEpoch) _localRevision++; resolve(); };
    transaction.onabort = () => reject(failure || transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function queueAdd(op) {
  return tx(STORE_QUEUE, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.add(op);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// CHỈ NGƯỜI PHỤ TRÁCH được ghi (D-003): khách đồng nghiệp phụ trách mà mình chỉ theo dõi /
// xem qua "Cả nhóm" → mọi thao tác ghi bị chặn TẠI ĐÂY (trước khi đụng cache local), kể cả khi
// giao diện sót 1 nút sửa. Riêng thao tác GIAO KHÁCH (update kèm opts.assign) được phép cho admin.
class ReadOnlyError extends Error {
  constructor(name) { super(`Khách do ${name || 'đồng nghiệp'} phụ trách — bạn chỉ xem được`); this.code = 'READ_ONLY'; }
}
async function assertWritable(customerId) {
  if (!customerId) return;
  const rec = (await localGetAll()).find((r) => r.id === customerId);
  if (rec && rec.owner_id && rec.owner_id !== _currentUserId) throw new ReadOnlyError();
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
  async init(supabaseClient, userId) {
    if (!userId) throw new Error('Thiếu tài khoản dữ liệu.');
    if (_currentUserId === userId && _db) { _supabase = supabaseClient; return; }
    this.suspend();
    _supabase = supabaseClient; _currentUserId = userId;
    _dbName = DB_NAME + '__' + encodeURIComponent(userId);
    let previousUser = null;
    try { previousUser = JSON.parse(localStorage.getItem('crm_last_user') || 'null')?.id; } catch {}
    const epoch = _scopeEpoch, name = _dbName;
    _ready = (async () => {
      const db = await openNamedDB(name);
      try { await migrateLegacy(db, userId, previousUser); } catch (error) { db.close(); throw error; }
      if (epoch !== _scopeEpoch) { db.close(); throw new Error('Phiên dữ liệu đã thay đổi.'); }
      _db = db;
    })();
    await _ready;
  },

  suspend() {
    _scopeEpoch++; if (_db) _db.close();
    _db = null; _dbName = null; _currentUserId = null; _supabase = null;
    _lastSyncError = null; _lastPullError = null; _flushFlight = null;
    _localRevision = 0; _ready = Promise.resolve();
  },

  isOnline() {
    return navigator.onLine;
  },

  async list() {
    if (!_currentUserId) return [];
    return (await localGetAll()).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  },

  /**
   * Kéo dữ liệu mới nhất từ Supabase về local (chỉ nên gọi khi queue đã rỗng).
   * Trả về { ok, skipped?, error? } để UI biết có kéo được bản mới không — QUAN TRỌNG:
   * trước đây pull lỗi mạng chỉ log im lặng, khiến badge vẫn báo "đã đồng bộ" dù dữ liệu
   * đang CŨ (mạng chập chờn trên Mac). Nay ghi lại _lastPullError để badge phản ánh đúng.
   */
  async pull() {
    if (!this.isOnline() || !_supabase) return { ok: false, skipped: true };
    const pending = await queueGetAll();
    if (pending.length > 0) return { ok: false, skipped: true }; // tránh ghi đè thay đổi chưa đồng bộ
    const epoch = _scopeEpoch, revision = _localRevision;
    try {
      const data = await CRMFetch.all(_supabase, 'customers', '*', () => epoch === _scopeEpoch);
      if (epoch !== _scopeEpoch) return { ok: false, skipped: true };
      if (revision !== _localRevision || (await queueGetAll()).length) return { ok: false, skipped: true };
      await localReplaceAll(data, epoch, revision);
      _lastPullError = null; // kéo thành công → xoá cờ lỗi cũ
      return { ok: true };
    } catch (e) {
      if (epoch !== _scopeEpoch) return { ok: false, skipped: true };
      // Không kéo được bản mới (mạng lỗi dù navigator.onLine=true, hoặc lỗi server).
      _lastPullError = { message: e.message || String(e), code: e.code || null, at: new Date().toISOString() };
      console.warn('Pull lỗi (dữ liệu đang hiển thị có thể CŨ):', _lastPullError);
      return { ok: false, error: _lastPullError };
    }
  },

  async create(payload, opts = {}) {
    const now = new Date().toISOString();
    const record = {
      id: uuid(),
      owner_id: _currentUserId,
      created_at: now,
      updated_at: now,
      care_stage_updated_at: now, // khách mới: mốc = giờ tạo
      ...payload,
    };
    // Thời gian đăng ký: nếu không nhập thì lấy thời điểm tạo.
    if (!record.registered_at) record.registered_at = now;
    // Nếu khách mới đã có 1 bậc care_stage → tạo mốc đầu tiên cho lịch sử.
    record.care_stage_history = payload.care_stage
      ? [{ stage: payload.care_stage, note: opts.careStageNote || null, at: now }]
      : [];
    // Danh sách ghi chú tự nhập (bullet có mốc thời gian) — mặc định rỗng.
    if (!Array.isArray(record.notes_manual)) record.notes_manual = [];
    await localPut(record);
    await queueAdd({ type: 'insert', recordId: record.id, payload: record, ts: now });
    this.flushQueue();
    return record;
  },

  async update(id, payload, opts = {}) {
    if (!opts.assign) await assertWritable(id); // opts.assign: giao khách (RLS + trigger DB kiểm tra quyền)
    const existing = (await localGetAll()).find((r) => r.id === id) || { id };
    const now = new Date().toISOString();
    // care_stage_updated_at + lịch sử ghi thêm 1 mốc khi:
    //  - careChanged: care_stage đổi sang bậc khác (đi tới hoặc lùi), HOẶC
    //  - opts.forceLog: ghi thêm 1 lần liên hệ CÙNG bậc (vd gọi lại lần 2) — dù
    //    care_stage không đổi. Sửa các field khác (không kèm 2 cờ này) → không đụng.
    const careChanged = 'care_stage' in payload && payload.care_stage !== existing.care_stage;
    const logStage = careChanged || opts.forceLog || opts.rewind;
    const record = { ...existing, ...payload, id, updated_at: now };
    if (logStage) {
      record.care_stage_updated_at = now;
      let history = Array.isArray(existing.care_stage_history) ? existing.care_stage_history.slice() : [];
      if (opts.rewind && Array.isArray(opts.keepStages)) {
        // CẬP NHẬT LÙI: chỉ giữ các mốc thuộc bậc <= bậc mới (danh sách keepStages
        // do app.js tính theo thứ hạng phễu), xoá mọi mốc bậc cao hơn — coi các
        // bước sau là nhầm/thử. Nếu mốc cuối còn lại đã đúng bậc mới thì KHÔNG thêm
        // mốc trùng (tránh nhân đôi vd "Đăng kí mới" khi tua hẳn về đầu phễu).
        history = history.filter((h) => opts.keepStages.includes(h.stage));
        const last = history[history.length - 1];
        if (!last || last.stage !== payload.care_stage) {
          history.push({ stage: payload.care_stage || null, note: opts.careStageNote || null, at: now });
        }
      } else {
        // Append 1 mốc mới (đổi bậc thường, hoặc ghi thêm lần cùng bậc).
        history.push({ stage: payload.care_stage || null, note: opts.careStageNote || null, at: now });
      }
      record.care_stage_history = history;
    }
    await localPut(record);
    // Gửi kèm updated_at lên server để sort/xung đột chính xác sau khi đồng bộ
    // (Supabase không tự cập nhật updated_at khi UPDATE — không có trigger).
    const queuedPayload = { ...payload, updated_at: now };
    if (logStage) {
      queuedPayload.care_stage_updated_at = now;
      queuedPayload.care_stage_history = record.care_stage_history;
    }
    await queueAdd({ type: 'update', recordId: id, payload: queuedPayload, ts: now });
    this.flushQueue();
    return record;
  },

  /**
   * Ghi thêm 1 lần liên hệ CÙNG bậc hiện tại (vd "Đăng kí mới" lần 2, "Đang tiếp
   * cận" lần 3...) — bản chất vẫn ở nguyên bậc, chỉ thêm 1 mốc vào timeline để
   * theo dõi. Dùng lại update() với cờ forceLog.
   */
  async addCareLog(id, note) {
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing || !existing.care_stage) return;
    return this.update(id, { care_stage: existing.care_stage }, { careStageNote: note || null, forceLog: true });
  },

  // ---- Ghi chú tự nhập (notes_manual): mảng {text, at}, mới nhất ở ĐẦU mảng ----
  // Chỉ đồng bộ riêng cột notes_manual (partial update) → không đụng field khác.

  /** Thêm 1 ghi chú mới (lên đầu danh sách). */
  async addNote(id, text) {
    await assertWritable(id);
    const t = (text || '').trim();
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing || !t) return;
    const now = new Date().toISOString();
    const list = Array.isArray(existing.notes_manual) ? existing.notes_manual.slice() : [];
    list.unshift({ text: t, at: now }); // mới nhất lên đầu
    const record = { ...existing, notes_manual: list, updated_at: now };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { notes_manual: list, updated_at: now }, ts: now });
    this.flushQueue();
    return record;
  },

  /** Sửa nội dung 1 ghi chú (nhận diện theo `at`). Để trống = xoá ghi chú đó. */
  async updateNote(id, at, text) {
    await assertWritable(id);
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const t = (text || '').trim();
    let list = Array.isArray(existing.notes_manual) ? existing.notes_manual.slice() : [];
    const idx = list.findIndex((n) => n.at === at);
    if (idx === -1) return;
    if (!t) list.splice(idx, 1);
    else {
      const entry = { ...list[idx], text: t };
      if (due) entry.due = due; else delete entry.due;
      list[idx] = entry;
    }
    const record = { ...existing, notes_manual: list };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { notes_manual: list }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  /** Xoá 1 ghi chú (nhận diện theo `at`). */
  async deleteNote(id, at) {
    await assertWritable(id);
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const list = (Array.isArray(existing.notes_manual) ? existing.notes_manual : []).filter((n) => n.at !== at);
    const record = { ...existing, notes_manual: list };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { notes_manual: list }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  // ---- VIỆC TIẾP THEO (next_tasks): mảng {text, at, due?}, GIỮ thứ tự tạo (cũ → mới) ----
  // due = hạn ngày giờ (ISO), tuỳ chọn — không có thì bỏ trống khoá.
  // Chỉ đồng bộ riêng cột next_tasks (partial update) → không đụng field khác.

  /** Thêm 1 việc mới (xuống cuối danh sách). */
  async addTask(id, text, due) {
    await assertWritable(id);
    const t = (text || '').trim();
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing || !t) return;
    const now = new Date().toISOString();
    const list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
    const entry = { text: t, at: now };
    if (due) entry.due = due;
    list.push(entry); // việc mới xuống cuối
    const record = { ...existing, next_tasks: list, updated_at: now };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { next_tasks: list, updated_at: now }, ts: now });
    this.flushQueue();
    return record;
  },

  /** Sửa nội dung + hạn 1 việc (nhận diện theo `at`). Nội dung trống = xoá việc đó; due trống = bỏ hạn. */
  async updateTask(id, at, text, due) {
    await assertWritable(id);
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const t = (text || '').trim();
    let list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
    const idx = list.findIndex((n) => n.at === at);
    if (idx === -1) return;
    if (!t) list.splice(idx, 1);
    else {
      const entry = { ...list[idx], text: t };
      if (due) entry.due = due; else delete entry.due;
      list[idx] = entry;
    }
    const record = { ...existing, next_tasks: list };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { next_tasks: list }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  /** Xoá 1 việc (nhận diện theo `at`). */
  async deleteTask(id, at) {
    await assertWritable(id);
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const list = (Array.isArray(existing.next_tasks) ? existing.next_tasks : []).filter((n) => n.at !== at);
    const record = { ...existing, next_tasks: list };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { next_tasks: list }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  // ---- TÀI LIỆU (ảnh/PDF) — ONLINE-ONLY, KHÔNG qua hàng đợi offline ----
  // File nằm ở Supabase Storage (bucket customer-docs, riêng tư); metadata ở bảng
  // documents. Cần mạng để dùng (khác dữ liệu chữ của khách vốn offline-first).

  /** Danh sách tài liệu của 1 khách (cũ → mới). Offline → mảng rỗng. */
  async listDocuments(customerId) {
    if (!this.isOnline() || !_supabase) return [];
    const { data, error } = await _supabase.from('documents')
      .select('*').eq('customer_id', customerId).order('created_at', { ascending: true });
    if (error) { console.warn('listDocuments lỗi:', error); return []; }
    return data || [];
  },

  /** Upload 1 file (File/Blob) lên Storage + tạo dòng metadata. Trả về row. */
  async uploadDocument(customerId, file, kind = 'khac', label = null) {
    await assertWritable(customerId);
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để tải tài liệu lên');
    const mime = file.type || 'application/octet-stream';
    let ext = 'bin';
    if (file.name && file.name.includes('.')) ext = file.name.split('.').pop().toLowerCase();
    else if (mime === 'application/pdf') ext = 'pdf';
    else if (mime.startsWith('image/')) ext = mime.split('/')[1] || 'jpg';
    const docId = uuid();
    const path = `${_currentUserId}/${customerId}/${docId}.${ext}`;
    const up = await _supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (up.error) throw up.error;
    const row = {
      id: docId, customer_id: customerId, owner_id: _currentUserId,
      kind, label, storage_path: path, mime, size: file.size || null,
    };
    const { error } = await _supabase.from('documents').insert(row);
    if (error) { // rollback file đã upload nếu tạo metadata lỗi
      await _supabase.storage.from(DOC_BUCKET).remove([path]);
      throw error;
    }
    return row;
  },

  /** Xoá 1 tài liệu (cả file lẫn metadata). */
  async deleteDocument(doc) {
    await assertWritable(doc && doc.customer_id);
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để xoá tài liệu');
    await _supabase.storage.from(DOC_BUCKET).remove([doc.storage_path]);
    const { error } = await _supabase.from('documents').delete().eq('id', doc.id);
    if (error) throw error;
  },

  // ---- ẢNH ĐẠI DIỆN (avatar) — bucket PUBLIC riêng (customer-avatars) ----
  // File ở '<owner>/<customerId>/avatar-<ts>.<ext>'; đường dẫn lưu ở cột customers.avatar_path.
  // Hiển thị bằng PUBLIC URL (đồng bộ, không cần ký, trình duyệt tự cache) → hiện gần như
  // tức thì, khác tài liệu (private, xem qua signedDocUrl). Xem add_avatar_public_bucket.sql.

  /** Đổi/đặt avatar: upload ảnh mới → set avatar_path → xoá file avatar cũ (nếu có). */
  async uploadAvatar(customerId, file) {
    await assertWritable(customerId);
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để đổi ảnh đại diện');
    const existing = (await localGetAll()).find((r) => r.id === customerId);
    const oldPath = existing && existing.avatar_path;
    const mime = file.type || 'image/jpeg';
    const ext = mime.startsWith('image/') ? (mime.split('/')[1] || 'jpg') : 'jpg';
    const path = `${_currentUserId}/${customerId}/avatar-${Date.now()}.${ext}`;
    const up = await _supabase.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (up.error) throw up.error;
    await this.update(customerId, { avatar_path: path }); // ghi vào record (offline-first + đồng bộ)
    // Dọn file avatar cũ (không chặn nếu lỗi — chỉ là rác nhẹ trong bucket). File cũ có thể
    // còn nằm ở bucket tài liệu (trước migrate) → thử xoá ở CẢ 2 bucket cho sạch.
    if (oldPath && oldPath !== path) {
      for (const b of [AVATAR_BUCKET, DOC_BUCKET]) {
        try { await _supabase.storage.from(b).remove([oldPath]); } catch (e) { /* bỏ qua */ }
      }
    }
    return path;
  },

  /** Public URL của 1 avatar (đồng bộ, không cần mạng để dựng URL). null nếu không có path. */
  avatarUrl(path) {
    if (!path || !_supabase) return null;
    const { data } = _supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return (data && data.publicUrl) || null;
  },

  /** Gỡ avatar: xoá file + đặt avatar_path = null. */
  async removeAvatar(customerId) {
    await assertWritable(customerId);
    const existing = (await localGetAll()).find((r) => r.id === customerId);
    const oldPath = existing && existing.avatar_path;
    if (oldPath && this.isOnline() && _supabase) {
      for (const b of [AVATAR_BUCKET, DOC_BUCKET]) {
        try { await _supabase.storage.from(b).remove([oldPath]); } catch (e) { /* bỏ qua */ }
      }
    }
    await this.update(customerId, { avatar_path: null });
  },

  // ---- ẢNH BÌA (cover) — TÁI DÙNG bucket PUBLIC customer-avatars (xem add_cover_photo.sql).
  // File ở '<owner>/<customerId>/cover-<ts>.<ext>'; đường dẫn lưu ở cột customers.cover_path.
  // Cùng bucket + cùng thư mục owner nên RLS/public URL dùng chung với avatar.

  /** Đổi/đặt ảnh bìa: upload ảnh mới → set cover_path → xoá file bìa cũ (nếu có). */
  async uploadCover(customerId, file) {
    await assertWritable(customerId);
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để đổi ảnh bìa');
    const existing = (await localGetAll()).find((r) => r.id === customerId);
    const oldPath = existing && existing.cover_path;
    const mime = file.type || 'image/jpeg';
    const ext = mime.startsWith('image/') ? (mime.split('/')[1] || 'jpg') : 'jpg';
    const path = `${_currentUserId}/${customerId}/cover-${Date.now()}.${ext}`;
    const up = await _supabase.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (up.error) throw up.error;
    await this.update(customerId, { cover_path: path });
    if (oldPath && oldPath !== path) {
      try { await _supabase.storage.from(AVATAR_BUCKET).remove([oldPath]); } catch (e) { /* bỏ qua */ }
    }
    return path;
  },

  /** Public URL của 1 ảnh bìa (đồng bộ). null nếu không có path. */
  coverUrl(path) {
    if (!path || !_supabase) return null;
    const { data } = _supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return (data && data.publicUrl) || null;
  },

  /** Gỡ ảnh bìa: xoá file + đặt cover_path = null. */
  async removeCover(customerId) {
    await assertWritable(customerId);
    const existing = (await localGetAll()).find((r) => r.id === customerId);
    const oldPath = existing && existing.cover_path;
    if (oldPath && this.isOnline() && _supabase) {
      try { await _supabase.storage.from(AVATAR_BUCKET).remove([oldPath]); } catch (e) { /* bỏ qua */ }
    }
    await this.update(customerId, { cover_path: null });
  },

  // ---- CÀI ĐẶT RIÊNG CỦA USER (bảng user_settings) — đồng bộ đa thiết bị ----
  // Lời chào Zalo. Trả: chuỗi nếu server có; null nếu CHƯA có dòng (hoặc cột null);
  // undefined nếu offline/lỗi (chỗ gọi giữ nguyên local).
  async getZaloGreetingRemote() {
    if (!this.isOnline() || !_supabase || !_currentUserId) return undefined;
    const { data, error } = await _supabase
      .from('user_settings').select('zalo_greeting').eq('id', _currentUserId).maybeSingle();
    if (error) { console.warn('getZaloGreeting remote lỗi:', error.message || error); return undefined; }
    return data ? data.zalo_greeting : null;
  },
  // Ghi (upsert) lời chào lên server. Trả true nếu thành công.
  async saveZaloGreetingRemote(text) {
    if (!this.isOnline() || !_supabase || !_currentUserId) return false;
    const { error } = await _supabase.from('user_settings')
      .upsert({ id: _currentUserId, zalo_greeting: text, updated_at: new Date().toISOString() });
    if (error) { console.warn('saveZaloGreeting remote lỗi:', error.message || error); return false; }
    return true;
  },

  // Mẫu tin Zalo (mảng [{id,name,text}]) — cột user_settings.zalo_templates (SQL/add_zalo_templates.sql).
  // Chưa chạy SQL → lỗi cột → trả undefined/false, app vẫn dùng mẫu lưu trên máy.
  async getZaloTemplatesRemote() {
    if (!this.isOnline() || !_supabase || !_currentUserId) return undefined;
    const { data, error } = await _supabase
      .from('user_settings').select('zalo_templates').eq('id', _currentUserId).maybeSingle();
    if (error) { console.warn('getZaloTemplates remote lỗi (đã chạy SQL/add_zalo_templates.sql chưa?):', error.message || error); return undefined; }
    return data ? data.zalo_templates : null;
  },
  async saveZaloTemplatesRemote(list) {
    if (!this.isOnline() || !_supabase || !_currentUserId) return false;
    const { error } = await _supabase.from('user_settings')
      .upsert({ id: _currentUserId, zalo_templates: list, updated_at: new Date().toISOString() });
    if (error) { console.warn('saveZaloTemplates remote lỗi (đã chạy SQL/add_zalo_templates.sql chưa?):', error.message || error); return false; }
    return true;
  },

  /**
   * Migrate 1 lần: chuyển file avatar cũ từ bucket private (customer-docs) sang bucket
   * public (customer-avatars), GIỮ NGUYÊN path (nên avatar_path không đổi). Idempotent:
   * file nào không còn ở bucket cũ (đã chuyển / vốn ở bucket mới) → bỏ qua. Chỉ chạy khi
   * online. Gọi 1 lần sau đăng nhập (app.js đặt cờ localStorage để không lặp).
   */
  async migrateAvatarsToPublicBucket() {
    if (!this.isOnline() || !_supabase) return { moved: 0 };
    const all = await localGetAll();
    let moved = 0;
    for (const c of all) {
      if (!c.avatar_path) continue;
      try {
        // Tải bytes từ bucket cũ (nếu không có ở đó → lỗi → bỏ qua, coi như đã ở bucket mới).
        const dl = await _supabase.storage.from(DOC_BUCKET).download(c.avatar_path);
        if (dl.error || !dl.data) continue;
        const blob = dl.data;
        const up = await _supabase.storage.from(AVATAR_BUCKET)
          .upload(c.avatar_path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
        if (up.error) continue;
        // Chuyển xong → xoá file cũ ở bucket private cho sạch (không chặn nếu lỗi).
        try { await _supabase.storage.from(DOC_BUCKET).remove([c.avatar_path]); } catch (e) { /* bỏ qua */ }
        moved++;
      } catch (e) { console.warn('Migrate avatar lỗi:', c.avatar_path, e); }
    }
    return { moved };
  },

  /** Link ký tạm để xem 1 file (mặc định hết hạn sau 60s). */
  async signedDocUrl(storagePath, expires = 60) {
    if (!this.isOnline() || !_supabase) return null;
    const { data, error } = await _supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, expires);
    if (error) { console.warn('signedDocUrl lỗi:', error); return null; }
    return data.signedUrl;
  },

  /**
   * Sửa RIÊNG note của 1 mốc trong lịch sử chăm sóc (nhận diện mốc theo `at`).
   * KHÔNG đụng stage, at, updated_at hay care_stage_updated_at (giữ nguyên sort). CHỈ đổi
   * note + đánh dấu `edited_at` = giờ sửa (để card tính "Cập nhật" theo hoạt động ghi chú).
   */
  async updateCareHistoryNote(id, at, note) {
    await assertWritable(id);
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const history = Array.isArray(existing.care_stage_history) ? existing.care_stage_history.slice() : [];
    const idx = history.findIndex((h) => h.at === at);
    if (idx === -1) return;
    history[idx] = { ...history[idx], note: note || null, edited_at: new Date().toISOString() };
    const record = { ...existing, care_stage_history: history };
    await localPut(record);
    // Đồng bộ CHỈ cột care_stage_history → không làm nhảy timestamp/sort nào.
    await queueAdd({ type: 'update', recordId: id, payload: { care_stage_history: history }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  async remove(id) {
    await assertWritable(id);
    await localDelete(id);
    await queueAdd({ type: 'delete', recordId: id, ts: new Date().toISOString() });
    this.flushQueue();
  },

  /** Đẩy các thao tác đang chờ lên Supabase. Bỏ qua im lặng nếu offline. */
  async flushQueue() {
    if (!_currentUserId) return { synced: 0, pending: 0 };
    if (!this.isOnline() || !_supabase) return { synced: 0, pending: (await queueGetAll()).length };
    if (_flushFlight) return _flushFlight;
    const epoch = _scopeEpoch, client = _supabase;
    const flight = (async () => {
      const db = await openDB();
      const deleteOp = (id) => new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_QUEUE, 'readwrite'); transaction.objectStore(STORE_QUEUE).delete(id);
        transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
      });
      const ops = await queueGetAll();
      let synced = 0;
      for (const op of ops) {
        if (epoch !== _scopeEpoch) break;
        try {
          if (op.type === 'insert') {
            // upsert (theo khoá chính id) thay vì insert: nếu record đã có trên
            // server thì cập nhật đè, tránh lỗi "trùng khoá" làm kẹt hàng đợi mãi.
            const { error } = await client.from('customers').upsert(op.payload);
            if (error) throw error;
          } else if (op.type === 'update') {
            const { error } = await client.from('customers').update(op.payload).eq('id', op.recordId);
            if (error) throw error;
          } else if (op.type === 'delete') {
            const { error } = await client.from('customers').delete().eq('id', op.recordId);
            if (error) throw error;
          }
          if (epoch !== _scopeEpoch) break;
          await deleteOp(op.opId);
          synced++;
          _lastSyncError = null;
        } catch (e) {
          if (epoch !== _scopeEpoch) break;
          // Insert bị TRÙNG (23505: trùng id hoặc trùng (phone, owner)) → khách đã
          // có trên server, thao tác insert này là thừa → BỎ để không kẹt hàng đợi.
          // (pull() sau đó sẽ đồng bộ lại bản chuẩn từ server.) Chỉ auto-bỏ với insert.
          if (op.type === 'insert' && (e.code === '23505' || /duplicate key|unique constraint/i.test(e.message || ''))) {
            console.warn('Bỏ insert trùng (khách đã có trên server):', op.recordId, e.message);
            if (epoch !== _scopeEpoch) break;
            await deleteOp(op.opId);
            _lastSyncError = null;
            continue; // xử lý op kế tiếp, không chặn hàng đợi
          }
          // GIAO KHÁCH lỗi (người nhận đã có khách trùng SĐT 23505, hoặc DB từ chối quyền 42501)
          // → bỏ op để không kẹt hàng đợi; pull() sau đó trả khách về đúng trạng thái server.
          if (op.type === 'update' && op.payload && 'owner_id' in op.payload
              && (e.code === '23505' || e.code === '42501' || /duplicate key|unique constraint/i.test(e.message || ''))) {
            if (epoch !== _scopeEpoch) break;
            await deleteOp(op.opId);
            _lastAssignError = e.code === '42501' ? (e.message || 'Không có quyền giao khách này')
              : 'Không giao được: người nhận đã có khách trùng số điện thoại trong danh sách của họ';
            continue;
          }
          // Lỗi khác (mạng, hoặc update vi phạm ràng buộc...) → ghi lại + dừng để
          // giữ thứ tự; app hiện rõ để user xử lý.
          _lastSyncError = { opId: op.opId, type: op.type, recordId: op.recordId, message: e.message || String(e), code: e.code || null };
          console.warn('Sync lỗi op', op.opId, op.type, _lastSyncError);
          break;
        }
      }
      return { synced, pending: epoch === _scopeEpoch ? (await queueGetAll()).length : 0, error: _lastSyncError };
    })();
    _flushFlight = flight;
    try { return await flight; } finally { if (_flushFlight === flight) _flushFlight = null; }
  },

  async pendingCount() {
    if (!_currentUserId) return 0;
    return (await queueGetAll()).length;
  },

  lastSyncError() { return _lastSyncError; },
  /** Lỗi giao khách gần nhất (rồi xoá) — app hiện thông báo 1 lần. */
  takeAssignError() { const e = _lastAssignError; _lastAssignError = null; return e; },

  // ---- NHÓM (D-003, SQL/add_team_assign.sql) — cần mạng; app cache danh sách để dùng offline ----
  async teamList() {
    if (!this.isOnline() || !_supabase) return undefined;
    const { data, error } = await _supabase.rpc('team_list');
    if (error) { console.warn('team_list lỗi (đã chạy SQL/add_team_assign.sql chưa?):', error.message || error); return undefined; }
    return data || [];
  },
  async teamAdd(email) {
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để thêm đồng nghiệp');
    const { data, error } = await _supabase.rpc('team_add', { member_email: email });
    if (error) throw error;
    return data;
  },
  async teamRemove(userId) {
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để xoá đồng nghiệp');
    const { error } = await _supabase.rpc('team_remove', { member_id: userId });
    if (error) throw error;
  },
  async setMyName(name) {
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để đổi tên');
    const { error } = await _supabase.rpc('team_set_my_name', { new_name: name });
    if (error) throw error;
  },
  userId() { return _currentUserId; },
  lastPullError() { return _lastPullError; },

  // Xoá toàn bộ hàng đợi đang chờ (escape hatch khi 1 thao tác kẹt vĩnh viễn).
  // Dữ liệu khách đã lưu trong IndexedDB vẫn còn; chỉ bỏ việc đẩy các thao tác đó lên server.
  async clearQueue() {
    const ops = await queueGetAll();
    for (const op of ops) await queueDelete(op.opId);
    _lastSyncError = null;
    return ops.length;
  },
};

window.CRM = CRM;

window.addEventListener('online', () => { if (_currentUserId) CRM.flushQueue().then(() => CRM.pull()).catch((e) => console.warn('Đồng bộ khi có mạng:', e.message)); });
