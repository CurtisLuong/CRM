/** Kho riêng theo tài khoản; không dùng hàng đợi khách và không xoá dữ liệu SK-01. */
import { pagedFetch } from '../pagedFetch';
import type { CustomerSync } from '../sync';

export type SendKitFileData = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  path?: string;
  cached?: boolean;
  [key: string]: unknown;
};
export type SendKitItemData = {
  id: string;
  title: string;
  text: string;
  project: string | null;
  files: SendKitFileData[];
  order: number;
  updatedAt: number;
  ownerId?: string;
  ownerName?: string;
  pending?: boolean;
  createdAt?: number;
  deletedAt?: string | null;
};
type RemoteFile = Pick<SendKitFileData, 'id' | 'name' | 'type' | 'size'> & {
  path: string;
  [key: string]: unknown;
};
export type SendKitRow = {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  project: string | null;
  files: RemoteFile[];
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type Member = { user_id: string; full_name: string | null; is_admin?: boolean; is_me?: boolean };
export const SEND_KIT_LOAD_ERROR = 'Chưa tải được tài liệu mới — đang dùng bản trên máy';
export const SEND_KIT_MAX_FILE_SIZE = 50 * 1024 * 1024;

export function sendKitFileError(file: { name: string; type: string; size: number }): string | null {
  if (file.size > SEND_KIT_MAX_FILE_SIZE) return `${file.name} quá 50MB — nén lại rồi đăng`;
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'application/pdf')
    return `${file.name}: chỉ thêm ảnh, PDF hoặc video.`;
  return null;
}

export function canEditSendKitItem(item: SendKitItemData, userId: string, admin = false): boolean {
  return !item.ownerId || item.ownerId === userId || admin;
}

/** Không suy ra xoá từ mục vắng mặt; lỗi đọc được biểu diễn bằng undefined. */
export function mergeSendKitItems(
  local: SendKitItemData[],
  remote: SendKitRow[] | undefined,
  userId: string,
  members: Member[] = [],
): SendKitItemData[] {
  const result = new Map(
    local.map((item) => [item.id, { ...item, ownerId: item.ownerId ?? userId, pending: item.pending ?? true }]),
  );
  for (const row of remote ?? []) {
    const old = result.get(row.id);
    const updatedAt = Date.parse(row.updated_at);
    if (old && old.updatedAt > updatedAt) continue;
    result.set(row.id, {
      ...old,
      id: row.id,
      ownerId: row.owner_id,
      ownerName: members.find((member) => member.user_id === row.owner_id)?.full_name || old?.ownerName,
      title: row.title,
      text: row.body,
      project: row.project,
      files: row.files.map((file) => {
        const cached = old?.files.find(
          (candidate) => candidate.id === file.id && (!candidate.path || candidate.path === file.path),
        );
        return {
          ...cached,
          ...file,
          blob: cached?.blob ?? new Blob([]),
          cached: !!cached && cached.cached !== false,
        } as SendKitFileData;
      }),
      order: row.sort_order,
      createdAt: Date.parse(row.created_at),
      updatedAt,
      deletedAt: row.deleted_at,
      pending: false,
    });
  }
  return [...result.values()].map((item) => ({
    ...item,
    ownerName: members.find((member) => member.user_id === item.ownerId)?.full_name || item.ownerName,
  }));
}

