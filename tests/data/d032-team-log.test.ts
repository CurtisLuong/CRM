// @vitest-environment node
// D-032 (Curtis 2026-11-06): khách đã giao (người giao vẫn theo dõi) / khách nhóm — người đang thấy khách được
// ghi giùm kết quả cuộc gọi, tương tác, ghi chú. Bậc/lịch gọi lại/loại chỉ đổi kèm cuộc gọi được ghi.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDB, STORE_CUSTOMERS } from '@/data/localdb';
import { queueGetAll } from '@/data/queue';
import { CustomerRepository } from '@/data/repositories/customers';
import { CustomerSync } from '@/data/sync';
import { isTeamWritePatch, TEAM_INFO_FIELDS, TEAM_LOG_FIELDS } from '@/domain/customer/teamEdit';

const ME = 'me';
const NOW = '2026-11-06T02:30:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const handedOver = {
  id: 'c1',
  phone: '0912000001',
  full_name: 'Khách Đã Giao',
  owner_id: 'lan',
  followers: [ME],
  care_stage: 'Đang chăm sóc',
  call_attempts: [{ at: '2026-11-01T02:00:00.000Z', result: 'talked', x_keep: 1 }],
  x_future: { kept: true },
  updated_at: '2026-11-01T00:00:00.000Z',
};

async function setup(row: Record<string, unknown>) {
  const local = await LocalDB.open(ME, new IDBFactory());
  await new Promise<void>((done, fail) => {
    const tx = local.db.transaction([STORE_CUSTOMERS], 'readwrite');
    tx.objectStore(STORE_CUSTOMERS).put(row);
    tx.oncomplete = () => done();
    tx.onerror = () => fail(tx.error);
  });
  return { local, repo: new CustomerRepository(new CustomerSync(local, {} as SupabaseClient, () => false)) };
}

describe('D-032 — ghi giùm lịch sử khách đã giao', () => {
  it('bậc/lịch/loại chỉ đi kèm cuộc gọi; tương tác, ghi chú đi riêng được', () => {
    expect(isTeamWritePatch({ call_attempts: [], care_stage: 'Xem dự án', next_call_at: NOW })).toBe(true);
    expect(isTeamWritePatch({ interactions: [], updated_at: NOW })).toBe(true);
    expect(isTeamWritePatch({ notes_manual: [], updated_at: NOW })).toBe(true);
    expect(isTeamWritePatch({ care_stage: 'Xem dự án', updated_at: NOW })).toBe(false);
    expect(isTeamWritePatch({ next_call_at: NOW })).toBe(false);
    expect(isTeamWritePatch({ call_attempts: [], source: ['zalo'] })).toBe(false);
    expect(isTeamWritePatch({ updated_at: NOW })).toBe(false);
  });

  it('ghi cuộc gọi giùm: ghi local + xếp hàng đúng cột, giữ cuộc cũ và trường lạ', async () => {
    const { local, repo } = await setup(handedOver);
    await repo.logCall(
      'c1',
      { at: NOW, result: 'busy', note: 'Khách bận' },
      { patch: { next_call_at: '2026-11-07T02:00:00.000Z' } },
    );
    await repo.update('c1', { interactions: [{ kind: 'meeting', at: NOW, by: ME }] });
    await repo.addNote('c1', 'Ghi giùm Lan');
    const row = (await repo.get('c1')) as Record<string, unknown>;
    expect(row).toMatchObject({ owner_id: 'lan', next_call_at: '2026-11-07T02:00:00.000Z', x_future: { kept: true } });
    expect(row.call_attempts).toEqual([handedOver.call_attempts[0], { at: NOW, result: 'busy', note: 'Khách bận' }]);
    const ops = await queueGetAll(local);
    expect(ops.map((op) => Object.keys(op.payload ?? {}).sort())).toEqual([
      ['call_attempts', 'next_call_at', 'updated_at'],
      ['interactions', 'updated_at'],
      ['notes_manual', 'updated_at'],
    ]);
    local.close();
  });

  it('đổi bậc tay, đặt lịch riêng (Hẹn), lưu trữ vẫn chặn', async () => {
    const { local, repo } = await setup(handedOver);
    await expect(repo.update('c1', { care_stage: 'Xem dự án' })).rejects.toMatchObject({ code: 'READ_ONLY' });
    await expect(repo.update('c1', { next_call_at: NOW })).rejects.toMatchObject({ code: 'READ_ONLY' });
    await expect(repo.remove('c1')).rejects.toMatchObject({ code: 'READ_ONLY' });
    expect(await queueGetAll(local)).toEqual([]);
    local.close();
  });

  it('danh sách cột khớp SQL/v2/014 (server chặn cùng danh sách)', () => {
    const sql = readFileSync(resolve(process.cwd(), 'SQL/v2/014_team_log_edit.sql'), 'utf8');
    const block = /allowed text\[\] := array\[([\s\S]*?)\];/.exec(sql)?.[1] ?? '';
    const cols = [...block.replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(cols)).toEqual(
      new Set([...TEAM_INFO_FIELDS, ...TEAM_LOG_FIELDS, 'owner_id', 'followers', 'updated_at', 'updated_by']),
    );
  });
});
