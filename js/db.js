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
const DOC_BUCKET = 'customer-docs'; // Supabase Storage bucket cho tài liệu khách

let _db = null;
let _supabase = null;
let _currentUserId = null;
let _lastSyncError = null; // lỗi ĐẨY LÊN gần nhất (để hiển thị nếu hàng đợi kẹt)
let _lastPullError = null; // lỗi KÉO XUỐNG gần nhất (mạng lỗi → dữ liệu đang hiển thị có thể CŨ)

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
    try {
      const { data, error } = await _supabase.from('customers').select('*');
      if (error) throw error;
      await localReplaceAll(data);
      _lastPullError = null; // kéo thành công → xoá cờ lỗi cũ
      return { ok: true };
    } catch (e) {
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
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const t = (text || '').trim();
    let list = Array.isArray(existing.notes_manual) ? existing.notes_manual.slice() : [];
    const idx = list.findIndex((n) => n.at === at);
    if (idx === -1) return;
    if (!t) list.splice(idx, 1);
    else list[idx] = { ...list[idx], text: t };
    const record = { ...existing, notes_manual: list };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { notes_manual: list }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  /** Xoá 1 ghi chú (nhận diện theo `at`). */
  async deleteNote(id, at) {
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const list = (Array.isArray(existing.notes_manual) ? existing.notes_manual : []).filter((n) => n.at !== at);
    const record = { ...existing, notes_manual: list };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { notes_manual: list }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  // ---- VIỆC TIẾP THEO (next_tasks): mảng {text, at}, GIỮ thứ tự tạo (cũ → mới) ----
  // Chỉ đồng bộ riêng cột next_tasks (partial update) → không đụng field khác.

  /** Thêm 1 việc mới (xuống cuối danh sách). */
  async addTask(id, text) {
    const t = (text || '').trim();
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing || !t) return;
    const now = new Date().toISOString();
    const list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
    list.push({ text: t, at: now }); // việc mới xuống cuối
    const record = { ...existing, next_tasks: list, updated_at: now };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { next_tasks: list, updated_at: now }, ts: now });
    this.flushQueue();
    return record;
  },

  /** Sửa nội dung 1 việc (nhận diện theo `at`). Để trống = xoá việc đó. */
  async updateTask(id, at, text) {
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const t = (text || '').trim();
    let list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
    const idx = list.findIndex((n) => n.at === at);
    if (idx === -1) return;
    if (!t) list.splice(idx, 1);
    else list[idx] = { ...list[idx], text: t };
    const record = { ...existing, next_tasks: list };
    await localPut(record);
    await queueAdd({ type: 'update', recordId: id, payload: { next_tasks: list }, ts: new Date().toISOString() });
    this.flushQueue();
    return record;
  },

  /** Xoá 1 việc (nhận diện theo `at`). */
  async deleteTask(id, at) {
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
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để xoá tài liệu');
    await _supabase.storage.from(DOC_BUCKET).remove([doc.storage_path]);
    const { error } = await _supabase.from('documents').delete().eq('id', doc.id);
    if (error) throw error;
  },

  // ---- ẢNH ĐẠI DIỆN (avatar) — ONLINE-ONLY, lưu cùng bucket với tài liệu ----
  // File nằm ở '<owner>/<customerId>/avatar-<ts>.<ext>'; đường dẫn lưu ở cột customers.avatar_path
  // (đồng bộ offline-first qua update()). Xem hiển thị bằng signedDocUrl như tài liệu.

  /** Đổi/đặt avatar: upload ảnh mới → set avatar_path → xoá file avatar cũ (nếu có). */
  async uploadAvatar(customerId, file) {
    if (!this.isOnline() || !_supabase) throw new Error('Cần mạng để đổi ảnh đại diện');
    const existing = (await localGetAll()).find((r) => r.id === customerId);
    const oldPath = existing && existing.avatar_path;
    const mime = file.type || 'image/jpeg';
    const ext = mime.startsWith('image/') ? (mime.split('/')[1] || 'jpg') : 'jpg';
    const path = `${_currentUserId}/${customerId}/avatar-${Date.now()}.${ext}`;
    const up = await _supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (up.error) throw up.error;
    await this.update(customerId, { avatar_path: path }); // ghi vào record (offline-first + đồng bộ)
    // Dọn file avatar cũ (không chặn nếu lỗi — chỉ là rác nhẹ trong bucket).
    if (oldPath && oldPath !== path) {
      try { await _supabase.storage.from(DOC_BUCKET).remove([oldPath]); } catch (e) { console.warn('Xoá avatar cũ lỗi:', e); }
    }
    return path;
  },

  /** Gỡ avatar: xoá file + đặt avatar_path = null. */
  async removeAvatar(customerId) {
    const existing = (await localGetAll()).find((r) => r.id === customerId);
    const oldPath = existing && existing.avatar_path;
    if (oldPath && this.isOnline() && _supabase) {
      try { await _supabase.storage.from(DOC_BUCKET).remove([oldPath]); } catch (e) { console.warn('Xoá avatar lỗi:', e); }
    }
    await this.update(customerId, { avatar_path: null });
  },

  /** Link ký tạm để xem 1 file (mặc định hết hạn sau 60s). */
  async signedDocUrl(storagePath, expires = 60) {
    if (!this.isOnline() || !_supabase) return null;
    const { data, error } = await _supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, expires);
    if (error) { console.warn('signedDocUrl lỗi:', error); return null; }
    return data.signedUrl;
  },

  /** Link ký tạm cho NHIỀU path trong 1 lần gọi (cho avatar trên card). Trả Map(path → url). */
  async signedDocUrls(paths, expires = 600) {
    const out = new Map();
    if (!this.isOnline() || !_supabase || !paths || !paths.length) return out;
    const { data, error } = await _supabase.storage.from(DOC_BUCKET).createSignedUrls(paths, expires);
    if (error) { console.warn('signedDocUrls lỗi:', error); return out; }
    for (const it of (data || [])) { if (it && it.signedUrl && !it.error) out.set(it.path, it.signedUrl); }
    return out;
  },

  /**
   * Sửa RIÊNG note của 1 mốc trong lịch sử chăm sóc (nhận diện mốc theo `at`).
   * KHÔNG đụng stage, at, updated_at hay care_stage_updated_at — chỉ đổi note.
   */
  async updateCareHistoryNote(id, at, note) {
    const existing = (await localGetAll()).find((r) => r.id === id);
    if (!existing) return;
    const history = Array.isArray(existing.care_stage_history) ? existing.care_stage_history.slice() : [];
    const idx = history.findIndex((h) => h.at === at);
    if (idx === -1) return;
    history[idx] = { ...history[idx], note: note || null };
    const record = { ...existing, care_stage_history: history };
    await localPut(record);
    // Đồng bộ CHỈ cột care_stage_history → không làm nhảy timestamp/sort nào.
    await queueAdd({ type: 'update', recordId: id, payload: { care_stage_history: history }, ts: new Date().toISOString() });
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
          // upsert (theo khoá chính id) thay vì insert: nếu record đã có trên
          // server thì cập nhật đè, tránh lỗi "trùng khoá" làm kẹt hàng đợi mãi.
          const { error } = await _supabase.from('customers').upsert(op.payload);
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
        _lastSyncError = null;
      } catch (e) {
        // Insert bị TRÙNG (23505: trùng id hoặc trùng (phone, owner)) → khách đã
        // có trên server, thao tác insert này là thừa → BỎ để không kẹt hàng đợi.
        // (pull() sau đó sẽ đồng bộ lại bản chuẩn từ server.) Chỉ auto-bỏ với insert.
        if (op.type === 'insert' && (e.code === '23505' || /duplicate key|unique constraint/i.test(e.message || ''))) {
          console.warn('Bỏ insert trùng (khách đã có trên server):', op.recordId, e.message);
          await queueDelete(op.opId);
          _lastSyncError = null;
          continue; // xử lý op kế tiếp, không chặn hàng đợi
        }
        // Lỗi khác (mạng, hoặc update vi phạm ràng buộc...) → ghi lại + dừng để
        // giữ thứ tự; app hiện rõ để user xử lý.
        _lastSyncError = { opId: op.opId, type: op.type, recordId: op.recordId, message: e.message || String(e), code: e.code || null };
        console.warn('Sync lỗi op', op.opId, op.type, _lastSyncError);
        break;
      }
    }
    return { synced, pending: (await queueGetAll()).length, error: _lastSyncError };
  },

  async pendingCount() {
    return (await queueGetAll()).length;
  },

  lastSyncError() { return _lastSyncError; },
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
