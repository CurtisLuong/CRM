// @vitest-environment node
// biome-ignore-all lint/suspicious/noExplicitAny: The test double models Supabase's dynamic query builder.
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { createCatalogRepository } from '@/data/repositories/catalog';
import { CustomerSync } from '@/data/sync';

function setupCatalog() {
  const tables: Record<string, any[]> = {
    projects: [
      { id: 'p', name: 'Project' },
      { id: 'pa', name: 'Archived Project', archived_at: '2026-10-01' },
    ],
    buildings: [
      { id: 'b', project_id: 'p', code: 'B1' },
      { id: 'ba', project_id: 'pa', code: 'Archived Building' },
    ],
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
      { id: 'ua', project_id: 'pa', building_id: 'ba', code: 'Archived Unit', archived_at: '2026-10-01' },
    ],
    project_apt_types: [
      { id: 'pt', project_id: 'p', apt_type: '2N', typical_area_m2: 62 },
      { id: 'pta', project_id: 'pa', apt_type: 'Old', archived_at: '2026-10-01' },
    ],
    building_apt_types: [{ id: 'bt', building_id: 'b', project_id: 'p', apt_type: '2N', area_m2: 62 }],
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
        projectTypes: tables.project_apt_types,
        buildingTypes: tables.building_apt_types,
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

it('hides archived cache rows and keeps unit fields absent from an import file', async () => {
  const { catalog, local, tables, calls } = await setupCatalog();
  expect(catalog.projects().map((project: any) => project.id)).toEqual(['p']);
  expect(catalog.buildingsOf('pa')).toEqual([]);
  expect(catalog.units().some((unit: any) => unit.id === 'ua')).toBe(false);
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

it('lets a blank present column clear only that field and archives catalog rows without deleting them', async () => {
  const { catalog, local, tables, calls } = await setupCatalog();
  await catalog.importRows([{ project: 'Project', building: 'B1', code: '01', floor: '' }], {
    project: true,
    building: true,
    code: true,
    floor: true,
  });
  expect(tables.units?.[0].floor).toBeNull();
  expect(tables.units?.[0].area_m2).toBe(62);
  await catalog.archiveUnit('u');
  expect(catalog.units()).toEqual([]);
  await catalog.archiveBuilding('b');
  expect(catalog.buildingsOf('p')).toEqual([]);
  await catalog.archiveProjectType('pt');
  expect(catalog.projectTypes('p')).toEqual([]);
  await catalog.archiveProject('p');
  expect(catalog.projects()).toEqual([]);
  expect(calls.some(([, ...chain]) => chain.some((op: any) => op[0] === 'delete'))).toBe(false);
  expect(tables.projects).toHaveLength(2);
  expect(tables.buildings).toHaveLength(2);
  expect(tables.units).toHaveLength(2);
  expect(tables.projects?.find((project: any) => project.id === 'p')?.archived_at).toBeTruthy();
  local.close();
});

it('archives removed building type associations and reuses the archived row on restore', async () => {
  const { catalog, local, tables, calls } = await setupCatalog();
  await catalog.setBuildingTypes('b', []);
  expect(catalog.buildingTypeRows('b')).toEqual([]);
  expect(tables.building_apt_types?.[0].archived_at).toBeTruthy();
  await catalog.setBuildingTypes('b', [{ apt_type: '2N', area_m2: 64 }]);
  expect(catalog.buildingTypeRows('b')).toMatchObject([{ apt_type: '2N', area_m2: 64 }]);
  expect(tables.building_apt_types).toHaveLength(1);
  expect(tables.building_apt_types?.[0].archived_at).toBeNull();
  expect(calls.some(([, ...chain]) => chain.some((op: any) => op[0] === 'delete'))).toBe(false);
  local.close();
});
