// biome-ignore-all lint/suspicious/noExplicitAny: Fake Supabase client records loose query chains.
// LF-01 (Curtis 06/11): phí mỗi căn theo dự án → toà → căn (cấp con ghi đè); DB chưa chạy SQL 013 vẫn tải được Giỏ hàng.
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { createCatalogRepository } from '@/data/repositories/catalog';
import { CustomerSync } from '@/data/sync';
import { price } from '@/domain/matching/property';

const rows: Record<string, any[]> = {
  projects: [
    { id: 'p', name: 'Marquee', typical_price_per_m2: 30_000_000, vat_rate: 5, kpbt_rate: 2, fee: 50_000_000 },
  ],
  buildings: [
    { id: 'b1', project_id: 'p', code: 'A1', fee: null },
    { id: 'b2', project_id: 'p', code: 'A2', fee: 30_000_000 },
  ],
  units: [
    { id: 'u1', project_id: 'p', building_id: 'b1', code: '101', area_m2: 68.6, fee: null },
    { id: 'u2', project_id: 'p', building_id: 'b2', code: '201', area_m2: 68.6, fee: null },
    { id: 'u3', project_id: 'p', building_id: 'b2', code: '202', area_m2: 68.6, fee: 0 },
  ],
  project_apt_types: [],
  building_apt_types: [],
};

function fakeClient(hasFeeColumn: boolean) {
  const writes: any[] = [];
  const client: any = {
    from(table: string) {
      const chain: any[] = [];
      const query: any = new Proxy(
        {},
        {
          get(_t, key) {
            if (key === 'then')
              return (resolve: any, reject: any) => {
                const select = chain.find((c) => c[0] === 'select')?.[1] ?? '';
                const write = chain.find((c) => c[0] === 'update' || c[0] === 'insert');
                let reply: any;
                if (write) {
                  writes.push([table, write[0], write[1]]);
                  reply =
                    !hasFeeColumn && 'fee' in write[1]
                      ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'fee' column" } }
                      : { data: { id: chain.find((c) => c[0] === 'eq')?.[2] ?? 'new', ...write[1] }, error: null };
                } else if (!hasFeeColumn && /\bfee\b/.test(select)) {
                  reply = { data: null, error: { code: '42703', message: `column ${table}.fee does not exist` } };
                } else {
                  const all = (rows[table] ?? []).map((r) => {
                    if (hasFeeColumn) return r;
                    const { fee: _fee, ...rest } = r;
                    return rest;
                  });
                  const after = chain.find((c) => c[0] === 'gt');
                  const data = after ? [] : all;
                  reply = { data, error: null, count: after ? 0 : all.length };
                }
                return Promise.resolve(reply).then(resolve, reject);
              };
            return (...args: any[]) => {
              chain.push([key, ...args]);
              return query;
            };
          },
        },
      );
      return query;
    },
  };
  return { client, writes };
}

const storage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
  } as unknown as Storage;
};

let local: LocalDB;
afterEach(() => local?.close());

async function repo(hasFeeColumn: boolean) {
  local = await LocalDB.open('lf01', new IDBFactory());
  const fake = fakeClient(hasFeeColumn);
  const catalog = createCatalogRepository(new CustomerSync(local, fake.client, () => true), storage());
  expect(await catalog.load()).toBe(true);
  return { catalog, writes: fake.writes };
}

describe('phí mỗi căn: dự án → toà → căn', () => {
  it('cấp con có giá trị thì ghi đè; 0 ở căn là phí 0 thật', async () => {
    const { catalog } = await repo(true);
    const [u1, u2, u3] = catalog.units();
    expect(catalog.unitFee(u1)).toBe(50_000_000);
    expect(catalog.unitFeeSource(u1)).toBe('dự án');
    expect(catalog.unitFee(u2)).toBe(30_000_000);
    expect(catalog.unitFeeSource(u2)).toBe('toà');
    expect(catalog.unitFee(u3)).toBe(0);
    expect(catalog.unitFeeSource(u3)).toBe('căn');
    expect(catalog.buildingFee(catalog.building('b1'))).toBe(50_000_000);
    // Giá dự kiến của căn trong Giỏ hàng/ghép khách cộng phí.
    expect(price(u1, catalog)).toBe(2_058_000_000 + 102_900_000 + 41_160_000 + 50_000_000);
    expect(price(u3, catalog)).toBe(2_058_000_000 + 102_900_000 + 41_160_000);
  });

  it('lưu toà/căn ghi cột fee', async () => {
    const { catalog, writes } = await repo(true);
    await catalog.saveBuilding({ id: 'b1', project_id: 'p', code: 'A1', fee: 40_000_000 });
    await catalog.saveUnit({ id: 'u1', building_id: 'b1', code: '101', fee: null });
    expect(writes[0]).toEqual(['buildings', 'update', expect.objectContaining({ fee: 40_000_000 })]);
    expect(writes[1]).toEqual(['units', 'update', expect.objectContaining({ fee: null })]);
  });

  it('DB chưa có cột fee: vẫn tải đủ Giỏ hàng (phí = 0), lưu khi phí trống không gửi cột fee', async () => {
    const { catalog, writes } = await repo(false);
    expect(catalog.units()).toHaveLength(3);
    expect(catalog.unitFee(catalog.units()[0])).toBeNull();
    await catalog.saveBuilding({ id: 'b1', project_id: 'p', code: 'A1', fee: null });
    await catalog.updateProject('p', { name: 'Marquee', fee: null });
    expect(writes.every(([, , payload]) => !('fee' in payload))).toBe(true);
  });
});
