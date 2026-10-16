// @vitest-environment node
/// <reference types="node" />
// T2.A2 — IndexedDB + hàng đợi v2 tương thích 2 chiều với v1 (legacy/js/db.js chạy thật trên fake-indexeddb).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LEGACY_IMPORTED_KEY, migrateLegacy, openUserDB, readPreviousUserId } from '@/data/legacyImport';
import {
  DB_NAME,
  DB_VERSION,
  dbNameFor,
  LOCAL_CHANGED,
  LocalDB,
  openNamedDB,
  ReadOnlyError,
  SCOPE_CHANGED,
  sameRecord,
} from '@/data/localdb';
import {
  type AssignmentRollback,
  type CustomerRemote,
  clearQueue,
  flushQueue,
  type QueueOp,
  queueAdd,
  queueGetAll,
} from '@/data/queue';
import type { Customer } from '@/domain/customer';
import { type Call, fakeSupabase, loadV1Db, rawAll, rawPut } from './v1db';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'legacy-customers.json');
const fixtureRows = (JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { customers: Customer[] }).customers;

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rowsOf = (owner: string) =>
  fixtureRows.map((r) => ({ ...r, id: `${owner.slice(0, 4)}-${r.id}`, owner_id: owner }));

/** Remote giả cho v2 (cùng dạng lời gọi với fakeSupabase của v1 để so sánh). */
function fakeRemote(fail: (call: Call, i: number) => { code?: string; message?: string } | null = () => null) {
  const calls: Call[] = [];
  const done = (call: Call) => {
    calls.push(call);
    return Promise.resolve({ error: fail(call, calls.length - 1) });
  };
  const remote: CustomerRemote = {
    upsert: (p) => done(['upsert', p]),
    update: (id, p) => done(['update', id, p]),
    delete: (id) => done(['delete', id]),
  };
  return { remote, calls };
}

/** Lời gọi server mong đợi cho 1 danh sách op (insert → upsert, update → patch theo id, delete). */
const expectedCalls = (ops: QueueOp[]): Call[] =>
  ops.map((op) =>
    op.type === 'insert'
      ? ['upsert', op.payload]
      : op.type === 'update'
        ? ['update', op.recordId, op.payload]
        : ['delete', op.recordId],
  );

const settle = () => new Promise((r) => setTimeout(r, 20));

/** v1 tạo DB của tài khoản A + ghi khách/op bằng chính API v1 (offline → op nằm chờ). */
async function v1Seed(idb: IDBFactory) {
  const v1 = loadV1Db(idb);
  await v1.CRM.init(null, A);
  const created = await v1.CRM.create({ full_name: 'Khách Tạo Ở V1', phone: '0900000001', care_stage: 'Đăng kí mới' });
  await v1.CRM.update(created.id, { care_stage: 'Đang tiếp cận' });
  await v1.CRM.addTask(created.id, 'Gọi lại', { due: '2026-12-02T02:00:00.000Z' }, 'call');
  await v1.CRM.addNote(created.id, 'Thích tầng cao');
  const gone = await v1.CRM.create({ full_name: 'Khách Xoá', phone: '0900000002' });
  await v1.CRM.remove(gone.id);
  await settle(); // v1 gọi flushQueue() không await sau mỗi lần ghi — chờ xong trước khi đóng phiên
  v1.CRM.suspend();
  await rawPut(idb, dbNameFor(A), 'customers', rowsOf(A)); // + toàn bộ fixture (bản ghi bẩn, thuộc tính lạ)
  return v1;
}

