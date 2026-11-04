import { Blob as NodeBlob } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canEditSendKitItem,
  createSendKitRepository,
  mergeSendKitItems,
  SEND_KIT_LOAD_ERROR,
  type SendKitItemData,
  type SendKitRow,
  sendKitFileError,
} from '@/data/repositories/sendKit';
import type { CustomerSync } from '@/data/sync';

const T0 = Date.parse('2026-11-04T03:00:00Z');
const T1 = T0 + 5 * 60_000;
const blob = () => new NodeBlob(['anh'], { type: 'image/png' }) as unknown as Blob;
const item = (id = 'a', extra: Partial<SendKitItemData> = {}): SendKitItemData => ({
  id,
  title: 'Bảng giá A',
  text: 'Chào {ten}',
  project: 'A',
  order: 7,
  updatedAt: T0,
  files: [{ id: 'f1', name: 'anh.png', type: 'image/png', size: 3, blob: blob(), future: 'giữ' }],
  ...extra,
});
const row = (id = 'a', extra: Partial<SendKitRow> = {}): SendKitRow => ({
  id,
  owner_id: 'u1',
  title: 'Bản trên server',
  body: 'Chữ',
  project: 'A',
  sort_order: 7,
  created_at: new Date(T0).toISOString(),
  updated_at: new Date(T0).toISOString(),
  deleted_at: null,
  files: [{ id: 'f1', name: 'anh.png', type: 'image/png', size: 3, path: `u1/${id}/f1.png`, future: 'giữ' }],
  ...extra,
});

