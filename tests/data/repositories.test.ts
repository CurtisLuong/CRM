// @vitest-environment node
// biome-ignore-all lint/suspicious/noExplicitAny: Real untyped v1 API is the independent parity oracle.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { queueGetAll } from '@/data/queue';
import { CustomerRepository } from '@/data/repositories/customers';
import { CustomerSync } from '@/data/sync';
import { loadV1Db } from './v1db';

const UID = 'account-a',
  ID = 'customer';
const NOW = '2026-12-01T03:00:00.000Z';
const clean = (value: any) => JSON.parse(JSON.stringify(value));
const fixtures = JSON.parse(
  fs.readFileSync(new URL('../fixtures/legacy-customers.json', import.meta.url), 'utf8'),
).customers;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());
async function pair() {
  const v1 = loadV1Db(new IDBFactory());
  await v1.CRM.init(null, UID);
  const local = await LocalDB.open(UID, new IDBFactory());
  const repo = new CustomerRepository(new CustomerSync(local, {} as SupabaseClient, () => false));
  return {
    v1,
    repo,
    local,
    async equal() {
      expect(clean(await repo.list({ includeArchived: true }))).toEqual(clean(await v1.CRM.list()));
      const left = clean(await queueGetAll(local));
      const right = clean(await v1.run('queueGetAll()'));
      expect(left).toEqual(right);
    },
  };
}
describe('repository operations match real v1 payloads and local records', () => {
  it('all CRUD/note/task/history methods, including no-ops, rewind and metadata', async () => {
    const p = await pair();
    const operations: [string, any[]][] = [
      [
        'create',
        [{ id: ID, phone: '0900000000', full_name: 'Trường', x_future: { kept: true }, care_stage: 'Đăng kí mới' }],
      ],
      ['addNote', [ID, '  ghi chú  ']],
      ['updateNote', [ID, NOW, 'sửa']],
      ['addTask', [ID, 'Hẹn gọi', { due: '2026-12-02T03:00:00.000Z', due_allday: true }, 'call']],
      ['updateTask', [ID, NOW, 'sửa việc', null, 'visit']],
      ['completeTask', [ID, NOW]],
      ['completeTask', [ID, NOW]],
      ['reopenTask', [ID, NOW]],
      ['reopenTask', [ID, NOW]],
      ['addCareLog', [ID, 'ghi lịch sử']],
      ['updateCareHistoryNote', [ID, NOW, 'sửa lịch sử']],
      [
        'update',
        [ID, { care_stage: 'Đang tiếp cận' }, { historyMeta: { auto: 'sla', x_unknown: 1 }, careStageNote: 'chuyển' }],
      ],
      ['update', [ID, { care_stage: 'Đang tiếp cận' }, { forceLog: true, historyMeta: { x: 2 } }]],
      ['update', [ID, { care_stage: 'Đăng kí mới' }, { rewind: true, keepStages: ['Đăng kí mới'] }]],
      ['update', [ID, { care_stage: 'Đang tiếp cận' }, { rewind: true, keepStages: ['Đăng kí mới'] }]],
      ['update', [ID, { apt_floor: '12' }]],
      ['deleteNote', [ID, NOW]],
      ['deleteTask', [ID, NOW]],
      ['updateNote', [ID, 'missing', 'x']],
      ['updateTask', [ID, 'missing', 'x']],
      ['addNote', [ID, ' ']],
      ['addTask', [ID, ' ']],
    ];
    for (const [name, args] of operations) {
      await p.v1.CRM[name](...args);
      await (p.repo as any)[name](...args);
      await p.equal();
      vi.setSystemTime(Date.now() + 1000);
    }
    expect((await p.repo.get(ID))?.x_future).toEqual({ kept: true });
    p.local.close();
    p.v1.CRM.suspend();
  });
  it('retains all unknown fixture properties while editing nested JSONB', async () => {
    const p = await pair();
    for (const source of fixtures) {
      const row = { ...source, id: source.id, owner_id: UID };
      await p.local.put(row);
      await p.v1.run(`localPut(${JSON.stringify(row)})`);
    }
    for (const row of await p.local.list()) {
      const ops: [string, any[]][] = [
        ['addNote', [row.id, 'new']],
        ['addTask', [row.id, 'new']],
        ['update', [row.id, { apt_floor: '12' }]],
      ];
      for (const n of row.notes_manual ?? []) if (n?.at) ops.push(['updateNote', [row.id, n.at, 'edited']]);
      for (const t of row.next_tasks ?? [])
        if (t?.at)
          ops.push(
            ['updateTask', [row.id, t.at, 'edited', null]],
            ['completeTask', [row.id, t.at]],
            ['reopenTask', [row.id, t.at]],
          );
      for (const h of row.care_stage_history ?? [])
        if (h?.at) ops.push(['updateCareHistoryNote', [row.id, h.at, 'edited']]);
      for (const [method, args] of ops) {
        await p.v1.CRM[method](...args);
        await (p.repo as any)[method](...args);
        await p.equal();
      }
    }
    p.local.close();
    p.v1.CRM.suspend();
  });
  it('logCall compares to v1 calls.js patch assembly, preserves existing unknown attempt properties', async () => {
    const p = await pair();
    const row = {
      id: ID,
      phone: '0',
      full_name: 'Hưởng',
      owner_id: UID,
      care_stage: 'Đang tiếp cận',
      qualified_at: NOW,
      call_attempts: [{ at: NOW, result: null, x_meta: { sim: 2 } }],
      care_stage_history: [{ at: 'old', stage: 'Đăng kí mới', x_history: 3 }],
    };
    await p.local.put(row);
    await p.v1.run(`localPut(${JSON.stringify(row)})`);
    const attempt = { at: NOW, result: 'talked', note: 'x', duration: 30, origin: 'manual' };
    const payload = {
      call_attempts: row.call_attempts.map((a) => ({ ...a, ...attempt })),
      care_stage: row.care_stage,
      next_call_at: null,
      next_call_end: null,
      next_call_reason: null,
    };
    const opts = { forceLog: true, careStageNote: '📞 gọi', historyMeta: { x_event: 'manual' } };
    await p.v1.CRM.update(ID, payload, opts);
    await p.repo.logCall(ID, attempt, {
      ...opts,
      editAt: NOW,
      patch: { care_stage: row.care_stage, next_call_at: null, next_call_end: null, next_call_reason: null },
    });
    await p.equal();
    p.local.close();
    p.v1.CRM.suspend();
  });
  it('assignment is queue-compatible and ordinary removal archives rather than deleting', async () => {
    const p = await pair();
    await p.repo.create({ id: ID, phone: '0', full_name: 'Ngữ' });
    await p.v1.CRM.create({ id: ID, phone: '0', full_name: 'Ngữ' });
    await p.repo.assign(ID, 'other', [UID]);
    await p.v1.CRM.update(ID, { owner_id: 'other', followers: [UID] }, { assign: true });
    expect(clean(await p.repo.list({ includeArchived: true }))).toEqual(clean(await p.v1.CRM.list()));
    const v2Ops = clean(await queueGetAll(p.local)).map(({ assignmentRollback: _rollback, ...op }: any) => op);
    expect(v2Ops).toEqual(clean(await p.v1.run('queueGetAll()')));
    expect((await queueGetAll(p.local)).at(-1)?.assignmentRollback).toMatchObject({
      owner_id: { present: true, value: UID },
      followers: { present: false },
    });
    await expect(p.repo.addNote(ID, 'bad')).rejects.toMatchObject({ code: 'READ_ONLY' });
    await p.repo.assign(ID, UID);
    await p.repo.remove(ID);
    expect(await p.repo.list()).toEqual([]);
    expect((await p.repo.get(ID))?.archived_at).toBe(NOW);
    expect((await queueGetAll(p.local)).at(-1)).toMatchObject({
      type: 'update',
      payload: { archived_at: NOW, updated_at: NOW },
    });
    await p.repo.restore(ID);
    expect(await p.repo.list()).toHaveLength(1);
    p.local.close();
    p.v1.CRM.suspend();
  });

  it('assignment logs a timeline note without changing stage, SLA history, or unknown customer data', async () => {
    const p = await pair();
    const row = {
      id: ID,
      phone: '0900000000',
      full_name: 'Hưởng',
      owner_id: UID,
      followers: ['watcher'],
      care_stage: 'Booking & Làm hồ sơ',
      care_stage_updated_at: 'sla-original',
      care_stage_history: [{ stage: 'Booking & Làm hồ sơ', at: 'history-original', x_history: true }],
      notes_manual: [{ text: 'ghi chú cũ', at: 'note-old', x_note: 9 }],
      x_future: { preserve: true },
    };
    await p.local.put(row);
    await p.repo.update(
      ID,
      { owner_id: 'other', followers: [UID, 'watcher'] },
      { assign: true, assignmentNote: 'Giao cho đồng nghiệp. Hẹn thứ 7' },
    );
    expect(await p.local.get(ID)).toMatchObject({
      owner_id: 'other',
      followers: [UID, 'watcher'],
      care_stage: 'Booking & Làm hồ sơ',
      care_stage_updated_at: 'sla-original',
      care_stage_history: row.care_stage_history,
      notes_manual: [{ text: 'Giao cho đồng nghiệp. Hẹn thứ 7', at: NOW }, ...row.notes_manual],
      x_future: row.x_future,
    });
    const op = (await queueGetAll(p.local)).at(-1);
    expect(op?.payload).not.toHaveProperty('care_stage');
    expect(op?.payload).not.toHaveProperty('care_stage_history');
    expect(op?.payload).toHaveProperty('notes_manual');

    await p.local.put({
      id: 'missing-stage',
      phone: '1',
      full_name: 'Mới',
      owner_id: UID,
      x_future: { keep: 1 },
    } as any);
    await p.repo.update('missing-stage', { owner_id: 'other', followers: [UID] }, { assign: true });
    expect(await p.local.get('missing-stage')).not.toHaveProperty('care_stage');
    expect(await p.local.get('missing-stage')).toHaveProperty('x_future', { keep: 1 });
    p.local.close();
    p.v1.CRM.suspend();
  });
});
describe('transaction durability and races', () => {
  it('merges two owned customers atomically, queues patch updates, archives the duplicate, and rejects cross-owner writes', async () => {
    const p = await pair();
    await p.local.put({
      id: 'keeper',
      owner_id: UID,
      phone: '0912345678',
      full_name: 'Nguyễn Thị Mai',
      source: ['facebook_ads'],
      notes_manual: [{ at: 'a', text: 'Giữ', extension: true }],
      future_json: { preserved: true },
    } as any);
    await p.local.put({
      id: 'duplicate',
      owner_id: UID,
      phone: '+84 912 345 678',
      full_name: 'Nguyen Thi Mai',
      source: 'referral',
      notes_manual: [{ at: 'b', text: 'Nối' }],
      care_stage_history: [{ stage: 'Booking', at: NOW, provenance: 'import' }],
    } as any);
    const merged = await p.repo.merge('keeper', 'duplicate');
    expect(merged.keeper).toMatchObject({
      source: ['facebook_ads', 'referral'],
      notes_manual: [
        { at: 'a', text: 'Giữ', extension: true },
        { at: 'b', text: 'Nối' },
      ],
      future_json: { preserved: true },
    });
    expect(merged.duplicate.archived_at).toBe(NOW);
    const ops = await queueGetAll(p.local);
    expect(ops).toHaveLength(2);
    expect(ops.find((op) => op.recordId === 'keeper')?.payload).toHaveProperty('notes_manual');
    expect(ops.find((op) => op.recordId === 'duplicate')?.payload).toEqual({ archived_at: NOW, updated_at: NOW });

    await p.local.put({ id: 'foreign', owner_id: 'another-owner', phone: '0900000000', full_name: 'Khác' } as any);
    const before = await p.local.getAll();
    await expect(p.repo.merge('keeper', 'foreign')).rejects.toThrow('Cần kết nối mạng để xác minh quyền trưởng nhóm');
    expect(await p.local.getAll()).toEqual(before);
    p.local.close();
    p.v1.CRM.suspend();
  });

  it('queue failure rolls back customer mutation, including create', async () => {
    const p = await pair();
    await p.repo.create({ id: ID, phone: '0', full_name: 'Tự' });
    const before = await p.local.getAll();
    const queue = await queueGetAll(p.local);
    const original = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      if (this.name === 'queue') throw new Error('disk full');
      return original.apply(this, args);
    });
    await expect(p.repo.update(ID, { full_name: 'lost' })).rejects.toThrow('disk full');
    await expect(p.repo.create({ id: 'rollback', phone: '1', full_name: 'lost' })).rejects.toThrow('disk full');
    expect(await p.local.getAll()).toEqual(before);
    expect(await queueGetAll(p.local)).toEqual(queue);
    vi.restoreAllMocks();
    p.local.close();
    p.v1.CRM.suspend();
  });
  it('concurrent repositories read fresh records inside the same transaction', async () => {
    const p = await pair();
    await p.repo.create({ id: ID, phone: '0', full_name: 'Đường' });
    const second = new CustomerRepository(p.repo.sync);
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? p.repo : second).addNote(ID, `note ${i}`)));
    expect((await p.repo.get(ID))?.notes_manual).toHaveLength(12);
    expect(await queueGetAll(p.local)).toHaveLength(13);
    const revision = p.local.revision;
    await p.repo.update(ID, { apt_floor: '7' });
    expect(p.local.revision).toBeGreaterThan(revision);
    p.local.close();
    await expect(p.repo.update(ID, { apt_floor: '8' })).rejects.toThrow('Phiên dữ liệu');
    p.v1.CRM.suspend();
  });
});

