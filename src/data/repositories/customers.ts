/** Customer aggregate repository. Mutation bodies port legacy/js/db.js; queue payload keys intentionally match v1. */
// biome-ignore-all lint/suspicious/noExplicitAny: Preserve unknown legacy and future JSON fields without projecting the aggregate.
import type { Customer } from '@/domain/customer';
import { ReadOnlyError, STORE_CUSTOMERS, STORE_QUEUE, sameRecord } from '../localdb';
import { type QueueOp, queueCount } from '../queue';
import type { CustomerSync } from '../sync';
export type Data = Record<string, any>;
export type UpdateOptions = {
  assign?: boolean;
  forceLog?: boolean;
  rewind?: boolean;
  keepStages?: string[];
  careStageNote?: string | null;
  historyMeta?: Data;
};
type Mutation = { record: Data; op: Omit<QueueOp, 'opId'> };
export class CustomerRepository {
  private rows: Customer[] = [];
  private listeners = new Set<() => void>();
  private refreshVersion = 0;
  constructor(readonly sync: CustomerSync) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.rows;
  async refresh() {
    const version = ++this.refreshVersion;
    const rows = await this.sync.local.list();
    if (this.sync.local.isClosed || version !== this.refreshVersion) return;
    if (rows.length === this.rows.length && rows.every((r, i) => sameRecord(r, this.rows[i]))) return;
    this.rows = rows;
    for (const fn of this.listeners) fn();
  }
  async list(options: { includeArchived?: boolean } = {}) {
    return (await this.sync.local.list()).filter((r) => options.includeArchived || !r.archived_at);
  }
  get(id: string) {
    return this.sync.local.get(id);
  }
  private async write(id: string, change: (existing: Data | undefined) => Mutation | undefined, assign = false) {
    const local = this.sync.local;
    local.assertOpen();
    // Mark before starting: even a failed write conservatively invalidates an in-flight pull.
    local.markChanged();
    const result = await new Promise<Customer | undefined>((resolve, reject) => {
      const tx = local.db.transaction([STORE_CUSTOMERS, STORE_QUEUE], 'readwrite');
      const store = tx.objectStore(STORE_CUSTOMERS);
      const read = store.get(id);
      let result: Customer | undefined;
      let failure: unknown;
      read.onsuccess = () => {
        try {
          local.assertOpen();
          const existing = read.result as Data | undefined;
          if (!assign && existing?.owner_id && existing.owner_id !== local.userId) throw new ReadOnlyError();
          const mutation = change(existing);
          if (!mutation) return;
          store.put(mutation.record);
          tx.objectStore(STORE_QUEUE).add(mutation.op);
          result = mutation.record as Customer;
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error);
      tx.onerror = () => {
        failure ||= tx.error;
      };
    });
    if (!local.isClosed) {
      await this.refresh();
      if (!local.isClosed) {
        this.sync.status.set({ pending: await queueCount(local) });
        void this.sync.flushQueue().catch(() => {});
      }
    }
    return result;
  }
  async create(payload: Data, opts: UpdateOptions = {}) {
    const id = payload.id || crypto.randomUUID();
    return this.write(
      id,
      (_existing) => {
        const now = new Date().toISOString();
        const record: Data = {
          id,
          owner_id: this.sync.local.userId,
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
        return { record, op: { type: 'insert', recordId: record.id, payload: record, ts: now } };
      },
      true,
    );
  }

  async update(id: string, payload: Data, opts: UpdateOptions = {}) {
    return this.write(
      id,
      (existing) => {
        existing = existing || { id };
        const now = new Date().toISOString();
        // care_stage_updated_at + lịch sử ghi thêm 1 mốc khi:
        //  - careChanged: care_stage đổi sang bậc khác (đi tới hoặc lùi), HOẶC
        //  - opts.forceLog: ghi thêm 1 lần liên hệ CÙNG bậc (vd gọi lại lần 2) — dù
        //    care_stage không đổi. Sửa các field khác (không kèm 2 cờ này) → không đụng.
        const careChanged = 'care_stage' in payload && payload.care_stage !== existing.care_stage;
        const logStage = careChanged || opts.forceLog || opts.rewind;
        const record: Data = { ...existing, ...payload, id, updated_at: now };
        if (logStage) {
          record.care_stage_updated_at = now;
          let history = Array.isArray(existing.care_stage_history) ? existing.care_stage_history.slice() : [];
          if (opts.rewind && Array.isArray(opts.keepStages)) {
            // CẬP NHẬT LÙI: chỉ giữ các mốc thuộc bậc <= bậc mới (danh sách keepStages
            // do app.js tính theo thứ hạng phễu), xoá mọi mốc bậc cao hơn — coi các
            // bước sau là nhầm/thử. Nếu mốc cuối còn lại đã đúng bậc mới thì KHÔNG thêm
            // mốc trùng (tránh nhân đôi vd "Đăng kí mới" khi tua hẳn về đầu phễu).
            history = history.filter((h: Data) => opts.keepStages?.includes(h.stage));
            const last = history[history.length - 1];
            if (!last || last.stage !== payload.care_stage) {
              history.push({ stage: payload.care_stage || null, note: opts.careStageNote || null, at: now });
            }
          } else {
            // Append 1 mốc mới (đổi bậc thường, hoặc ghi thêm lần cùng bậc).
            // opts.historyMeta: field gắn thêm vào mốc (vd {auto:'sla'} = app tự chuyển vì quá SLA — D-008).
            history.push({
              stage: payload.care_stage || null,
              note: opts.careStageNote || null,
              at: now,
              ...(opts.historyMeta || {}),
            });
          }
          record.care_stage_history = history;
        }
        // Gửi kèm updated_at lên server để sort/xung đột chính xác sau khi đồng bộ
        // (Supabase không tự cập nhật updated_at khi UPDATE — không có trigger).
        const queuedPayload: Data = { ...payload, updated_at: now };
        if (logStage) {
          queuedPayload.care_stage_updated_at = now;
          queuedPayload.care_stage_history = record.care_stage_history;
        }
        return { record, op: { type: 'update', recordId: id, payload: queuedPayload, ts: now } };
      },
      opts.assign === true,
    );
  }

  async addNote(id: string, text: string | null) {
    return this.write(
      id,
      (existing) => {
        const t = (text || '').trim();

        if (!existing || !t) return;
        const now = new Date().toISOString();
        const list = Array.isArray(existing.notes_manual) ? existing.notes_manual.slice() : [];
        list.unshift({ text: t, at: now }); // mới nhất lên đầu
        const record: Data = { ...existing, notes_manual: list, updated_at: now };
        return {
          record,
          op: { type: 'update', recordId: id, payload: { notes_manual: list, updated_at: now }, ts: now },
        };
      },
      false,
    );
  }

  async updateNote(id: string, at: string, text: string | null) {
    return this.write(
      id,
      (existing) => {
        if (!existing) return;
        const t = (text || '').trim();
        const list = Array.isArray(existing.notes_manual) ? existing.notes_manual.slice() : [];
        const idx = list.findIndex((n: Data) => n.at === at);
        if (idx === -1) return;
        if (!t) list.splice(idx, 1);
        else list[idx] = { ...list[idx], text: t };
        const record: Data = { ...existing, notes_manual: list };
        return {
          record,
          op: { type: 'update', recordId: id, payload: { notes_manual: list }, ts: new Date().toISOString() },
        };
      },
      false,
    );
  }

  async deleteNote(id: string, at: string) {
    return this.write(
      id,
      (existing) => {
        if (!existing) return;
        const list = (Array.isArray(existing.notes_manual) ? existing.notes_manual : []).filter(
          (n: Data) => n.at !== at,
        );
        const record: Data = { ...existing, notes_manual: list };
        return {
          record,
          op: { type: 'update', recordId: id, payload: { notes_manual: list }, ts: new Date().toISOString() },
        };
      },
      false,
    );
  }

  async addTask(id: string, text: string, due?: Data | null, kind?: string) {
    return this.write(
      id,
      (existing) => {
        const t = (text || '').trim();

        if (!existing || !t) return;
        const now = new Date().toISOString();
        const list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
        const entry: Data = { text: t, at: now };
        if (kind) entry.kind = kind; // loại việc: message | cafe | docs | visit | contract | other
        if (due?.due) {
          entry.due = due.due;
          if (due.due_allday) entry.due_allday = true;
        }
        list.push(entry); // việc mới xuống cuối
        const record: Data = { ...existing, next_tasks: list, updated_at: now };
        return {
          record,
          op: { type: 'update', recordId: id, payload: { next_tasks: list, updated_at: now }, ts: now },
        };
      },
      false,
    );
  }

  async updateTask(id: string, at: string, text: string, due?: Data | null, kind?: string) {
    return this.write(
      id,
      (existing) => {
        if (!existing) return;
        const t = (text || '').trim();
        const list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
        const idx = list.findIndex((n: Data) => n.at === at);
        if (idx === -1) return;
        if (!t) list.splice(idx, 1);
        else {
          const entry: Data = { ...list[idx], text: t };
          if (kind) entry.kind = kind;
          delete entry.due;
          delete entry.due_allday;
          if (due?.due) {
            entry.due = due.due;
            if (due.due_allday) entry.due_allday = true;
          }
          list[idx] = entry;
        }
        const record: Data = { ...existing, next_tasks: list };
        return {
          record,
          op: { type: 'update', recordId: id, payload: { next_tasks: list }, ts: new Date().toISOString() },
        };
      },
      false,
    );
  }

  async completeTask(id: string, at: string) {
    return this.write(
      id,
      (existing) => {
        if (!existing) return;
        const list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
        const idx = list.findIndex((n: Data) => n.at === at);
        if (idx === -1 || list[idx].done_at) return;
        const now = new Date().toISOString();
        const entry: Data = { ...list[idx], done_at: now };
        const payload: Data = { updated_at: now };
        if (existing.care_stage) {
          const history = Array.isArray(existing.care_stage_history) ? existing.care_stage_history.slice() : [];
          history.push({ stage: existing.care_stage, note: `Xong việc: ${entry.text || ''}`, at: now });
          entry.log_at = now;
          payload.care_stage_history = history;
          payload.care_stage_updated_at = now;
        }
        list[idx] = entry;
        payload.next_tasks = list;
        const record: Data = { ...existing, ...payload };
        return { record, op: { type: 'update', recordId: id, payload, ts: now } };
      },
      false,
    );
  }

  async reopenTask(id: string, at: string) {
    return this.write(
      id,
      (existing) => {
        if (!existing) return;
        const list = Array.isArray(existing.next_tasks) ? existing.next_tasks.slice() : [];
        const idx = list.findIndex((n: Data) => n.at === at);
        if (idx === -1 || !list[idx].done_at) return;
        const now = new Date().toISOString();
        const entry: Data = { ...list[idx] };
        const logAt = entry.log_at;
        delete entry.done_at;
        delete entry.log_at;
        list[idx] = entry;
        const payload: Data = { next_tasks: list, updated_at: now };
        const hist = Array.isArray(existing.care_stage_history) ? existing.care_stage_history : [];
        if (logAt && hist.some((h: Data) => h.at === logAt)) {
          const history = hist.filter((h: Data) => h.at !== logAt);
          payload.care_stage_history = history;
          // Mốc "cập nhật chăm sóc" quay về mốc cuối còn lại (như trước khi bấm xong).
          if (history.length) payload.care_stage_updated_at = history[history.length - 1].at;
        }
        const record: Data = { ...existing, ...payload };
        return { record, op: { type: 'update', recordId: id, payload, ts: now } };
      },
      false,
    );
  }

  async deleteTask(id: string, at: string) {
    return this.write(
      id,
      (existing) => {
        if (!existing) return;
        const list = (Array.isArray(existing.next_tasks) ? existing.next_tasks : []).filter((n: Data) => n.at !== at);
        const record: Data = { ...existing, next_tasks: list };
        return {
          record,
          op: { type: 'update', recordId: id, payload: { next_tasks: list }, ts: new Date().toISOString() },
        };
      },
      false,
    );
  }

  async updateCareHistoryNote(id: string, at: string, note: string | null) {
    return this.write(
      id,
      (existing) => {
        if (!existing) return;
        const history = Array.isArray(existing.care_stage_history) ? existing.care_stage_history.slice() : [];
        const idx = history.findIndex((h: Data) => h.at === at);
        if (idx === -1) return;
        history[idx] = { ...history[idx], note: note || null, edited_at: new Date().toISOString() };
        const record: Data = { ...existing, care_stage_history: history };
        // Đồng bộ CHỈ cột care_stage_history → không làm nhảy timestamp/sort nào.
        return {
          record,
          op: { type: 'update', recordId: id, payload: { care_stage_history: history }, ts: new Date().toISOString() },
        };
      },
      false,
    );
  }

  async addCareLog(id: string, note: string | null) {
    // Read the stage within the mutation transaction; no stale stage snapshot.
    return this.write(id, (existing) => {
      if (!existing?.care_stage) return;
      const now = new Date().toISOString();
      const history = [
        ...(Array.isArray(existing.care_stage_history) ? existing.care_stage_history : []),
        { stage: existing.care_stage, note: note || null, at: now },
      ];
      const payload = {
        care_stage: existing.care_stage,
        updated_at: now,
        care_stage_updated_at: now,
        care_stage_history: history,
      };
      return { record: { ...existing, ...payload }, op: { type: 'update', recordId: id, payload, ts: now } };
    });
  }
  assign(id: string, ownerId: string, followers?: string[]) {
    return this.update(id, { owner_id: ownerId, ...(followers ? { followers } : {}) }, { assign: true });
  }
  remove(id: string) {
    return this.update(id, { archived_at: new Date().toISOString() });
  }
  restore(id: string) {
    return this.update(id, { archived_at: null });
  }
  logCall(id: string, attempt: Data, options: UpdateOptions & { editAt?: string; patch?: Data } = {}) {
    return this.write(id, (existing) => {
      if (!existing) return;
      const now = new Date().toISOString();
      const calls: Data[] = Array.isArray(existing.call_attempts) ? existing.call_attempts.slice() : [];
      const index = options.editAt ? calls.findIndex((a) => a?.at === options.editAt) : -1;
      if (options.editAt && index < 0) return;
      if (index >= 0) calls[index] = { ...calls[index], ...attempt };
      else calls.push({ ...attempt });
      const payload: Data = { ...options.patch, call_attempts: calls, updated_at: now };
      const stageChanged = 'care_stage' in payload && payload.care_stage !== existing.care_stage;
      if (stageChanged || options.forceLog) {
        payload.care_stage_updated_at = now;
        payload.care_stage_history = [
          ...(Array.isArray(existing.care_stage_history) ? existing.care_stage_history : []),
          { stage: payload.care_stage || null, note: options.careStageNote || null, at: now, ...options.historyMeta },
        ];
      }
      return { record: { ...existing, ...payload }, op: { type: 'update', recordId: id, payload, ts: now } };
    });
  }
}
