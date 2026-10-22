// @vitest-environment node
// D-025 (Curtis duyệt 2026-10-22): khách nhóm — người theo dõi/trưởng nhóm sửa được thông tin hồ sơ + thêm ghi chú;
// bậc, cuộc gọi, việc, lưu trữ, nguồn vẫn chỉ người phụ trách.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDB, STORE_CUSTOMERS } from '@/data/localdb';
import { queueGetAll } from '@/data/queue';
import { CustomerRepository } from '@/data/repositories/customers';
import { CustomerSync } from '@/data/sync';
import { canEditTeamInfo, isTeamInfoPatch, TEAM_INFO_FIELDS } from '@/domain/customer/teamEdit';

const ME = 'me';
const NOW = '2026-10-22T02:30:00.000Z';
const READ_ONLY = { code: 'READ_ONLY' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup(row: Record<string, unknown>) {
  const local = await LocalDB.open(ME, new IDBFactory());
  // Khách đồng nghiệp đến từ server (pull), không qua repo.create.
  await new Promise<void>((done, fail) => {
    const tx = local.db.transaction([STORE_CUSTOMERS], 'readwrite');
    tx.objectStore(STORE_CUSTOMERS).put(row);
    tx.oncomplete = () => done();
    tx.onerror = () => fail(tx.error);
  });
  const repo = new CustomerRepository(new CustomerSync(local, {} as SupabaseClient, () => false));
  return { local, repo };
}

const colleague = {
  id: 'c1',
  phone: '0912000001',
  full_name: 'Khách Của Lan',
  owner_id: 'lan',
  followers: [ME],
  care_stage: 'Đang chăm sóc',
  notes_manual: [{ text: 'cũ', at: '2026-10-01T00:00:00.000Z', x_unknown: 1 }],
  x_future: { kept: true },
  updated_at: '2026-10-01T00:00:00.000Z',
};

describe('isTeamInfoPatch / canEditTeamInfo', () => {
  it('chỉ cột thông tin (+ mốc ghi) mới là bản vá thông tin', () => {
    expect(isTeamInfoPatch({ occupation: 'Kỹ sư', updated_at: NOW })).toBe(true);
    expect(isTeamInfoPatch({ notes_manual: [], updated_at: NOW })).toBe(true);
    expect(isTeamInfoPatch({ care_stage: 'Xem dự án', updated_at: NOW })).toBe(false);
    expect(isTeamInfoPatch({ occupation: 'x', next_call_at: NOW })).toBe(false);
    expect(isTeamInfoPatch({ updated_at: NOW })).toBe(false);
    expect(isTeamInfoPatch({})).toBe(false);
  });

  it('khách đồng nghiệp chưa lưu trữ → sửa được; khách mình / đã lưu trữ → không theo luật này', () => {
    expect(canEditTeamInfo({ owner_id: 'lan' }, ME)).toBe(true);
    expect(canEditTeamInfo({ owner_id: ME }, ME)).toBe(false);
    expect(canEditTeamInfo({ owner_id: 'lan', archived_at: NOW }, ME)).toBe(false);
    expect(canEditTeamInfo({ owner_id: 'lan' }, '')).toBe(false);
  });

  it('danh sách cột khớp đúng SQL/v2/010 (server chặn cùng danh sách)', () => {
    const sql = readFileSync(resolve(process.cwd(), 'SQL/v2/010_team_info_edit.sql'), 'utf8');
    const block = /allowed text\[\] := array\[([\s\S]*?)\];/.exec(sql)?.[1] ?? '';
    const cols = [...block.replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(cols)).toEqual(new Set([...TEAM_INFO_FIELDS, 'owner_id', 'followers', 'updated_at', 'updated_by']));
  });
});

describe('ghi khách đồng nghiệp (repo)', () => {
  it('sửa thông tin + thêm ghi chú: ghi local + xếp hàng chỉ đúng cột, giữ trường lạ', async () => {
    const { local, repo } = await setup(colleague);
    await repo.update('c1', { occupation: 'Kỹ sư', field_meta: { occupation: { by: 'sale' } } });
    await repo.addNote('c1', 'Khách hỏi thêm căn 2N');
    const row = (await repo.get('c1')) as Record<string, unknown> & { notes_manual: Record<string, unknown>[] };
    expect(row).toMatchObject({ occupation: 'Kỹ sư', owner_id: 'lan', care_stage: 'Đang chăm sóc' });
    expect(row.x_future).toEqual({ kept: true });
    expect(row.notes_manual[0]).toMatchObject({ text: 'Khách hỏi thêm căn 2N', at: NOW });
    expect(row.notes_manual[1]).toMatchObject({ text: 'cũ', x_unknown: 1 });
    const ops = await queueGetAll(local);
    expect(ops.map((op) => Object.keys(op.payload ?? {}).sort())).toEqual([
      ['field_meta', 'occupation', 'updated_at'],
      ['notes_manual', 'updated_at'],
    ]);
    local.close();
  });

  it('đổi bậc, ghi cuộc gọi, thêm việc, lưu trữ, đổi nguồn → chặn, không ghi gì', async () => {
    const { local, repo } = await setup(colleague);
    await expect(repo.update('c1', { care_stage: 'Xem dự án' })).rejects.toMatchObject(READ_ONLY);
    await expect(repo.update('c1', { source: ['zalo'] })).rejects.toMatchObject(READ_ONLY);
    await expect(repo.update('c1', { occupation: 'x', next_call_at: NOW })).rejects.toMatchObject(READ_ONLY);
    await expect(repo.logCall('c1', { at: NOW, result: 'talked' })).rejects.toMatchObject(READ_ONLY);
    await expect(repo.addTask('c1', 'Gọi lại', { due: NOW }, 'call')).rejects.toMatchObject(READ_ONLY);
    await expect(repo.addCareLog('c1', 'ghi lịch sử')).rejects.toMatchObject(READ_ONLY);
    await expect(repo.remove('c1')).rejects.toMatchObject(READ_ONLY);
    expect(await queueGetAll(local)).toEqual([]);
    expect(await repo.get('c1')).toMatchObject({ care_stage: 'Đang chăm sóc', updated_at: colleague.updated_at });
    local.close();
  });

  it('khách đồng nghiệp đã lưu trữ → không sửa được cả thông tin', async () => {
    const { local, repo } = await setup({ ...colleague, archived_at: NOW });
    await expect(repo.update('c1', { occupation: 'x' })).rejects.toMatchObject(READ_ONLY);
    local.close();
  });
});
