// @vitest-environment node
// biome-ignore-all lint/suspicious/noExplicitAny: Fake PostgREST rows are untyped JSON like production.
// T5.9 / D-021: gộp cột mảng khi đẩy op + op bị server từ chối không chặn hàng đợi.
import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { mergeArray } from '@/data/arrayMerge';
import { LocalDB } from '@/data/localdb';
import { flushQueue, isPermanentError, queueGetAll } from '@/data/queue';
import { CustomerRepository } from '@/data/repositories/customers';
import { customerRemote } from '@/data/supabase';
import { CustomerSync } from '@/data/sync';

const UID = 'account-a';
const clean = (v: unknown) => JSON.parse(JSON.stringify(v));

/** PostgREST giả đủ cho customerRemote (read/updateIf/update/upsert) và applyRemote (select * maybeSingle). */
function fakeServer(seed: Record<string, any>[]) {
  const rows: Record<string, any> = Object.fromEntries(seed.map((r) => [r.id, clean(r)]));
  let clock = 0;
  const hooks: {
    beforeUpdate?: (id: string) => void;
    fail?: (payload: any) => { code: string; message: string } | null;
  } = {};
  const writes: any[] = [];
  const pick = (row: any, cols: string) =>
    cols === '*' ? clean(row) : Object.fromEntries(cols.split(',').map((c) => [c, clean(row[c] ?? null)]));
  const client = {
    from: () => ({
      select: (cols: string) => {
        const q: any = {
          eq: (_k: string, id: string) => {
            q.id = id;
            return q;
          },
          maybeSingle: async () => ({ data: rows[q.id] ? pick(rows[q.id], cols) : null, error: null }),
        };
        return q;
      },
      update: (payload: any) => {
        const filters: [string, unknown][] = [];
        const run = async (returning: boolean) => {
          const id = filters.find(([k]) => k === 'id')?.[1] as string;
          hooks.beforeUpdate?.(id);
          const error = hooks.fail?.(payload) ?? null;
          if (error) return { data: null, error };
          const row = rows[id];
          const ok = row && filters.every(([k, v]) => (v === null ? row[k] == null : row[k] === v));
          if (ok) {
            // Trigger customers_set_updated: server tự đặt updated_at mới cho mỗi lần ghi.
            rows[id] = {
              ...row,
              ...clean(payload),
              updated_at: `2026-12-01T04:00:${String(++clock).padStart(2, '0')}+00:00`,
            };
            writes.push({ id, payload: clean(payload) });
          }
          return { data: returning ? (ok ? [{ id }] : []) : null, error: null };
        };
        const builder: any = {
          eq: (k: string, v: unknown) => {
            filters.push([k, v]);
            return builder;
          },
          is: (k: string, v: unknown) => {
            filters.push([k, v]);
            return builder;
          },
          select: () => run(true),
          // biome-ignore lint/suspicious/noThenProperty: emulate PostgREST PromiseLike builder.
          then: (resolve: any, reject: any) => run(false).then(resolve, reject),
        };
        return builder;
      },
      upsert: async (payload: any) => {
        rows[payload.id] = clean(payload);
        return { error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
  return { rows, hooks, writes, client: client as unknown as SupabaseClient };
}

const seedRow = () => ({
  id: 'c1',
  owner_id: UID,
  phone: '0900000000',
  full_name: 'Khách thử',
  updated_at: '2026-12-01T03:00:00+00:00',
  care_stage: 'Đang tiếp cận',
  notes_manual: [{ text: 'Ghi chú cũ', at: '2026-11-01T00:00:00.000Z', extension: { kept: true } }],
  next_tasks: [],
  care_stage_history: [{ stage: 'Đang tiếp cận', note: null, at: '2026-11-01T00:00:00.000Z' }],
  x_future: { kept: true },
});

/** 1 thiết bị = 1 IndexedDB riêng + repository + cờ online bật/tắt được. */
async function device(server: ReturnType<typeof fakeServer>, rows: Record<string, any>[] = [seedRow()]) {
  const local = await LocalDB.open(UID, new IDBFactory());
  for (const row of rows) await local.put(clean(row));
  const state = { online: false };
  const sync = new CustomerSync(local, server.client, () => state.online);
  const repo = new CustomerRepository(sync);
  return {
    local,
    sync,
    repo,
    async goOnline() {
      state.online = true;
      return sync.flushQueue();
    },
    goOffline() {
      state.online = false;
    },
  };
}

describe('mergeArray — gộp 3 chiều theo danh tính phần tử', () => {
  const n = (at: string, text: string, extra: object = {}) => ({ at, text, ...extra });

  it('hai máy cùng thêm → giữ cả hai, xếp theo `at` như mảng đang xếp (mới lên đầu / nối cuối)', () => {
    const base = [n('1', 'cũ')];
    expect(mergeArray(base, [n('3', 'máy này'), n('1', 'cũ')], [n('2', 'máy khác'), n('1', 'cũ')])).toEqual([
      n('3', 'máy này'),
      n('2', 'máy khác'),
      n('1', 'cũ'),
    ]);
    expect(mergeArray(base, [n('1', 'cũ'), n('3', 'máy này')], [n('1', 'cũ'), n('2', 'máy khác')])).toEqual([
      n('1', 'cũ'),
      n('2', 'máy khác'),
      n('3', 'máy này'),
    ]);
  });

  it('mảng không xếp theo `at` → chèn ngay sau phần tử đứng trước nó trên server', () => {
    const base = [n('5', 'a'), n('1', 'b'), n('4', 'c')];
    expect(mergeArray(base, base, [n('5', 'a'), n('9', 'khác'), n('1', 'b'), n('4', 'c')])).toEqual([
      n('5', 'a'),
      n('9', 'khác'),
      n('1', 'b'),
      n('4', 'c'),
    ]);
  });

  it('local sửa thuộc tính → lấy local; thuộc tính khác lấy server (kể cả thuộc tính lạ máy khác thêm)', () => {
    const base = [n('1', 'cũ', { done: false })];
    const local = [n('1', 'local sửa', { done: false })];
    const server = [n('1', 'cũ', { done: true, x_server: 1 })];
    expect(mergeArray(base, local, server)).toEqual([n('1', 'local sửa', { done: true, x_server: 1 })]);
  });

  it('local xoá thuộc tính (mở lại việc) → thuộc tính bị xoá trên kết quả', () => {
    const base = [{ at: '1', text: 'việc', done_at: 'x', log_at: 'x' }];
    expect(
      mergeArray(base, [{ at: '1', text: 'việc' }], [{ at: '1', text: 'việc', done_at: 'x', log_at: 'x' }]),
    ).toEqual([{ at: '1', text: 'việc' }]);
  });

  it('local cố ý bỏ phần tử → KHÔNG sống lại; máy khác thêm vẫn giữ', () => {
    const base = [n('1', 'a'), n('2', 'b')];
    expect(mergeArray(base, [n('1', 'a')], [n('1', 'a'), n('2', 'b'), n('9', 'khác')])).toEqual([
      n('1', 'a'),
      n('9', 'khác'),
    ]);
  });

  it('máy khác đã bỏ phần tử: local không sửa → bỏ theo; local có sửa → giữ bản local', () => {
    const base = [n('1', 'a'), n('2', 'b')];
    expect(mergeArray(base, [n('1', 'a'), n('2', 'b')], [n('2', 'b')])).toEqual([n('2', 'b')]);
    expect(mergeArray(base, [n('1', 'a sửa'), n('2', 'b')], [n('2', 'b')])).toEqual([n('1', 'a sửa'), n('2', 'b')]);
  });

  it('dùng `id` khi có (interests/household), không thì `at`', () => {
    const base = [{ id: 'i1', at: '1', status: 'open' }];
    const local = [{ id: 'i1', at: '1', status: 'won' }];
    const server = [
      { id: 'i1', at: '1', status: 'open' },
      { id: 'i2', at: '1', status: 'open' },
    ];
    expect(mergeArray(base, local, server)).toEqual([
      { id: 'i1', at: '1', status: 'won' },
      { id: 'i2', at: '1', status: 'open' },
    ]);
  });

  it('op không có bản gốc (op v1 / op cũ) → hợp nhất, không bỏ phần tử nào', () => {
    expect(
      mergeArray(undefined, [n('1', 'local'), n('3', 'mới')], [n('1', 'server', { x: 1 }), n('2', 'khác')]),
    ).toEqual([n('1', 'local', { x: 1 }), n('2', 'khác'), n('3', 'mới')]);
  });

  it('server null/không phải mảng → coi như rỗng', () => {
    expect(mergeArray([], [n('1', 'a')], null)).toEqual([n('1', 'a')]);
  });
});

describe('2 thiết bị cùng sửa 1 khách (kịch bản T5.2 E2)', () => {
  it('Mac online thêm ghi chú, điện thoại offline thêm ghi chú rồi online → server còn đủ cả hai', async () => {
    const server = fakeServer([seedRow()]);
    const mac = await device(server);
    const phone = await device(server);
    await mac.goOnline();
    await mac.repo.addNote('c1', 'Ghi chú của Mac');
    await mac.sync.flushQueue();
    expect(server.rows.c1.notes_manual.map((x: any) => x.text)).toEqual(['Ghi chú của Mac', 'Ghi chú cũ']);

    await new Promise((r) => setTimeout(r, 2)); // `at` khác mili-giây với ghi chú Mac
    await phone.repo.addNote('c1', 'Ghi chú của điện thoại');
    const op = (await queueGetAll(phone.local))[0] as any;
    expect(op.arrayBase?.notes_manual).toEqual(seedRow().notes_manual); // bản gốc = local trước khi sửa
    expect(op.payload).not.toHaveProperty('arrayBase'); // metadata chỉ ở máy
    const result = await phone.goOnline();
    expect(result).toMatchObject({ synced: 1, pending: 0, error: null, merged: ['c1'] });
    const texts = server.rows.c1.notes_manual.map((x: any) => x.text).sort();
    expect(texts).toEqual(['Ghi chú cũ', 'Ghi chú của Mac', 'Ghi chú của điện thoại'].sort());
    // Thuộc tính lạ của phần tử + của hàng được giữ (D-012 §3.1.3).
    expect(server.rows.c1.notes_manual.find((x: any) => x.text === 'Ghi chú cũ').extension).toEqual({ kept: true });
    expect(server.rows.c1.x_future).toEqual({ kept: true });
    // Cache điện thoại được tải lại từ server → thấy ghi chú của Mac.
    expect((await phone.local.get('c1'))?.notes_manual).toEqual(server.rows.c1.notes_manual);
    // Payload gửi lên là patch theo trường: chỉ notes_manual + updated_at.
    expect(Object.keys(server.writes.at(-1).payload).sort()).toEqual(['notes_manual', 'updated_at']);
    mac.local.close();
    phone.local.close();
  });

  it('sửa nội dung ghi chú offline + máy khác thêm ghi chú → giữ cả sửa lẫn ghi chú mới', async () => {
    const server = fakeServer([seedRow()]);
    const mac = await device(server);
    const phone = await device(server);
    await mac.goOnline();
    await mac.repo.addNote('c1', 'Mac thêm');
    await mac.sync.flushQueue();

    await phone.repo.updateNote('c1', '2026-11-01T00:00:00.000Z', 'Điện thoại sửa ghi chú cũ');
    await phone.goOnline();
    expect(server.rows.c1.notes_manual).toEqual([
      expect.objectContaining({ text: 'Mac thêm' }),
      { text: 'Điện thoại sửa ghi chú cũ', at: '2026-11-01T00:00:00.000Z', extension: { kept: true } },
    ]);
    mac.local.close();
    phone.local.close();
  });

  it('hai máy cùng thêm việc + cuộc gọi offline → server đủ mọi phần tử của mọi cột mảng', async () => {
    const server = fakeServer([seedRow()]);
    const mac = await device(server);
    const phone = await device(server);
    const tick = () => new Promise((r) => setTimeout(r, 2)); // `at` = danh tính → 2 máy khác mili-giây
    await mac.repo.addTask('c1', 'Việc của Mac');
    await mac.repo.logCall('c1', { at: '2026-12-01T01:00:00.000Z', result: 'talked', origin: 'mac' });
    await tick();
    await phone.repo.addTask('c1', 'Việc của điện thoại');
    await phone.repo.logCall('c1', { at: '2026-12-01T02:00:00.000Z', result: 'no_answer', origin: 'phone' });
    await mac.goOnline();
    await phone.goOnline();
    expect(server.rows.c1.next_tasks.map((t: any) => t.text).sort()).toEqual(['Việc của Mac', 'Việc của điện thoại']);
    expect(server.rows.c1.call_attempts.map((a: any) => a.origin).sort()).toEqual(['mac', 'phone']);
    mac.local.close();
    phone.local.close();
  });

  it('phần tử máy này cố ý bỏ (mở lại việc xoá mốc lịch sử) không sống lại; mốc máy khác thêm vẫn còn', async () => {
    const server = fakeServer([seedRow()]);
    const mac = await device(server);
    const phone = await device(server);
    await mac.goOnline();
    await mac.repo.addTask('c1', 'Gửi bảng giá');
    const taskAt = (await mac.local.get('c1'))?.next_tasks?.[0]?.at as string;
    await new Promise((r) => setTimeout(r, 2)); // mốc `at` khác nhau
    await mac.repo.completeTask('c1', taskAt);
    await mac.sync.flushQueue();
    const logAt = server.rows.c1.next_tasks[0].log_at;
    expect(server.rows.c1.care_stage_history.some((h: any) => h.at === logAt)).toBe(true);
    // Điện thoại tải bản server, rồi ghi 1 mốc chăm sóc.
    await phone.local.put(clean(server.rows.c1));
    await phone.goOnline();
    await new Promise((r) => setTimeout(r, 2));
    await phone.repo.addCareLog('c1', 'Điện thoại ghi chăm sóc');
    await phone.sync.flushQueue();

    mac.goOffline(); // Mac chưa thấy mốc của điện thoại
    await mac.repo.reopenTask('c1', taskAt);
    await mac.goOnline();
    const history = server.rows.c1.care_stage_history;
    expect(history.some((h: any) => h.at === logAt)).toBe(false); // không sống lại
    expect(history.some((h: any) => h.note === 'Điện thoại ghi chăm sóc')).toBe(true);
    expect(server.rows.c1.next_tasks[0]).not.toHaveProperty('done_at');
    mac.local.close();
    phone.local.close();
  });

  it('máy khác ghi chen giữa lúc đọc và ghi → ghi có điều kiện thất bại, đọc lại và gộp lần nữa', async () => {
    const server = fakeServer([seedRow()]);
    const phone = await device(server);
    await phone.repo.addNote('c1', 'Điện thoại');
    let raced = false;
    server.hooks.beforeUpdate = (id) => {
      if (raced) return;
      raced = true;
      const row = server.rows[id];
      server.rows[id] = {
        ...row,
        notes_manual: [{ text: 'Chen giữa', at: '2026-12-01T03:30:00.000Z' }, ...row.notes_manual],
        updated_at: '2026-12-01T03:30:00+00:00',
      };
    };
    await phone.goOnline();
    expect(server.rows.c1.notes_manual.map((x: any) => x.text).sort()).toEqual(
      ['Chen giữa', 'Điện thoại', 'Ghi chú cũ'].sort(),
    );
    expect(server.writes).toHaveLength(1);
    phone.local.close();
  });

  it('remote không hỗ trợ đọc (adapter cũ) → ghi như v1, không lỗi', async () => {
    const server = fakeServer([seedRow()]);
    const phone = await device(server);
    await phone.repo.addNote('c1', 'x');
    const full = customerRemote(server.client);
    const result = await flushQueue(phone.local, { upsert: full.upsert, update: full.update, delete: full.delete });
    expect(result).toEqual({ synced: 1, pending: 0, error: null, assignError: null });
    phone.local.close();
  });
});

describe('op bị server từ chối vĩnh viễn', () => {
  const CHECK = {
    code: '23514',
    message: 'new row for relation "customers" violates check constraint "customers_care_stage_check"',
  };

  it('phân loại: ràng buộc/quyền/cột = vĩnh viễn; mạng/5xx/hết phiên = tạm thời', () => {
    for (const code of ['23514', '23502', '22007', '42501', '42703', 'PGRST204'])
      expect(isPermanentError({ code })).toBe(true);
    for (const e of [{ message: 'Failed to fetch' }, { code: '' }, { code: '57014' }, { code: 'PGRST301' }, null])
      expect(isPermanentError(e as any)).toBe(false);
  });

  it('23514 không chặn khách khác; op sau cùng khách chờ; người dùng bỏ → đẩy tiếp và local về giá trị server', async () => {
    const server = fakeServer([seedRow(), { ...seedRow(), id: 'c2' }]);
    server.hooks.fail = (payload) => (payload.care_stage === 'Bậc không hợp lệ' ? CHECK : null);
    const phone = await device(server, [seedRow(), { ...seedRow(), id: 'c2' }]);
    await phone.repo.update('c1', { care_stage: 'Bậc không hợp lệ' });
    await phone.repo.addNote('c1', 'Ghi chú sau thao tác lỗi');
    await phone.repo.addNote('c2', 'Khách khác');

    const first = await phone.goOnline();
    expect(first.synced).toBe(1); // c2 vẫn lên
    expect(first.pending).toBe(2);
    expect(first.error).toBeNull();
    expect(first.rejected).toEqual([expect.objectContaining({ recordId: 'c1', code: '23514' })]);
    expect(server.rows.c2.notes_manual[0].text).toBe('Khách khác');
    expect(phone.sync.status.getSnapshot().rejected).toHaveLength(1);
    // Thử lại tự động vẫn bị từ chối, không mất op.
    expect((await phone.sync.flushQueue()).pending).toBe(2);

    const rejectedOpId = first.rejected?.[0]?.opId as number;
    const dropped = await phone.sync.discardRejected(rejectedOpId);
    expect(dropped?.payload).toMatchObject({ care_stage: 'Bậc không hợp lệ' });
    // Bản sao op đã bỏ vẫn còn trong máy (khôi phục tay được) — không âm thầm mất.
    const log = await phone.local.getMeta<{ ops: any[] }>('discarded-ops');
    expect(log?.ops).toEqual([expect.objectContaining({ opId: rejectedOpId, discarded_at: expect.any(String) })]);
    expect(await queueGetAll(phone.local)).toEqual([]);
    expect(phone.sync.status.getSnapshot().rejected).toEqual([]);
    expect(server.rows.c1.care_stage).toBe('Đang tiếp cận');
    expect(server.rows.c1.notes_manual[0].text).toBe('Ghi chú sau thao tác lỗi');
    // Local quay về giá trị server (bậc cũ) + giữ ghi chú đã lên.
    const local = await phone.local.get('c1');
    expect(local?.care_stage).toBe('Đang tiếp cận');
    expect(local?.notes_manual?.[0]?.text).toBe('Ghi chú sau thao tác lỗi');
    phone.local.close();
  });

  it('lỗi tạm thời (mạng) vẫn dừng hàng đợi và thử lại như cũ, không vào danh sách bỏ', async () => {
    const server = fakeServer([seedRow()]);
    const phone = await device(server);
    await phone.repo.update('c1', { full_name: 'Tên mới' });
    server.hooks.fail = () => ({ code: '', message: 'Failed to fetch' });
    const result = await phone.goOnline();
    expect(result.error).toMatchObject({ message: 'Failed to fetch' });
    expect(result.rejected).toBeUndefined();
    server.hooks.fail = undefined;
    expect(await phone.sync.flushQueue()).toMatchObject({ synced: 1, pending: 0, error: null });
    expect(server.rows.c1.full_name).toBe('Tên mới');
    phone.local.close();
  });
});