describe('DB do v1 tạo → v2 mở nguyên vẹn', () => {
  it('cùng tên DB, version, store; mọi bản ghi + op giữ nguyên từng byte', async () => {
    const idb = new IDBFactory();
    await v1Seed(idb);
    const name = dbNameFor(A);
    const rawRecords = await rawAll(idb, name, 'customers');
    const rawOps = await rawAll(idb, name, 'queue');
    expect(rawOps.length).toBe(6); // insert, update, addTask, addNote, insert, delete

    const ldb = await openUserDB(A, { idb, previousUserId: A });
    expect(ldb.db.name).toBe(`crm_khach_hang__${encodeURIComponent(A)}`);
    expect(ldb.db.version).toBe(DB_VERSION);
    expect([...ldb.db.objectStoreNames].sort()).toEqual(['customers', 'meta', 'queue']);
    expect(await ldb.getAll()).toStrictEqual(rawRecords);
    expect(await queueGetAll(ldb)).toStrictEqual(rawOps);
    ldb.close();
    // v2 mở không làm đổi gì
    expect(await rawAll(idb, name, 'customers')).toStrictEqual(rawRecords);
  });

  it('op v1 trong hàng đợi được v2 flush đúng thứ tự, đúng dạng (upsert / patch / delete)', async () => {
    const idb = new IDBFactory();
    await v1Seed(idb);
    const ldb = await openUserDB(A, { idb, previousUserId: A });
    const ops = await queueGetAll(ldb);
    const { remote, calls } = fakeRemote();
    const res = await flushQueue(ldb, remote);
    expect(res).toStrictEqual({ synced: 6, pending: 0, error: null, assignError: null });
    expect(calls).toStrictEqual(expectedCalls(ops));
    expect(calls.map((c) => c[0])).toEqual(['upsert', 'update', 'update', 'update', 'upsert', 'delete']);
    ldb.close();
  });

  it('v1 và v2 flush cùng 1 hàng đợi → cùng chuỗi lời gọi server', async () => {
    const idb1 = new IDBFactory();
    const idb2 = new IDBFactory();
    await v1Seed(idb1);
    // Chép y hệt DB của idb1 sang idb2 (cùng op, cùng opId)
    const ops = await rawAll(idb1, dbNameFor(A), 'queue');
    const ldb2 = await LocalDB.open(A, idb2);
    ldb2.close();
    await rawPut(idb2, dbNameFor(A), 'queue', ops);

    const v1 = loadV1Db(idb1);
    v1.navigator.onLine = true;
    const sb = fakeSupabase();
    await v1.CRM.init(sb, A);
    await v1.CRM.flushQueue();
    v1.CRM.suspend();

    const ldb = await LocalDB.open(A, idb2);
    const { remote, calls } = fakeRemote();
    await flushQueue(ldb, remote);
    ldb.close();
    expect(calls).toStrictEqual(JSON.parse(JSON.stringify(sb.calls)));
  });
});

describe('op do v2 ghi → v1 đọc + flush được', () => {
  it('v1 thấy bản ghi v2, đẩy đúng op v2 lên server', async () => {
    const idb = new IDBFactory();
    const ldb = await openUserDB(A, { idb });
    const rec = { ...rowsOf(A)[7], x_v2_only: { kept: true } } as Customer;
    await ldb.put(rec);
    const now = '2026-12-01T03:00:00.000Z';
    const v2ops: Omit<QueueOp, 'opId'>[] = [
      { type: 'insert', recordId: rec.id, payload: rec, ts: now },
      {
        type: 'update',
        recordId: rec.id,
        payload: { notes_manual: [{ text: 'v2', at: now }], updated_at: now },
        ts: now,
      },
      { type: 'delete', recordId: 'khach-khac', ts: now },
    ];
    for (const op of v2ops) await queueAdd(ldb, op);
    const stored = await queueGetAll(ldb);
    ldb.close();

    const v1 = loadV1Db(idb);
    const sb = fakeSupabase();
    await v1.CRM.init(sb, A);
    expect(JSON.parse(JSON.stringify(await v1.CRM.list()))).toStrictEqual([rec]);
    expect(await v1.CRM.pendingCount()).toBe(3);
    v1.navigator.onLine = true;
    const res = await v1.CRM.flushQueue();
    expect(res.synced).toBe(3);
    expect(JSON.parse(JSON.stringify(sb.calls))).toStrictEqual(expectedCalls(stored));
    v1.CRM.suspend();
  });
});

