import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { createSendKitRepository, type SendKitItemData, type SendKitRow } from '@/data/repositories/sendKit';
import { RepositorySession } from '@/data/repositories/session';
import { CustomerSync } from '@/data/sync';

const T0 = Date.parse('2026-11-05T03:00:00Z');
const row = (id = 'a', extra: Partial<SendKitRow> = {}): SendKitRow => ({
  id,
  owner_id: 'u1',
  title: 'Bảng giá mới',
  body: 'Chữ gửi khách',
  project: 'Dự án A',
  files: [],
  sort_order: 0,
  created_at: new Date(T0).toISOString(),
  updated_at: new Date(T0).toISOString(),
  deleted_at: null,
  ...extra,
});
const remoteFile = (id: string) => ({
  id,
  name: `${id}.png`,
  type: 'image/png',
  size: 3,
  path: `u1/a/${id}.png`,
});
type Event = { eventType: string; old: { id?: string }; new: { id?: string } };

function api(initial: SendKitRow[] = []) {
  const state = {
    rows: structuredClone(initial),
    reads: 0,
    writes: [] as SendKitRow[],
    uploads: [] as string[],
    downloads: [] as string[],
    beforeRead: undefined as (() => Promise<void>) | undefined,
    beforeDownload: undefined as (() => Promise<void>) | undefined,
  };
  const respond = (data: unknown, count?: number) =>
    new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        ...(count === undefined ? {} : { 'content-range': `0-0/${count}` }),
      },
    });
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname.endsWith('/rpc/team_list'))
      return respond([
        { user_id: 'u1', full_name: 'Nguyễn A' },
        { user_id: 'u2', full_name: 'Nguyễn B' },
      ]);
    if (url.pathname.includes('/storage/v1/object/')) {
      if (method === 'POST') {
        state.uploads.push(url.pathname);
        return respond({ Key: 'ok' });
      }
      state.downloads.push(url.pathname);
      await state.beforeDownload?.();
      return new Response('anh', { headers: { 'content-type': 'image/png' } });
    }
    if (!url.pathname.endsWith('/send_kit_items')) throw new Error(`API ngoài phạm vi: ${url.pathname}`);
    if (method !== 'GET') {
      const payload = JSON.parse(String(init?.body)) as SendKitRow;
      state.writes.push(payload);
      state.rows = [...state.rows.filter((entry) => entry.id !== payload.id), payload];
      return respond([payload]);
    }
    state.reads++;
    await state.beforeRead?.();
    return respond(state.rows, state.rows.length);
  });
  const client = createClient('http://127.0.0.1:54321', 'sk04-fake-public-key', {
    global: { fetch: fetcher },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const channels: {
    name: string;
    filter?: unknown;
    event?: (event: Event) => void;
    status?: (status: string) => void;
  }[] = [];
  vi.spyOn(client, 'channel').mockImplementation((name) => {
    const callbacks: (typeof channels)[number] = { name };
    channels.push(callbacks);
    const channel = {
      on: (_name: string, filter: unknown, callback: (event: Event) => void) => {
        callbacks.filter = filter;
        callbacks.event = callback;
        return channel;
      },
      subscribe: (callback: (status: string) => void) => {
        callbacks.status = callback;
        return channel;
      },
    };
    return channel as unknown as ReturnType<SupabaseClient['channel']>;
  });
  const removeChannel = vi.spyOn(client, 'removeChannel').mockResolvedValue('ok');
  return { state, client, fetcher, channels, removeChannel };
}

async function seed(idb: IDBFactory, userId: string, items: SendKitItemData[]) {
  const request = idb.open(`crm_send_kit__${userId}`, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction('items', 'readwrite');
    for (const item of items) tx.objectStore('items').put(item);
    tx.oncomplete = () => resolve();
  });
  db.close();
}

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