it('logCall matches a payload produced by executing actual legacy CRMCalls.ingest', async () => {
  const { loadV1 } = createRequire(import.meta.url)('../legacy-harness/load-v1.js');
  const harness = loadV1({ now: NOW });
  const p = await pair();
  const row = {
    id: ID,
    phone: '0900000000',
    full_name: 'Trường',
    owner_id: UID,
    call_attempts: [{ at: '2026-11-01T00:00:00.000Z', result: 'busy', x_device: { sim: 2 } }],
  };
  await p.local.put(row);
  await p.v1.run(`localPut(${JSON.stringify(row)})`);
  harness.ctx.__rows = [row];
  harness.ctx.__capture = [];
  harness.run(
    `allCustomers=__rows;currentUser={id:'${UID}'};CRM.update=async(id,payload,opts)=>__capture.push({id,payload,opts});refreshList=async()=>{};`,
  );
  await harness.run(
    `CRMCalls.ingest([{id:'device-1',number:'0900000000',startedAt:'${NOW}',durationSec:35,direction:'out'}])`,
  );
  const captured = clean(harness.ctx.__capture);
  expect(captured).toHaveLength(1);
  await p.v1.CRM.update(ID, captured[0].payload, captured[0].opts);
  await p.repo.logCall(ID, captured[0].payload.call_attempts.at(-1));
  await p.equal();
  p.local.close();
  p.v1.CRM.suspend();
});