describe('xử lý lỗi khi flush = v1', () => {
  const now = '2026-12-01T03:00:00.000Z';
  const ops: Omit<QueueOp, 'opId'>[] = [
    { type: 'insert', recordId: 'r1', payload: { id: 'r1' }, ts: now }, // trùng → bỏ
    { type: 'update', recordId: 'r2', payload: { owner_id: B, updated_at: now }, ts: now }, // giao khách bị từ chối → bỏ
    { type: 'update', recordId: 'r3', payload: { notes: 'x' }, ts: now }, // lỗi mạng → dừng, giữ
    { type: 'delete', recordId: 'r4', ts: now }, // chưa tới lượt
  ];
  const fail = (_c: Call, i: number) =>
    i === 0
      ? { code: '23505', message: 'duplicate key' }
      : i === 1
        ? { code: '42501', message: 'Không có quyền' }
        : i === 2
          ? { message: 'Failed to fetch' }
          : null;

  it('v2 và v1 cho cùng kết quả: bỏ insert trùng, bỏ giao khách lỗi, dừng ở lỗi khác', async () => {
    const idb2 = new IDBFactory();
    const ldb = await openUserDB(A, { idb: idb2 });
    for (const op of ops) await queueAdd(ldb, op);
    const { remote, calls } = fakeRemote(fail);
    const res = await flushQueue(ldb, remote);
    expect(calls.length).toBe(3);
    expect(res.synced).toBe(0);
    expect(res.pending).toBe(2);
    expect(res.assignError).toBe('Không có quyền');
    expect(res.error).toStrictEqual({
      opId: 3,
      type: 'update',
      recordId: 'r3',
      message: 'Failed to fetch',
      code: null,
    });
    expect((await queueGetAll(ldb)).map((o) => o.recordId)).toEqual(['r3', 'r4']);
    ldb.close();

    const idb1 = new IDBFactory();
    const l1 = await openUserDB(A, { idb: idb1 });
    for (const op of ops) await queueAdd(l1, op);
    l1.close();
    const v1 = loadV1Db(idb1);
    v1.navigator.onLine = true;
    const sb = fakeSupabase(fail);
    await v1.CRM.init(sb, A);
    const r1 = await v1.CRM.flushQueue();
    expect(JSON.parse(JSON.stringify(r1))).toStrictEqual({
      synced: res.synced,
      pending: res.pending,
      error: res.error,
    });
    expect(v1.CRM.takeAssignError()).toBe(res.assignError);
    expect(JSON.parse(JSON.stringify(sb.calls))).toStrictEqual(calls);
    v1.CRM.suspend();
  });

  it('assign lỗi trùng SĐT → thông báo như v1', async () => {
    const ldb = await openUserDB(A, { idb: new IDBFactory() });
    await queueAdd(ldb, { type: 'update', recordId: 'r', payload: { owner_id: B }, ts: now });
    const { remote } = fakeRemote(() => ({ code: '23505', message: 'duplicate key' }));
    const res = await flushQueue(ldb, remote);
    expect(res.assignError).toBe('Không giao được: người nhận đã có khách trùng số điện thoại trong danh sách của họ');
    expect(res.pending).toBe(0);
    ldb.close();
  });

  it.each([
    { code: '23505', label: 'trùng SĐT' },
    { code: '42501', label: 'server từ chối quyền' },
  ])('assignment bị $label thì rollback field cũ nguyên tử và giữ stage/field lạ', async ({ code }) => {
    const ldb = await openUserDB(A, { idb: new IDBFactory() });
    const opAt = '2026-10-16T12:00:00.000Z';
    const old = {
      id: 'assign-rejected',
      phone: '0900000001',
      full_name: 'Khách cũ',
      owner_id: A,
      followers: ['watcher'],
      updated_at: 'before-assignment',
      care_stage: 'Booking & Làm hồ sơ',
      care_stage_updated_at: 'sla-original',
      care_stage_history: [{ stage: 'Booking & Làm hồ sơ', at: 'history-original', x_history: true }],
      notes_manual: [{ text: 'ghi chú cũ', at: 'note-old', x_note: 9 }],
      x_future: { preserve: true },
    } as Customer;
    const assignmentNote = { text: 'Giao cho người nhận', at: opAt };
    await ldb.put({
      ...old,
      owner_id: B,
      followers: [A],
      updated_at: opAt,
      notes_manual: [assignmentNote, ...(old.notes_manual ?? [])],
    });
    const rollback: AssignmentRollback = {
      owner_id: { present: true, value: A },
      followers: { present: true, value: ['watcher'] },
      updated_at: { present: true, value: 'before-assignment' },
      notes_manual: { present: true, value: old.notes_manual },
    };
    await queueAdd(ldb, {
      type: 'update',
      recordId: old.id,
      payload: { owner_id: B, followers: [A], updated_at: opAt },
      ts: opAt,
      assignmentRollback: rollback,
    });
    const { remote } = fakeRemote(() => ({ code, message: 'server refused assignment' }));
    const result = await flushQueue(ldb, remote);
    expect(result.pending).toBe(0);
    expect(await queueGetAll(ldb)).toEqual([]);
    expect(await ldb.get(old.id)).toEqual(old);
    expect(result.assignError).toBe(
      code === '23505'
        ? 'Không giao được: người nhận đã có khách trùng số điện thoại trong danh sách của họ'
        : 'server refused assignment',
    );
    ldb.close();
  });

  it('assignment rollback preserves a later local edit, timestamp, note, and extension fields', async () => {
    const ldb = await openUserDB(A, { idb: new IDBFactory() });
    const assignmentAt = '2026-10-16T12:00:00.000Z';
    const editedAt = '2026-10-16T12:01:00.000Z';
    const assignmentNote = { text: 'Giao cho người nhận', at: assignmentAt };
    const edited = {
      id: 'assign-later-edit',
      phone: '0900000002',
      full_name: 'Khách đã sửa',
      owner_id: B,
      followers: [A],
      updated_at: editedAt,
      notes_manual: [assignmentNote, { text: 'ghi chú sau giao', at: editedAt, x_kept: true }],
      x_future: { preserve: true },
    } as Customer;
    await ldb.put(edited);
    await queueAdd(ldb, {
      type: 'update',
      recordId: edited.id,
      payload: { owner_id: B, followers: [A], updated_at: assignmentAt },
      ts: assignmentAt,
      assignmentRollback: {
        owner_id: { present: true, value: A },
        followers: { present: true, value: ['watcher'] },
        updated_at: { present: true, value: 'before-assignment' },
        notes_manual: { present: true, value: [] },
      },
    });
    const { remote } = fakeRemote(() => ({ code: '23505', message: 'duplicate key' }));
    await flushQueue(ldb, remote);
    expect(await ldb.get(edited.id)).toEqual({
      ...edited,
      owner_id: A,
      followers: ['watcher'],
    });
    ldb.close();
  });

  it('chỉ 1 lượt flush chạy cùng lúc; clearQueue bỏ hết op', async () => {
    const ldb = await openUserDB(A, { idb: new IDBFactory() });
    await queueAdd(ldb, { type: 'delete', recordId: 'r', ts: now });
    const { remote, calls } = fakeRemote();
    const [x, y] = [flushQueue(ldb, remote), flushQueue(ldb, remote)];
    expect(x).toBe(y);
    await x;
    expect(calls.length).toBe(1);
    await queueAdd(ldb, { type: 'delete', recordId: 'r', ts: now });
    expect(await clearQueue(ldb)).toBe(1);
    expect(await queueGetAll(ldb)).toEqual([]);
    ldb.close();
  });
});