async function setup(initial: SendKitRow[] = [], pending: SendKitItemData[] = [], online = true) {
  const server = api(initial);
  const idb = new IDBFactory();
  await seed(idb, 'u1', pending);
  const connectivity = { online };
  const local = await LocalDB.open('u1', idb);
  const sync = new CustomerSync(local, server.client, () => connectivity.online);
  const session = new RepositorySession(server.client, { idb, storage: localStorage });
  disposals.push(
    () => session.dispose(),
    () => local.close(),
  );
  session.auth.callbacks.onAccount?.(sync);
  const repository = session.getSnapshot()?.sendKit;
  if (!repository) throw new Error('Thiếu kho tài liệu');
  const channel = server.channels[0];
  const emit = (id: string, type = 'INSERT') => channel?.event?.({ eventType: type, old: { id }, new: { id } });
  const status = (value: string) => channel?.status?.(value);
  const idle = () => repository.synchronize({ downloadFiles: false });
  return { ...server, idb, local, sync, session, repository, connectivity, emit, status, idle };
}

async function drain() {
  await vi.advanceTimersByTimeAsync(300);
  vi.useRealTimers();
}

describe('SK-04 vòng đời tài khoản và Realtime tài liệu', () => {
  it('tạo tài khoản tự đẩy mục cũ và upload tệp, không cần trang Tài liệu và không tải tệp server', async () => {
    const pending: SendKitItemData = {
      id: 'old',
      title: 'Tài liệu tối qua',
      text: 'Chữ cũ',
      project: null,
      order: 7,
      updatedAt: T0,
      files: [{ id: 'f1', name: 'anh.png', type: 'image/png', size: 3, blob: new Blob(['anh']) }],
    };
    const s = await setup([row('remote', { files: [remoteFile('server')] })], [pending]);
    await vi.waitFor(() =>
      expect(s.repository.getSnapshot().items.find((item) => item.id === 'old')?.pending).toBe(false),
    );
    expect(s.state.writes).toMatchObject([{ id: 'old', body: 'Chữ cũ', project: null, sort_order: 7 }]);
    expect(s.state.uploads).toHaveLength(1);
    expect(s.state.downloads).toHaveLength(0);
    expect(s.channels[0]).toMatchObject({
      name: 'crm-send-kit-u1',
      filter: { event: '*', schema: 'public', table: 'send_kit_items' },
    });
  });

  it('mất mạng rồi online, focus và quay lại từ nền đều đồng bộ ở cấp tài khoản', async () => {
    const s = await setup([], [], false);
    await s.repository.save({
      id: 'old',
      title: 'Chưa đẩy',
      text: '',
      project: null,
      order: 0,
      updatedAt: T0,
      files: [],
    });
    expect(s.fetcher).not.toHaveBeenCalled();
    s.connectivity.online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(s.repository.getSnapshot().items[0]?.pending).toBe(false));
    await s.idle();
    let reads = s.state.reads;
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(s.state.reads).toBe(reads + 1));
    await s.idle();
    reads = s.state.reads;
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.state.reads).toBe(reads);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(s.state.reads).toBe(reads + 1));
  });

  it('INSERT/UPDATE/xoá mềm của đồng nghiệp cập nhật snapshot, DELETE xác nhận ẩn mục và giữ blob', async () => {
    const s = await setup([row()]);
    await s.idle();
    s.state.rows.push(row('b', { owner_id: 'u2', project: null, files: [remoteFile('f1')] }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('b');
    await drain();
    await vi.waitFor(() => expect(s.repository.getSnapshot().items).toHaveLength(2));
    expect(s.repository.getSnapshot().items.find((item) => item.id === 'b')).toMatchObject({ ownerName: 'Nguyễn B' });
    await s.repository.ensureFiles(['b']);
    s.state.rows[0] = row('a', { title: 'Đã sửa', updated_at: new Date(T0 + 1000).toISOString() });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('a', 'UPDATE');
    await drain();
    await vi.waitFor(() => expect(s.repository.getSnapshot().items[0]?.title).toBe('Đã sửa'));
    s.state.rows[0] = row('a', {
      updated_at: new Date(T0 + 2000).toISOString(),
      deleted_at: new Date(T0 + 2000).toISOString(),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('a', 'UPDATE');
    await drain();
    await vi.waitFor(() => expect(s.repository.getSnapshot().items.map((item) => item.id)).toEqual(['b']));
    s.state.rows = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('b', 'DELETE');
    await drain();
    await vi.waitFor(() => expect(s.repository.getSnapshot().items).toHaveLength(0));
    const reopened = createSendKitRepository(s.sync, s.idb);
    disposals.push(reopened.dispose);
    expect(await reopened.list()).toHaveLength(0);
    const request = s.idb.open('crm_send_kit__u1', 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const saved = await new Promise<SendKitItemData>((resolve) => {
        const read = db.transaction('items').objectStore('items').get('b');
        read.onsuccess = () => resolve(read.result);
      });
      expect(saved.deletedAt).toBeTruthy();
      expect(saved.files[0]?.blob.size).toBe(3);
    } finally {
      db.close();
    }
    expect(s.state.writes).toHaveLength(0);
  });

  it('5 sự kiện liên tiếp chỉ tải lại danh sách một lần sau 300ms', async () => {
    const s = await setup();
    await s.idle();
    const reads = s.state.reads;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (let index = 0; index < 5; index++) {
      const id = `new-${index}`;
      s.state.rows.push(row(id));
      s.emit(id);
    }
    await vi.advanceTimersByTimeAsync(299);
    expect(s.state.reads).toBe(reads);
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(s.repository.getSnapshot().items).toHaveLength(5));
    expect(s.state.reads).toBe(reads + 1);
  });

  it('kênh lỗi không hiện lỗi; mỗi lần nối lại chỉ đồng bộ một lần, không hỏi server theo chu kỳ', async () => {
    const s = await setup();
    await s.idle();
    s.status('CHANNEL_ERROR');
    s.status('TIMED_OUT');
    expect(s.repository.getSnapshot()).toMatchObject({ loadError: '', syncError: '' });
    expect(s.sync.status.getSnapshot().error).toBeNull();
    const reads = s.state.reads;
    s.state.rows = [row('missed')];
    s.status('SUBSCRIBED');
    s.status('SUBSCRIBED');
    await vi.waitFor(() => expect(s.repository.getSnapshot().items[0]?.id).toBe('missed'));
    expect(s.state.reads).toBe(reads + 1);
    s.status('CLOSED');
    s.status('SUBSCRIBED');
    await vi.waitFor(() => expect(s.state.reads).toBe(reads + 2));
    await s.idle();
    const settled = s.state.reads;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.state.reads).toBe(settled);
  });

  it('thiếu hỗ trợ kênh vẫn đồng bộ khi mở app và online, không báo lỗi Realtime', async () => {
    const s = await setup();
    await s.idle();
    s.session.auth.callbacks.onAccount?.(null);
    vi.mocked(s.client.channel).mockImplementation(() => {
      throw new Error('Realtime chưa bật');
    });
    s.state.rows = [row('fallback')];
    s.session.auth.callbacks.onAccount?.(s.sync);
    const repository = s.session.getSnapshot()?.sendKit;
    await vi.waitFor(() => expect(repository?.getSnapshot().items[0]?.id).toBe('fallback'));
    expect(repository?.getSnapshot()).toMatchObject({ loadError: '', syncError: '' });
    s.state.rows.push(row('online'));
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(repository?.getSnapshot().items).toHaveLength(2));
  });

  it('chỉ tự tải tệp khi màn đang mở; mục Realtime mới cũng được tải; lúc gửi vẫn tải được', async () => {
    const s = await setup([row('a', { files: [remoteFile('f1')] })]);
    await s.idle();
    expect(s.state.downloads).toHaveLength(0);
    const stopFiles = s.repository.watchFiles();
    await s.idle();
    expect(s.state.downloads).toHaveLength(1);
    s.state.rows.push(row('b', { files: [remoteFile('f2')] }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('b');
    await drain();
    await vi.waitFor(() =>
      expect(s.repository.getSnapshot().items.find((item) => item.id === 'b')?.files[0]?.cached).toBe(true),
    );
    expect(s.state.downloads).toHaveLength(2);
    stopFiles();
    stopFiles();
    s.state.rows.push(row('c', { files: [remoteFile('f3')] }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('c');
    await drain();
    await vi.waitFor(() => expect(s.repository.getSnapshot().items).toHaveLength(3));
    expect(s.state.downloads).toHaveLength(2);
    expect((await s.repository.ensureFiles(['c']))[0]?.files[0]?.cached).toBe(true);
    expect(s.state.downloads).toHaveLength(3);
  });

  it('rời màn khi đang tải dừng các tệp kế tiếp', async () => {
    const s = await setup([row('a', { files: [remoteFile('f1'), remoteFile('f2')] })]);
    await s.idle();
    let finish = () => {};
    s.state.beforeDownload = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const stopFiles = s.repository.watchFiles();
    const flight = s.idle();
    await vi.waitFor(() => expect(s.state.downloads).toHaveLength(1));
    stopFiles();
    finish();
    await flight;
    expect(s.state.downloads).toHaveLength(1);
    expect(s.repository.getSnapshot().items[0]?.files[1]?.cached).toBe(false);
  });

  it('đổi tài khoản huỷ kênh, timer, lắng nghe cũ và bỏ kết quả đọc đang bay', async () => {
    const s = await setup([row()]);
    await s.idle();
    let finish = () => {};
    s.state.beforeRead = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const changed = vi.fn();
    s.repository.subscribe(changed);
    const beforeRead = s.state.reads;
    const flight = s.idle();
    await vi.waitFor(() => expect(s.state.reads).toBe(beforeRead + 1));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('late');
    const otherLocal = await LocalDB.open('u2', s.idb);
    disposals.push(() => otherLocal.close());
    s.session.auth.callbacks.onAccount?.(new CustomerSync(otherLocal, s.client, () => false));
    const reads = s.state.reads;
    s.emit('late', 'DELETE');
    s.status('SUBSCRIBED');
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await drain();
    finish();
    await flight;
    expect(s.state.reads).toBe(reads);
    expect(s.removeChannel).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(s.repository.getSnapshot().items.map((item) => item.id)).toEqual(['a']);
    expect(await s.session.getSnapshot()?.sendKit?.list()).toEqual([]);
    const oldCache = createSendKitRepository(s.sync, s.idb);
    disposals.push(oldCache.dispose);
    expect((await oldCache.list()).map((item) => item.id)).toEqual(['a']);
    s.session.dispose();
    expect(s.removeChannel).toHaveBeenCalledTimes(2);
  });

  it('đóng kho local bỏ sự kiện tới sau; demoMode không gọi server hoặc mở kênh', async () => {
    const s = await setup();
    await s.idle();
    s.local.close();
    const reads = s.state.reads;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.emit('late');
    s.status('SUBSCRIBED');
    await drain();
    expect(s.state.reads).toBe(reads);
    const demoServer = api();
    const local = await LocalDB.open('demo', new IDBFactory());
    const demo = createSendKitRepository(
      new CustomerSync(local, demoServer.client, () => true, true),
      new IDBFactory(),
    );
    disposals.push(demo.dispose, () => local.close());
    demo.start();
    await demo.synchronize();
    window.dispatchEvent(new Event('online'));
    expect(demoServer.fetcher).not.toHaveBeenCalled();
    expect(demoServer.client.channel).not.toHaveBeenCalled();
  });
});