function api(initial: SendKitRow[] = []) {
  const state = {
    rows: structuredClone(initial),
    readError: false,
    writeError: false,
    uploadError: false,
    downloadError: false,
    members: [{ user_id: 'u1', full_name: 'Nguyễn A', is_admin: false }],
    events: [] as string[],
    writes: [] as SendKitRow[],
    beforeWrite: null as (() => void | Promise<void>) | null,
  };
  const respond = (data: unknown, status = 200, count?: number) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json',
        ...(count === undefined ? {} : { 'content-range': `0-0/${count}` }),
      },
    });
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname.endsWith('/rpc/team_list')) return respond(state.members);
    if (url.pathname.includes('/storage/v1/object/')) {
      state.events.push(`${method} ${url.pathname}`);
      if (method === 'POST')
        return state.uploadError ? respond({ message: 'Upload lỗi' }, 500) : respond({ Key: 'ok' });
      return state.downloadError
        ? respond({ message: 'Tải lỗi' }, 500)
        : new Response('anh', { headers: { 'content-type': 'image/png' } });
    }
    if (!url.pathname.endsWith('/send_kit_items')) throw new Error(`API ngoài phạm vi: ${url.pathname}`);
    if (method !== 'GET') {
      state.events.push(method);
      const payload = JSON.parse(String(init?.body)) as SendKitRow;
      state.writes.push(payload);
      await state.beforeWrite?.();
      if (state.writeError) return respond({ message: 'Lỗi ghi' }, 500);
      const previous = state.rows.find((entry) => entry.id === payload.id);
      if (method === 'POST' && previous) return respond([]);
      if (method === 'PATCH' && (!previous || Date.parse(previous.updated_at) > Date.parse(payload.updated_at)))
        return respond([]);
      state.rows = [...state.rows.filter((entry) => entry.id !== payload.id), payload];
      return respond([payload]);
    }
    if (state.readError) return respond({ message: 'Lỗi đọc' }, 500);
    const id = url.searchParams.get('id');
    const rows = state.rows
      .filter((entry) => !id || (id.startsWith('eq.') ? entry.id === id.slice(3) : entry.id > id.slice(3)))
      .sort((a, b) => a.id.localeCompare(b.id));
    return respond(rows, 200, rows.length);
  });
  const client = createClient('http://127.0.0.1:54321', 'sk03-fake-public-key', {
    global: { fetch: fetcher },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { state, client, fetcher };
}

async function setup(initial: SendKitRow[] = [], legacy: SendKitItemData[] = [], userId = 'u1') {
  const server = api(initial);
  const idb = new IDBFactory();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(`crm_send_kit__${userId}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction('items', 'readwrite');
    for (const entry of legacy) tx.objectStore('items').put(entry);
    tx.oncomplete = () => resolve();
  });
  db.close();
  const connectivity = { online: true, closed: false };
  const sync = {
    client: server.client,
    demoMode: false,
    isOnline: () => connectivity.online,
    local: {
      userId,
      get isClosed() {
        return connectivity.closed;
      },
      assertOpen() {
        if (connectivity.closed) throw new Error('Phiên đã đóng');
      },
    },
  } as unknown as CustomerSync;
  const repository = createSendKitRepository(sync, idb);
  return { ...server, repository, idb, connectivity, sync };
}

afterEach(() => localStorage.clear());

describe('SK-03 gộp và quyền', () => {
  it('LWW: bản máy 10:05 thắng server 10:00, bản server 10:05 thắng máy 10:00', () => {
    const newer = item('a', { updatedAt: T1, pending: true });
    expect(mergeSendKitItems([newer], [row()], 'u1')[0]).toMatchObject({
      title: newer.title,
      updatedAt: T1,
      pending: true,
    });
    expect(mergeSendKitItems([item()], [row('a', { updated_at: new Date(T1).toISOString() })], 'u1')[0]).toMatchObject({
      title: 'Bản trên server',
      updatedAt: T1,
      pending: false,
    });
  });
  it('đọc lỗi/vắng mục không xoá dữ liệu, mục cũ được nhận đúng chủ và đánh dấu chờ', () => {
    for (const remote of [undefined, []]) {
      const merged = mergeSendKitItems([item()], remote, 'u1');
      expect(merged[0]).toMatchObject({
        id: 'a',
        text: 'Chào {ten}',
        project: 'A',
        order: 7,
        ownerId: 'u1',
        pending: true,
      });
      expect(merged[0]?.files[0]?.blob).toBeInstanceOf(NodeBlob);
    }
  });
  it('xoá mềm được gộp, giữ cache tệp và thuộc tính JSONB lạ', () => {
    const deleted_at = new Date(T1).toISOString();
    const merged = mergeSendKitItems([item()], [row('a', { deleted_at, updated_at: deleted_at })], 'u1');
    expect(merged[0]).toMatchObject({ deletedAt: deleted_at, pending: false });
    expect(merged[0]?.files[0]).toMatchObject({ cached: true, future: 'giữ' });
    expect(merged[0]?.files[0]?.blob).toBeInstanceOf(NodeBlob);
  });
  it('thành viên chỉ sửa mục mình; trưởng nhóm sửa được mục đồng nghiệp', () => {
    expect(canEditSendKitItem(item(), 'u1')).toBe(true);
    expect(canEditSendKitItem(item('a', { ownerId: 'u1' }), 'u1')).toBe(true);
    expect(canEditSendKitItem(item('a', { ownerId: 'u2' }), 'u1')).toBe(false);
    expect(canEditSendKitItem(item('a', { ownerId: 'u2' }), 'u1', true)).toBe(true);
  });
  it('giới hạn 50MB và chỉ ảnh/PDF/video', () => {
    expect(sendKitFileError({ name: 'lon.pdf', type: 'application/pdf', size: 51 * 1024 * 1024 })).toBe(
      'lon.pdf quá 50MB — nén lại rồi đăng',
    );
    expect(sendKitFileError({ name: 'du.pdf', type: 'application/pdf', size: 50 * 1024 * 1024 })).toBeNull();
    expect(sendKitFileError({ name: 'x.txt', type: 'text/plain', size: 1 })).toContain('chỉ thêm ảnh, PDF hoặc video');
  });
});

describe('SK-03 repository local-first', () => {
  it('máy thứ hai có cache trống thấy đủ 5 mục cũ, 3 mục có tệp và gửi đủ 2 ảnh khi offline', async () => {
    const legacy = Array.from({ length: 5 }, (_, index) =>
      item(`m${index}`, {
        order: index,
        files:
          index === 0
            ? [...item().files, { id: 'f2', name: 'anh-2.png', type: 'image/png', size: 3, blob: blob() }]
            : index < 3
              ? item().files
              : [],
      }),
    );
    const { repository, sync, connectivity } = await setup([], legacy);
    await repository.synchronize();
    const mac = createSendKitRepository(sync, new IDBFactory());
    expect(await mac.list()).toHaveLength(0);
    await mac.synchronize();
    expect(mac.getSnapshot().items).toHaveLength(5);
    expect(mac.getSnapshot().items.filter((entry) => entry.files.length)).toHaveLength(3);
    connectivity.online = false;
    const chosen = await mac.ensureFiles(['m0']);
    expect(chosen[0]?.files.map((file) => [file.name, file.blob.size])).toEqual([
      ['anh.png', 3],
      ['anh-2.png', 3],
    ]);
  });

  it('cùng chuyển dữ liệu cũ: hàng cũ vừa được máy khác INSERT không chặn bản mới hơn', async () => {
    const { repository, state } = await setup([], [item('a', { updatedAt: T1, files: [] })]);
    state.beforeWrite = () => {
      state.beforeWrite = null;
      state.rows = [row('a', { files: [] })];
    };
    await repository.synchronize();
    expect(state.rows[0]).toMatchObject({ title: 'Bảng giá A', updated_at: new Date(T1).toISOString() });
    expect(repository.getSnapshot().items[0]?.pending).toBe(false);
    expect(state.events).toEqual(['POST', 'PATCH']);
  });

  it('chuyển 2 mục cũ: giữ id/chữ/dự án/thứ tự/tệp; upload trước upsert từng hàng', async () => {
    const { repository, state } = await setup([], [item(), item('b', { files: [], order: 9 })]);
    expect(await repository.list()).toHaveLength(2);
    await repository.synchronize();
    expect(state.writes.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(state.writes[0]).toMatchObject({
      id: 'a',
      owner_id: 'u1',
      body: 'Chào {ten}',
      project: 'A',
      sort_order: 7,
      files: [{ path: 'u1/a/f1.png', future: 'giữ' }],
    });
    expect(state.events[0]).toContain('/send-kit/u1/a/f1.png');
    expect(state.events.slice(1)).toEqual(['POST', 'POST']);
    expect(repository.getSnapshot().items.every((entry) => entry.pending === false)).toBe(true);
  });
  it('lỗi 500 giữ mục trên máy và báo dòng lỗi; lần sau đọc được thì hết lỗi', async () => {
    const { repository, state } = await setup([], [item()]);
    await repository.list();
    state.readError = true;
    await repository.synchronize();
    expect(repository.getSnapshot().items[0]?.title).toBe('Bảng giá A');
    expect(repository.getSnapshot().loadError).toBe(SEND_KIT_LOAD_ERROR);
    expect(state.writes).toHaveLength(0);
    state.readError = false;
    await repository.synchronize();
    expect(repository.getSnapshot().loadError).toBe('');
  });
  it('ghi hàng lỗi giữ pending và Blob; thử lại không upload lại tệp đã có', async () => {
    const { repository, state } = await setup([], [item()]);
    state.writeError = true;
    await repository.synchronize();
    expect(repository.getSnapshot().items[0]).toMatchObject({ pending: true, files: [{ path: 'u1/a/f1.png' }] });
    state.writeError = false;
    await repository.synchronize();
    expect(repository.getSnapshot().items[0]?.pending).toBe(false);
    expect(state.events.filter((event) => event.includes('/storage/'))).toHaveLength(1);
  });
  it('upload lỗi không ghi hàng tham chiếu tới tệp chưa có', async () => {
    const { repository, state } = await setup([], [item()]);
    state.uploadError = true;
    await repository.synchronize();
    expect(state.writes).toHaveLength(0);
    expect(repository.getSnapshot().items[0]?.pending).toBe(true);
  });
  it('server mới hơn không bị đẩy ngược; ghi có điều kiện chặn xung đột phát sinh lúc upload', async () => {
    const { repository, state } = await setup([row()], [item('a', { updatedAt: T1, pending: true })]);
    state.beforeWrite = () => {
      state.rows[0] = row('a', { title: 'Máy khác vừa sửa', updated_at: new Date(T1 + 1).toISOString() });
    };
    await repository.synchronize();
    expect(state.rows[0]?.title).toBe('Máy khác vừa sửa');
    expect(repository.getSnapshot().items[0]).toMatchObject({ title: 'Máy khác vừa sửa', pending: false });
  });
  it('không mất chỉnh sửa/xoá trên máy trong khi đang chờ server xác nhận', async () => {
    const { repository, state, connectivity } = await setup([], [item('a', { files: [] })]);
    state.beforeWrite = async () => {
      connectivity.online = false;
      await repository.remove('a');
    };
    await repository.synchronize();
    expect(repository.getSnapshot().items).toHaveLength(0);
    state.beforeWrite = null;
    connectivity.online = true;
    await repository.synchronize();
    expect(state.rows[0]?.deleted_at).toBeTruthy();
    expect(repository.getSnapshot().items).toHaveLength(0);
  });
  it('đồng nghiệp có tên, gửi được tệp; cấm save/remove/reorder cả khi giả owner trong input', async () => {
    const { repository, state } = await setup([row('a', { owner_id: 'u2' })]);
    state.members.push({ user_id: 'u2', full_name: 'Nguyễn B', is_admin: false });
    await repository.synchronize();
    const peer = repository.getSnapshot().items[0];
    expect(peer).toMatchObject({ ownerId: 'u2', ownerName: 'Nguyễn B', pending: false });
    if (!peer) throw new Error('Thiếu tài liệu đồng nghiệp');
    expect(repository.canEdit(peer)).toBe(false);
    await expect(repository.save({ ...peer, ownerId: 'u1' })).rejects.toThrow('Chỉ người tạo');
    await expect(repository.remove(peer.id)).rejects.toThrow('Chỉ người tạo');
    await expect(repository.reorder([{ ...peer, order: 99 }])).rejects.toThrow('Chỉ người tạo');
    expect((await repository.ensureFiles(['a']))[0]?.files[0]?.cached).toBe(true);
    expect(state.writes).toHaveLength(0);
  });
  it('admin thêm tệp vào mục đồng nghiệp: thư mục chủ gốc, UPDATE có điều kiện', async () => {
    const { repository, state, connectivity } = await setup([row('a', { owner_id: 'u2', files: [] })]);
    state.members[0] = { user_id: 'u1', full_name: 'Trưởng nhóm', is_admin: true };
    await repository.synchronize();
    connectivity.online = false;
    const peer = repository.getSnapshot().items[0];
    if (!peer) throw new Error('Thiếu tài liệu đồng nghiệp');
    await repository.save({ ...peer, files: item().files });
    connectivity.online = true;
    await repository.synchronize();
    expect(state.writes[0]).toMatchObject({ owner_id: 'u2', files: [{ path: 'u2/a/f1.png' }] });
    expect(state.events).toContain('PATCH');
    expect(state.events).not.toContain('POST');
  });
  it('tệp được cache theo tài khoản, mở lại offline vẫn gửi; thiếu tệp thì báo, không gửi thiếu', async () => {
    const { repository, sync, idb, state, connectivity } = await setup([row()]);
    await repository.synchronize();
    connectivity.online = false;
    const reopened = createSendKitRepository(sync, idb);
    const chosen = await reopened.ensureFiles(['a']);
    expect(chosen[0]?.files[0]?.blob.size).toBe(3);
    const failing = await setup([row()]);
    failing.state.downloadError = true;
    await failing.repository.synchronize();
    failing.connectivity.online = false;
    await expect(failing.repository.ensureFiles(['a'])).rejects.toThrow('chưa có trên máy');
    const isolated = createSendKitRepository({ ...sync, local: { ...sync.local, userId: 'u2' } } as CustomerSync, idb);
    expect(await isolated.list()).toHaveLength(0);
    expect(state.events.filter((event) => event.startsWith('GET'))).toHaveLength(1);
  });
  it('chế độ mẫu tuyệt đối không gọi server', async () => {
    const { sync, idb, fetcher } = await setup([], [item()]);
    const repository = createSendKitRepository({ ...sync, demoMode: true } as CustomerSync, idb);
    await repository.list();
    await repository.synchronize();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('đổi tài khoản trong lúc tải không ghi kết quả vào cache đã đóng', async () => {
    const { repository, state, connectivity } = await setup([], [item('a', { files: [] })]);
    state.beforeWrite = () => {
      connectivity.closed = true;
    };
    await repository.synchronize();
    expect(repository.getSnapshot().items[0]?.pending).toBe(true);
  });
});