describe('đổi tài khoản không lẫn dữ liệu', () => {
  it('mỗi tài khoản 1 DB; phiên cũ đóng thì mọi thao tác bị từ chối', async () => {
    const idb = new IDBFactory();
    const a = await openUserDB(A, { idb });
    await a.put(rowsOf(A)[0] as Customer);
    await queueAdd(a, { type: 'delete', recordId: 'x', ts: 't' });
    a.close();
    const b = await openUserDB(B, { idb });
    expect(await b.getAll()).toEqual([]);
    expect(await queueGetAll(b)).toEqual([]);
    await expect(a.getAll()).rejects.toThrow(SCOPE_CHANGED);
    await expect(a.put(rowsOf(A)[1] as Customer)).rejects.toThrow(SCOPE_CHANGED);
    b.close();
    // v1 mở tài khoản A thấy đúng dữ liệu của A
    const v1 = loadV1Db(idb);
    await v1.CRM.init(null, A);
    expect((await v1.CRM.list()).length).toBe(1);
    expect(await v1.CRM.pendingCount()).toBe(1);
    v1.CRM.suspend();
  });

  it('đổi tài khoản giữa lúc flush → dừng, không xoá op nào sau đó', async () => {
    const idb = new IDBFactory();
    const ldb = await openUserDB(A, { idb });
    for (const id of ['r1', 'r2', 'r3']) await queueAdd(ldb, { type: 'delete', recordId: id, ts: 't' });
    const calls: string[] = [];
    const remote: CustomerRemote = {
      upsert: async () => ({ error: null }),
      update: async () => ({ error: null }),
      delete: async (id) => {
        calls.push(id);
        if (id === 'r2') ldb.close(); // người dùng đăng xuất / đổi tài khoản
        return { error: null };
      },
    };
    const res = await flushQueue(ldb, remote);
    expect(calls).toEqual(['r1', 'r2']);
    expect(res).toMatchObject({ synced: 1, pending: 0 });
    const again = await LocalDB.open(A, idb);
    expect((await queueGetAll(again)).map((o) => o.recordId)).toEqual(['r2', 'r3']);
    again.close();
  });
});

