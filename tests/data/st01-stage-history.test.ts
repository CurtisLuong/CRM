// @vitest-environment node
// biome-ignore-all lint/suspicious/noExplicitAny: Bản ghi khách là JSON tự do như repository.
import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { queueGetAll } from '@/data/queue';
import { CustomerRepository } from '@/data/repositories/customers';
import { CustomerSync } from '@/data/sync';

const UID = 'account-a';
const ID = 'customer-st01';
const NOW = '2026-11-09T03:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup(seed: Record<string, unknown>) {
  const local = await LocalDB.open(UID, new IDBFactory());
  const repo = new CustomerRepository(new CustomerSync(local, {} as SupabaseClient, () => false));
  await repo.create({ id: ID, phone: '0900000000', full_name: 'Khách ST', ...seed });
  return { repo, local };
}

// Curtis 09/11: chuyển bậc chỉ khi bậc thật sự đổi; trong một bậc chỉ có hoạt động (ghi chú, cuộc gọi…).
describe('ST-01: không ghi mốc bậc cùng bậc', () => {
  it('chọn lại đúng bậc kèm ghi chú → thành Ghi chú, lịch sử bậc giữ nguyên', async () => {
    const { repo, local } = await setup({ care_stage: 'Đang chăm sóc' });
    const before = (await repo.get(ID)) as any;
    await repo.update(ID, { care_stage: 'Đang chăm sóc' }, { careStageNote: '  khách hẹn cuối tuần  ' });
    const row = (await repo.get(ID)) as any;
    expect(row.care_stage_history).toEqual(before.care_stage_history);
    expect(row.care_stage_updated_at).toBe(before.care_stage_updated_at);
    expect(row.notes_manual[0]).toEqual({ text: 'khách hẹn cuối tuần', at: NOW });
    const op = (await queueGetAll(local)).at(-1) as any;
    expect(op.payload.notes_manual[0]).toEqual({ text: 'khách hẹn cuối tuần', at: NOW });
    expect(op.payload).not.toHaveProperty('care_stage_history');
  });

  it('tên bậc cũ "Booking" và tên mới cùng một bậc → không thêm mốc', async () => {
    const { repo } = await setup({ care_stage: 'Booking' });
    const before = (await repo.get(ID)) as any;
    await repo.update(ID, { care_stage: 'Booking & Làm hồ sơ' });
    const row = (await repo.get(ID)) as any;
    expect(row.care_stage).toBe('Booking & Làm hồ sơ');
    expect(row.care_stage_history).toEqual(before.care_stage_history);
  });

  it('đổi sang bậc khác vẫn ghi đúng 1 mốc, ghi chú đi theo mốc', async () => {
    const { repo } = await setup({ care_stage: 'Đang chăm sóc' });
    const before = (await repo.get(ID)) as any;
    await repo.update(ID, { care_stage: 'Nuôi dài hạn' }, { careStageNote: 'khách hoãn mua' });
    const row = (await repo.get(ID)) as any;
    expect(row.care_stage_history).toEqual([
      ...before.care_stage_history,
      { stage: 'Nuôi dài hạn', note: 'khách hoãn mua', at: NOW },
    ]);
    expect(row.notes_manual ?? []).toEqual(before.notes_manual ?? []);
  });

  it('ghi cuộc gọi cho khách đã đạt không thêm mốc bậc', async () => {
    const { repo } = await setup({ care_stage: 'Đang chăm sóc', qualified_at: '2026-11-01T03:00:00.000Z' });
    const before = (await repo.get(ID)) as any;
    await repo.logCall(ID, { at: NOW, result: 'talked', note: 'ok' }, { patch: {} });
    const row = (await repo.get(ID)) as any;
    expect(row.call_attempts).toHaveLength(1);
    expect(row.care_stage_history).toEqual(before.care_stage_history);
  });
});
