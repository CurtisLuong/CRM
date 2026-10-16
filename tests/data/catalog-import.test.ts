// @vitest-environment node
// biome-ignore-all lint/suspicious/noExplicitAny: The test double models Supabase's dynamic query builder.
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { createCatalogRepository } from '@/data/repositories/catalog';
import { CustomerSync } from '@/data/sync';

function setupCatalog() {
  const tables: Record<string, any[]> = {
    projects: [{ id: 'p', name: 'Project' }],
    buildings: [{ id: 'b', project_id: 'p', code: 'B1' }],
    units: [
      {
        id: 'u',
        project_id: 'p',
        building_id: 'b',
        code: '01',
        area_m2: 62,
        floor: 8,
        direction: 'Đông',
        apt_type: '2N',
        price_per_m2_override: 20_000_000,
        net_price_override: 1_100_000_000,
        status: 'holding',
        note: 'Ghi chú cần giữ',
      },
    ],
    project_apt_types: [],
    building_apt_types: [],
  };
  const calls: any[] = [];
  const client: any = {
    from(table: string) {
      const chain: any[] = [];
      const query = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === 'then')
              return (resolve: any, reject: any) => {
                calls.push([table, ...chain]);
                try {
                  const rows = tables[table] ?? [];
                  const matches = (row: any) =>
                    chain.filter((op) => op[0] === 'eq').every(([, column, value]) => row[column] === value);
                  const command = chain.find((op) => ['update', 'insert', 'upsert', 'delete'].includes(op[0]));
                  let result: any[] = rows.filter(matches);
                  if (command?.[0] === 'update') result = result.map((row) => Object.assign(row, command[1]));
                  if (command?.[0] === 'insert') {
                    const inserts = Array.isArray(command[1]) ? command[1] : [command[1]];
                    result = inserts.map((row: any, index: number) => ({ id: `new-${index}`, ...row }));
                    tables[table]?.push(...result);
                  }
                  if (command?.[0] === 'upsert') {
                    for (const incoming of Array.isArray(command[1]) ? command[1] : [command[1]]) {
                      const existing = rows.find(
                        (row) => row.project_id === incoming.project_id && row.code === incoming.code,
                      );
                      if (!existing) rows.push(incoming);
                    }
                  }
                  const value = { data: result, error: null, count: result.length };
                  return Promise.resolve(value).then(resolve, reject);
                } catch (error) {
                  return Promise.reject(error).then(resolve, reject);
                }
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
  const cached = new Map([
    [
      'crm_catalog_v2:a',
      JSON.stringify({
        projects: tables.projects,
        buildings: tables.buildings,
        units: tables.units,
        projectTypes: [],
        buildingTypes: [],
      }),
    ],
  ]);
  const storage = {
    getItem: (key: string) => cached.get(key) ?? null,
    setItem: (key: string, value: string) => cached.set(key, value),
  } as unknown as Storage;
  return (async () => {
    const local = await LocalDB.open('a', new IDBFactory());
    const catalog = createCatalogRepository(new CustomerSync(local, client, () => true), storage);
    return { catalog, local, tables, calls };
  })();
}

it('keeps existing unit fields when those columns are absent in the import file', async () => {
  const { catalog, local, tables, calls } = await setupCatalog();
  await catalog.importRows([{ project: 'Project', building: 'B1', code: '01' }], {
    project: true,
    building: true,
    code: true,
  });
  expect(tables.units?.[0]).toMatchObject({
    area_m2: 62,
    floor: 8,
    direction: 'Đông',
    apt_type: '2N',
    price_per_m2_override: 20_000_000,
    net_price_override: 1_100_000_000,
    status: 'holding',
    note: 'Ghi chú cần giữ',
  });
  const update = calls.find(([table, ...chain]) => table === 'units' && chain.some((op: any) => op[0] === 'update'));
  expect(update).toBeDefined();
  expect(update[1][1]).not.toHaveProperty('area_m2');
  local.close();
});

it('lets a blank present column clear only that field and blocks catalog hard deletes', async () => {
  const { catalog, local, tables, calls } = await setupCatalog();
  await catalog.importRows([{ project: 'Project', building: 'B1', code: '01', floor: '' }], {
    project: true,
    building: true,
    code: true,
    floor: true,
  });
  expect(tables.units?.[0].floor).toBeNull();
  expect(tables.units?.[0].area_m2).toBe(62);
  await expect(catalog.deleteProject('p')).rejects.toThrow('schema catalog chưa có archived_at');
  await expect(catalog.deleteBuilding('b')).rejects.toThrow('schema catalog chưa có archived_at');
  await expect(catalog.deleteUnit('u')).rejects.toThrow('schema catalog chưa có archived_at');
  expect(calls.some(([, ...chain]) => chain.some((op: any) => op[0] === 'delete'))).toBe(false);
  expect(tables.projects).toHaveLength(1);
  expect(tables.buildings).toHaveLength(1);
  expect(tables.units).toHaveLength(1);
  local.close();
});