describe('nhập DB gốc crm_khach_hang (1 lần) = v1', () => {
  async function seedRoot(idb: IDBFactory) {
    const root = await openNamedDB(DB_NAME, idb);
    root.close();
    await rawPut(idb, DB_NAME, 'customers', [
      { id: 'a1', owner_id: A, full_name: 'A1', phone: '1', x_odd: [1] },
      { id: 'b1', owner_id: B, full_name: 'B1', phone: '2' },
    ]);
    await rawPut(idb, DB_NAME, 'queue', [
      { opId: 1, type: 'insert', recordId: 'a1', payload: { id: 'a1', owner_id: A }, ts: 't1' },
      { opId: 2, type: 'insert', recordId: 'b1', payload: { id: 'b1', owner_id: B }, ts: 't2' },
      { opId: 3, type: 'update', recordId: 'a1', payload: { notes: 'x' }, ts: 't3', x_extra: 1 },
      { opId: 4, type: 'update', recordId: 'b1', payload: { notes: 'y' }, ts: 't4' },
      { opId: 5, type: 'delete', recordId: 'khong-ro', ts: 't5' },
    ]);
  }

  for (const prev of [A, B, null]) {
    it(`người dùng trước = ${prev === A ? 'chính A' : prev === B ? 'B' : 'không rõ'}`, async () => {
      const idb2 = new IDBFactory();
      await seedRoot(idb2);
      const ldb = await openUserDB(A, { idb: idb2, previousUserId: prev });
      const v2 = { records: await ldb.getAll(), ops: await queueGetAll(ldb) };
      expect(await ldb.getMeta(LEGACY_IMPORTED_KEY)).toBeTruthy();
      // Nhập 1 lần: mở lại không nhập thêm
      ldb.close();
      const again = await openUserDB(A, { idb: idb2, previousUserId: prev });
      expect((await queueGetAll(again)).length).toBe(v2.ops.length);
      again.close();

      const idb1 = new IDBFactory();
      await seedRoot(idb1);
      const v1 = loadV1Db(idb1);
      if (prev) v1.localStorage.set('crm_last_user', JSON.stringify({ id: prev, email: 'x@y' }));
      await v1.CRM.init(null, A);
      v1.CRM.suspend();
      expect(v2.records).toStrictEqual(await rawAll(idb1, dbNameFor(A), 'customers'));
      expect(v2.ops).toStrictEqual(await rawAll(idb1, dbNameFor(A), 'queue'));
      expect(v2.records.map((r) => r.id)).toEqual(['a1']);
      // DB gốc không bị đụng
      expect((await rawAll(idb2, DB_NAME, 'queue')).length).toBe(5);
    });
  }

  it('v1 đã nhập (cờ legacy-imported) → v2 không nhập lại', async () => {
    const idb = new IDBFactory();
    await seedRoot(idb);
    const v1 = loadV1Db(idb);
    await v1.CRM.init(null, A);
    v1.CRM.suspend();
    const before = await rawAll(idb, dbNameFor(A), 'queue');
    const ldb = await LocalDB.open(A, idb);
    await migrateLegacy(ldb, A, idb);
    expect(await queueGetAll(ldb)).toStrictEqual(before);
    ldb.close();
  });

  it('readPreviousUserId đọc localStorage như v1, hỏng → null', () => {
    const s = (v: string | null) => ({ getItem: () => v });
    expect(readPreviousUserId(s(JSON.stringify({ id: A, email: 'e' })))).toBe(A);
    expect(readPreviousUserId(s('{hỏng'))).toBeNull();
    expect(readPreviousUserId(s(null))).toBeNull();
    expect(readPreviousUserId(null)).toBeNull();
  });
});