function openDatabase(userId: string, idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = idb.open(`crm_send_kit__${userId}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Không mở được kho tài liệu trên máy.'));
  });
}

async function changeLocal(
  userId: string,
  change: ((items: SendKitItemData[]) => SendKitItemData[]) | null,
  idb: IDBFactory = indexedDB,
  assertOpen = () => {},
): Promise<SendKitItemData[]> {
  assertOpen();
  const db = await openDatabase(userId, idb);
  try {
    assertOpen();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('items', change ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('items');
      let rows: SendKitItemData[] = [];
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          assertOpen();
          rows = change ? change(request.result) : request.result;
          if (change) for (const item of rows) store.put(item);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => resolve(rows);
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error('Không lưu được kho tài liệu trên máy.'));
    });
  } finally {
    db.close();
  }
}

function toRow(item: SendKitItemData): SendKitRow {
  return {
    id: item.id,
    owner_id: item.ownerId ?? '',
    title: item.title,
    body: item.text,
    project: item.project,
    files: item.files.map(({ blob: _blob, cached: _cached, ...file }) => file as RemoteFile),
    sort_order: item.order,
    created_at: new Date(item.createdAt ?? item.updatedAt).toISOString(),
    updated_at: new Date(item.updatedAt).toISOString(),
    deleted_at: item.deletedAt ?? null,
  };
}

export function createSendKitRepository(sync: CustomerSync, idb?: IDBFactory, storage?: Storage) {
  const uid = sync.local.userId;
  let stopped = false;
  let started = false;
  let fileViews = 0;
  const cleanup: (() => void)[] = [];
  const current = () => !stopped && !sync.local.isClosed;
  const assertOpen = () => {
    if (stopped) throw new Error('Phiên dữ liệu đã đóng.');
    sync.local.assertOpen();
  };
  const listeners = new Set<() => void>();
  let members: Member[] = [];
  const teamKey = `crm_send_kit_team:${uid}`;
  try {
    const cached: unknown = JSON.parse((storage ?? localStorage).getItem(teamKey) ?? '[]');
    if (Array.isArray(cached)) members = cached;
  } catch {}
  const admin = () => members.some((member) => member.user_id === uid && member.is_admin);
  let snapshot = { items: [] as SendKitItemData[], loadError: '', syncError: '' };
  let running: Promise<void> | null = null;
  let requested = false;
  let requestedFiles = false;
  const deleted = new Map<string, number>();
  let eventRevision = 0;
  const downloads = new Map<string, Promise<Blob>>();
  function emit(rows: SendKitItemData[] = snapshot.items) {
    if (!current()) return;
    snapshot = { ...snapshot, items: rows.filter((item) => !item.deletedAt).sort((a, b) => a.order - b.order) };
    for (const listener of listeners) listener();
  }
  async function local(change: ((items: SendKitItemData[]) => SendKitItemData[]) | null = null) {
    const rows = await changeLocal(uid, change, idb, assertOpen);
    assertOpen();
    emit(rows);
    return rows;
  }
  const online = () => !sync.demoMode && current() && sync.isOnline();
  function writable(item: SendKitItemData) {
    if (!canEditSendKitItem(item, uid, admin())) throw new Error('Chỉ người tạo hoặc trưởng nhóm được sửa tài liệu.');
  }
  async function loadTeam() {
    const { data, error } = await sync.client.rpc('team_list');
    assertOpen();
    if (error || !Array.isArray(data)) return;
    members = data as Member[];
    try {
      (storage ?? localStorage).setItem(teamKey, JSON.stringify(members));
    } catch {}
  }
  async function cacheFile(file: SendKitFileData): Promise<Blob> {
    assertOpen();
    if (file.cached !== false) return file.blob;
    if (!online()) throw new Error(`${file.name} chưa có trên máy — kết nối mạng để tải trước khi gửi.`);
    if (!file.path) throw new Error(`Chưa tải được ${file.name}. Hãy thử lại khi có mạng.`);
    let download = downloads.get(file.path);
    if (!download) {
      download = (async () => {
        const { data, error } = await sync.client.storage.from('send-kit').download(file.path ?? '');
        assertOpen();
        if (error || !data) throw new Error(`Chưa tải được ${file.name}. Hãy thử lại khi có mạng.`);
        await local((items) =>
          items.map((item) => ({
            ...item,
            files: item.files.map((current) =>
              current.id === file.id && current.path === file.path ? { ...current, blob: data, cached: true } : current,
            ),
          })),
        );
        return data;
      })();
      downloads.set(file.path, download);
    }
    try {
      return await download;
    } finally {
      downloads.delete(file.path);
    }
  }
  async function push(item: SendKitItemData, exists: boolean) {
    writable(item);
    for (const file of item.files) {
      if (file.path) continue;
      const invalid = sendKitFileError(file);
      if (invalid) throw new Error(invalid);
      const extension =
        file.name
          .split('.')
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, '') || 'bin';
      const path = `${item.ownerId}/${item.id}/${file.id}.${extension}`;
      const { error } = await sync.client.storage.from('send-kit').upload(path, file.blob, {
        contentType: file.type,
        upsert: false,
      });
      assertOpen();
      // UUID tệp bất biến: lần trước có thể upload xong nhưng chưa ghi được hàng.
      if (error && String((error as { statusCode?: string }).statusCode) !== '409') throw error;
      file.path = path;
      await local((items) =>
        items.map((current) => ({
          ...current,
          files: current.files.map((entry) =>
            current.id === item.id && entry.id === file.id ? { ...entry, path } : entry,
          ),
        })),
      );
    }
    if (!online()) return;
    const row = toRow(item);
    // Admin không INSERT thay đồng nghiệp: SQL chỉ cấp UPDATE cho mục của người khác.
    // Điều kiện thời gian chặn máy cũ ghi đè bản mới trong lúc đang upload.
    const request = exists
      ? sync.client.from('send_kit_items').update(row).eq('id', item.id).lte('updated_at', row.updated_at)
      : sync.client.from('send_kit_items').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    const { data, error } = await request.select('*');
    assertOpen();
    if (error) throw error;
    async function confirmedRow(rows: SendKitRow[] | null): Promise<SendKitRow | undefined> {
      if (rows?.[0]) return rows[0];
      const result = await sync.client.from('send_kit_items').select('*').eq('id', item.id).maybeSingle();
      assertOpen();
      if (result.error) throw result.error;
      return result.data as SendKitRow | undefined;
    }
    let saved = await confirmedRow(data as SendKitRow[] | null);
    if (!exists && saved && Date.parse(saved.updated_at) < item.updatedAt) {
      // Máy khác vừa nhập cùng id cũ sau lần đọc: chuyển sang UPDATE có điều kiện.
      const retry = await sync.client
        .from('send_kit_items')
        .update(row)
        .eq('id', item.id)
        .lte('updated_at', row.updated_at)
        .select('*');
      assertOpen();
      if (retry.error) throw retry.error;
      saved = await confirmedRow(retry.data as SendKitRow[] | null);
    }
    if (!saved || Date.parse(saved.updated_at) < item.updatedAt)
      throw new Error('Chưa xác nhận được tài liệu đã đồng bộ.');
    await local((items) => mergeSendKitItems(items, [saved], uid, members));
  }
  async function synchronizeOnce(downloadFiles: boolean) {
    if (!online()) return;
    try {
      const [remote] = await Promise.all([
        pagedFetch<SendKitRow>(sync.client, 'send_kit_items', '*', current),
        loadTeam().catch(() => {}),
      ]);
      assertOpen();
      snapshot = { ...snapshot, loadError: '', syncError: '' };
      const existing = new Set(remote.map((item) => item.id));
      const deletions = new Map(deleted);
      const merged = await local((items) =>
        mergeSendKitItems(items, remote, uid, members).map((item) =>
          // Chỉ sự kiện DELETE xác nhận mới được ẩn mục vắng; giữ blob và bản đang chờ đẩy.
          deletions.has(item.id) && !existing.has(item.id) && item.pending === false
            ? { ...item, deletedAt: item.deletedAt ?? new Date().toISOString() }
            : item,
        ),
      );
      for (const [id, revision] of deletions) if (deleted.get(id) === revision) deleted.delete(id);
      for (const candidate of merged) {
        if (!online()) return;
        if (!candidate.pending || !canEditSendKitItem(candidate, uid, admin())) continue;
        // Đọc lại sau mỗi lần chờ để không đẩy một bản đã cũ.
        const current = (await local()).find((item) => item.id === candidate.id);
        if (!current?.pending) continue;
        try {
          await push(current, existing.has(current.id));
        } catch {
          assertOpen();
          snapshot = { ...snapshot, syncError: 'Chưa đồng bộ được tài liệu — sẽ tự thử lại khi có mạng.' };
          emit();
        }
      }
    } catch {
      if (!current()) return;
      snapshot = { ...snapshot, loadError: SEND_KIT_LOAD_ERROR };
      emit();
      return;
    }
    // Đồng bộ nền chỉ kéo metadata; màn đang mở mới chuẩn bị tệp để gửi offline.
    for (const item of snapshot.items) {
      for (const file of item.files) {
        if (!online() || (!downloadFiles && !fileViews)) return;
        if (file.cached === false) await cacheFile(file).catch(() => {});
      }
    }
  }
  function synchronize(options: { downloadFiles?: boolean } = {}): Promise<void> {
    if (!online()) return Promise.resolve();
    requested = true;
    requestedFiles ||= options.downloadFiles ?? true;
    if (!running) {
      running = (async () => {
        while (requested && online()) {
          requested = false;
          const downloadFiles = requestedFiles;
          requestedFiles = false;
          await synchronizeOnce(downloadFiles);
        }
      })().finally(() => {
        running = null;
      });
    }
    return running;
  }
  const synchronizeBackground = () => {
    void synchronize({ downloadFiles: false });
  };
  function dispose() {
    if (stopped) return;
    stopped = true;
    requested = false;
    requestedFiles = false;
    deleted.clear();
    for (const stop of cleanup) stop();
    cleanup.length = 0;
    listeners.clear();
  }
  function start() {
    if (started || !current()) return dispose;
    started = true;
    if (sync.demoMode) return dispose;
    const resume = () => {
      if (document.visibilityState === 'visible') synchronizeBackground();
    };
    window.addEventListener('online', synchronizeBackground);
    window.addEventListener('focus', synchronizeBackground);
    document.addEventListener('visibilitychange', resume);
    cleanup.push(() => {
      window.removeEventListener('online', synchronizeBackground);
      window.removeEventListener('focus', synchronizeBackground);
      document.removeEventListener('visibilitychange', resume);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    cleanup.push(() => clearTimeout(timer));
    try {
      let liveStatus = '';
      const channel = sync.client
        .channel(`crm-send-kit-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'send_kit_items' }, (payload) => {
          if (!current()) return;
          const id = (payload.eventType === 'DELETE' ? payload.old : payload.new).id;
          if (typeof id !== 'string' || !id) return;
          if (payload.eventType === 'DELETE') deleted.set(id, ++eventRevision);
          else deleted.delete(id);
          clearTimeout(timer);
          timer = setTimeout(synchronizeBackground, 300);
        })
        .subscribe((status) => {
          if (!current()) return;
          // Bắt kịp cả khoảng chờ nối kênh lần đầu và các lần nối lại.
          if (status === 'SUBSCRIBED' && liveStatus !== status) synchronizeBackground();
          liveStatus = status;
        });
      cleanup.push(() => {
        void sync.client.removeChannel(channel).catch(() => {});
      });
    } catch {
      // Thiếu Realtime vẫn đồng bộ được khi mở hoặc quay lại app.
    }
    synchronizeBackground();
    return dispose;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async list() {
      await local();
      return snapshot.items;
    },
    canEdit: (item: SendKitItemData) => canEditSendKitItem(item, uid, admin()),
    synchronize,
    start,
    dispose,
    watchFiles() {
      assertOpen();
      fileViews++;
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        fileViews--;
      };
    },
    async save(item: SendKitItemData) {
      for (const file of item.files) {
        const invalid = sendKitFileError(file);
        if (invalid) throw new Error(invalid);
      }
      await local((items) => {
        const previous = items.find((row) => row.id === item.id);
        if (previous) writable(previous);
        if (previous?.deletedAt) throw new Error('Tài liệu đã bị xoá. Hãy đóng và chọn lại.');
        const saved = {
          ...previous,
          ...item,
          ownerId: previous?.ownerId ?? uid,
          files: item.files.map((file) => {
            const old = previous?.files.find((entry) => entry.id === file.id);
            return { ...old, ...file, path: file.path ?? old?.path };
          }),
          createdAt: previous?.createdAt ?? previous?.updatedAt ?? item.updatedAt,
          updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1),
          pending: true,
        };
        return [...items.filter((row) => row.id !== item.id), saved];
      });
      synchronizeBackground();
    },
    async remove(id: string) {
      await local((items) =>
        items.map((item) => {
          if (item.id !== id) return item;
          writable(item);
          return {
            ...item,
            deletedAt: new Date().toISOString(),
            updatedAt: Math.max(Date.now(), item.updatedAt + 1),
            pending: true,
          };
        }),
      );
      synchronizeBackground();
    },
    async reorder(ordered: SendKitItemData[]) {
      await local((items) =>
        items.map((item) => {
          const order = ordered.find((row) => row.id === item.id)?.order;
          if (order === undefined || item.order === order) return item;
          writable(item);
          return { ...item, order, updatedAt: Math.max(Date.now(), item.updatedAt + 1), pending: true };
        }),
      );
      synchronizeBackground();
    },
    async ensureFiles(ids: string[]) {
      const items = await local();
      const chosen = ids.map((id) => {
        const item = items.find((row) => row.id === id && !row.deletedAt);
        if (!item) throw new Error('Tài liệu đã thay đổi. Hãy chọn lại trước khi gửi.');
        return item;
      });
      for (const item of chosen) {
        for (const file of item.files) {
          file.blob = await cacheFile(file);
          file.cached = true;
        }
      }
      return chosen;
    },
  };
}