describe('localdb: replaceAll, assertWritable, sameRecord', () => {
  it('replaceAll từ chối khi còn op chờ hoặc local đổi trong lúc kéo', async () => {
    const ldb = await openUserDB(A, { idb: new IDBFactory() });
    const rows = rowsOf(A) as Customer[];
    const rev = ldb.revision;
    await ldb.put(rows[0] as Customer);
    await expect(ldb.replaceAll(rows, rev)).rejects.toThrow(LOCAL_CHANGED);
    await queueAdd(ldb, { type: 'delete', recordId: 'x', ts: 't' });
    await expect(ldb.replaceAll(rows)).rejects.toThrow(LOCAL_CHANGED);
    expect((await ldb.getAll()).length).toBe(1);
    await clearQueue(ldb);
    await ldb.replaceAll(rows);
    expect(await ldb.getAll()).toStrictEqual([...rows].sort((a, b) => a.id.localeCompare(b.id)));
    ldb.close();
  });

  it('assertWritable chặn khách đồng nghiệp phụ trách (D-003)', async () => {
    const ldb = await openUserDB(A, { idb: new IDBFactory() });
    await ldb.put({ ...rowsOf(B)[0], id: 'cua-b' } as Customer);
    await ldb.put({ ...rowsOf(A)[0], id: 'cua-a' } as Customer);
    await expect(ldb.assertWritable('cua-b')).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(ldb.assertWritable('cua-a')).resolves.toBeUndefined();
    await expect(ldb.assertWritable('chua-co')).resolves.toBeUndefined();
    ldb.close();
  });

  it('sameRecord = v1 (bỏ qua khác cách viết giờ, null ≡ thiếu)', () => {
    const v1 = loadV1Db(new IDBFactory());
    const pairs: [Record<string, unknown> | null, Record<string, unknown> | null][] = [
      [{ a: '2026-12-01T03:00:00.000Z' }, { a: '2026-12-01T03:00:00+00:00' }],
      [{ a: '2026-12-01T03:00:00.000Z' }, { a: '2026-12-01T03:00:01+00:00' }],
      [{ a: null }, {}],
      [{ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }],
      [{ a: [1] }, { a: [2] }],
      [null, null],
      [{ a: 1 }, null],
    ];
    for (const [x, y] of pairs) {
      expect(sameRecord(x, y)).toBe(v1.run(`sameRecord(${JSON.stringify(x)}, ${JSON.stringify(y)})`));
    }
  });
});
