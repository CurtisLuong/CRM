// @vitest-environment node
// biome-ignore-all lint/suspicious/noExplicitAny: Test records real legacy calls including unknown JSON.
import { createRequire } from 'node:module';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalDB } from '@/data/localdb';
import { createCatalogRepository } from '@/data/repositories/catalog';
import { CustomerRepository } from '@/data/repositories/customers';
import { createRemoteRepository } from '@/data/repositories/remote';
import { CustomerSync } from '@/data/sync';
import { loadV1Db } from './v1db';

const require = createRequire(import.meta.url);
const { loadV1 } = require('../legacy-harness/load-v1.js');
const clean = (x: any) => JSON.parse(JSON.stringify(x));
function recorder(reply: (table: string, chain: any[]) => any = () => ({ data: [], error: null, count: 0 })) {
  const calls: any[] = [];
  const client: any = {
    from(table: string) {
      const chain: any[] = [];
      const query: any = new Proxy(
        {},
        {
          get(_t, key) {
            if (key === 'then')
              return (resolve: any, reject: any) => {
                calls.push([table, ...chain]);
                return Promise.resolve(reply(table, chain)).then(resolve, reject);
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
    rpc(name: string, args?: any) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: [{ id: 'team', x: 1 }], error: null });
    },
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, file: any, opts: any) {
            calls.push(['storage', bucket, 'upload', path, { type: file.type, size: file.size }, opts]);
            return Promise.resolve({ data: {}, error: null });
          },
          remove(paths: string[]) {
            calls.push(['storage', bucket, 'remove', paths]);
            return Promise.resolve({ error: null });
          },
          createSignedUrl(path: string, expires: number) {
            calls.push(['storage', bucket, 'signed', path, expires]);
            return Promise.resolve({ data: { signedUrl: 'signed' }, error: null });
          },
          getPublicUrl(path: string) {
            calls.push(['storage', bucket, 'public', path]);
            return { data: { publicUrl: `public/${path}` } };
          },
        };
      },
    },
  };
  return { client, calls };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('all online-only document/media/settings/team APIs match actual v1 requests and results', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-12-01T03:00:00Z');
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  const one = recorder((_table, chain) => ({
    data: chain.some((c) => c[0] === 'maybeSingle')
      ? { zalo_greeting: 'Hi', zalo_templates: [{ id: 't', text: 'Hi', x: 1 }], ai_settings: { model: 'qwen', x: 2 } }
      : [],
    error: null,
  }));
  const two = recorder((_table, chain) => ({
    data: chain.some((c) => c[0] === 'maybeSingle')
      ? { zalo_greeting: 'Hi', zalo_templates: [{ id: 't', text: 'Hi', x: 1 }], ai_settings: { model: 'qwen', x: 2 } }
      : [],
    error: null,
  }));
  const v1 = loadV1Db(new IDBFactory());
  await v1.CRM.init(one.client, 'a');
  v1.run("crypto.randomUUID=()=> '00000000-0000-4000-8000-000000000001'");
  v1.navigator.onLine = true;
  // Keep customer queue offline so only the online adapter traffic is compared.
  v1.CRM.flushQueue = async () => {};
  const local = await LocalDB.open('a', new IDBFactory());
  const sync = new CustomerSync(local, two.client, () => true);
  sync.flushQueue = async () => ({ synced: 0, pending: 0, error: null, assignError: null });
  const customers = new CustomerRepository(sync);
  const remote = createRemoteRepository(sync, customers);
  const row = {
    id: 'c',
    full_name: 'Trường',
    phone: '0',
    owner_id: 'a',
    avatar_path: 'old-avatar',
    cover_path: 'old-cover',
  };
  await local.put(row);
  await v1.run(`localPut(${JSON.stringify(row)})`);
  const file = Object.assign(new Blob(['hello'], { type: 'image/jpeg' }), { name: 'file.jpg' });
  const cases: [string, any[]][] = [
    ['listDocuments', ['c']],
    ['uploadDocument', ['c', file, 'khac', 'ảnh']],
    ['deleteDocument', [{ id: 'doc', customer_id: 'c', storage_path: 'path' }]],
    ['uploadAvatar', ['c', file]],
    ['avatarUrl', ['x']],
    ['removeAvatar', ['c']],
    ['uploadCover', ['c', file]],
    ['coverUrl', ['x']],
    ['removeCover', ['c']],
    ['signedDocUrl', ['path', 120]],
    ['getZaloGreetingRemote', []],
    ['saveZaloGreetingRemote', ['Xin chào']],
    ['getZaloTemplatesRemote', []],
    ['saveZaloTemplatesRemote', [[{ id: 't', text: 'x', x_unknown: 3 }]]],
    ['getAiSettingsRemote', []],
    ['saveAiSettingsRemote', [{ model: 'qwen', style: 'short', x_unknown: 3 }]],
    ['teamList', []],
    ['teamAdd', ['x@example.test']],
    ['teamRemove', ['b']],
    ['setMyName', ['Curtis']],
  ];
  for (const [name, args] of cases) {
    const a = await v1.CRM[name](...args),
      b = await (remote as any)[name](...args);
    expect(clean(b ?? null), name).toEqual(clean(a ?? null));
    expect(clean(two.calls), name).toEqual(clean(one.calls));
  }
  expect(await local.get('c')).toEqual(clean((await v1.CRM.list())[0]));
  local.close();
  v1.CRM.suspend();
});
it('offline behavior matches v1, while pending remote completion is rejected after logout', async () => {
  const fake = recorder();
  const local = await LocalDB.open('a', new IDBFactory());
  let online = false;
  const sync = new CustomerSync(local, fake.client, () => online);
  const remote = createRemoteRepository(sync, new CustomerRepository(sync));
  expect(await remote.listDocuments('c')).toEqual([]);
  expect(await remote.getZaloGreetingRemote()).toBeUndefined();
  expect(await remote.saveAiSettingsRemote({ x: 1 })).toBe(false);
  expect(await remote.teamList()).toBeUndefined();
  await expect(remote.uploadDocument('c', new Blob())).rejects.toThrow('Cần mạng');
  await expect(remote.teamAdd('a')).rejects.toThrow('Cần mạng');
  expect(fake.calls).toEqual([]);
  online = true;
  let finish!: (r: any) => void;
  fake.client.rpc = () =>
    new Promise((r) => {
      finish = r;
    });
  const flight = remote.teamAdd('x');
  local.close();
  finish({ data: [], error: null });
  await expect(flight).rejects.toThrow('Phiên dữ liệu');
});
it('failed document metadata insertion rolls back uploaded storage file', async () => {
  const fake = recorder((table, chain) => ({
    data: null,
    error: table === 'documents' && chain.some((x) => x[0] === 'insert') ? { message: 'metadata failed' } : null,
  }));
  const local = await LocalDB.open('a', new IDBFactory());
  const sync = new CustomerSync(local, fake.client, () => true);
  const remote = createRemoteRepository(sync, new CustomerRepository(sync));
  await expect(remote.uploadDocument('c', new Blob(['x'], { type: 'application/pdf' }))).rejects.toMatchObject({
    message: 'metadata failed',
  });
  expect(fake.calls.map((x) => (x[0] === 'storage' ? x[2] : x[0]))).toEqual(['upload', 'documents', 'remove']);
  local.close();
});
it('ui_state nested patches retain unknown keys and send one setting column', async () => {
  const fake = recorder(() => ({
    data: { ui_state: { x_future: 1, capacity: { limit: 5, x_unknown: 2 } } },
    error: null,
  }));
  const local = await LocalDB.open('a', new IDBFactory());
  const sync = new CustomerSync(local, fake.client, () => true);
  const remote = createRemoteRepository(sync, new CustomerRepository(sync));
  expect(await remote.saveUiStateRemote({ capacity: { limit: 8 } })).toBe(true);
  expect(fake.calls.at(-1)[1][1]).toMatchObject({
    id: 'a',
    ui_state: { x_future: 1, capacity: { limit: 8, x_unknown: 2 } },
  });
  expect(Object.keys(fake.calls.at(-1)[1][1]).sort()).toEqual(['id', 'ui_state', 'updated_at']);
  local.close();
});
it('catalog cached selectors match the full real v1 module and caches remain account-scoped', async () => {
  const data = {
    projects: [{ id: 'p', name: 'Trang Cát', typical_price_per_m2: 10, handover_date: '2027-01-01', x: 1 }],
    buildings: [{ id: 'b', project_id: 'p', code: 'B1', approved_price_per_m2: 12 }],
    units: [{ id: 'u', project_id: 'p', building_id: 'b', code: '101', apt_type: '2N', status: 'available' }],
    projectTypes: [{ id: 't', project_id: 'p', apt_type: '2N', typical_area_m2: 60 }],
    buildingTypes: [],
  };
  const map = new Map([['crm_catalog_v2:a', JSON.stringify(data)]]);
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
  } as unknown as Storage;
  const fake = recorder();
  const local = await LocalDB.open('a', new IDBFactory());
  const sync = new CustomerSync(local, fake.client, () => false);
  const catalog = createCatalogRepository(sync, storage);
  const legacy = loadV1();
  legacy.ctx.localStorage.setItem('crm_catalog_v2:a', JSON.stringify(data));
  legacy.run("Catalog.scope('a')");
  const cases: [string, any[]][] = [
    ['projects', []],
    ['project', ['p']],
    ['projectByName', ['trang cát']],
    ['buildingsOf', ['p']],
    ['building', ['b']],
    ['buildingByCode', ['p', 'b1']],
    ['units', []],
    ['unitsOf', ['b']],
    ['unitByCode', ['b', '101']],
    ['unitsOfProject', ['p']],
    ['projectTypes', ['p']],
    ['buildingTypeRows', ['b']],
    ['buildingTypes', ['b']],
    ['typicalArea', ['p', 'b', '2N']],
    ['unitArea', [data.units[0]]],
    ['unitAreaSource', [data.units[0]]],
    ['unitPrice', [data.units[0]]],
    ['unitPriceSource', [data.units[0]]],
    ['projectPrice', [data.projects[0]]],
    ['buildingPrice', [data.buildings[0]]],
    ['buildingPriceSource', [data.buildings[0]]],
    ['buildingHandover', [data.buildings[0]]],
    ['buildingHandoverSource', [data.buildings[0]]],
    ['statusLabel', ['available']],
  ];
  for (const [name, args] of cases)
    expect(clean((catalog as any)[name](...args)), name).toEqual(
      clean(legacy.run(`Catalog.${name}(...${JSON.stringify(args)})`)),
    );
  expect(await catalog.load()).toBe(false);
  await expect(catalog.updateProject('p', { name: 'x' })).rejects.toThrow('Cần có mạng');
  const other = await LocalDB.open('b', new IDBFactory());
  expect(createCatalogRepository(new CustomerSync(other, fake.client, () => false), storage).projects()).toEqual([]);
  expect(() => catalog.scope('b')).toThrow('Phiên');
  local.close();
  other.close();
});
it('catalog load and every online write match real v1 requests, cache and outputs', async () => {
  const initial: any = {
    projects: [{ id: 'p', name: 'P', typical_price_per_m2: 10 }],
    buildings: [{ id: 'b', project_id: 'p', code: 'B' }],
    units: [{ id: 'u', project_id: 'p', building_id: 'b', code: '01' }],
    project_apt_types: [{ id: 'pt', project_id: 'p', apt_type: '2N' }],
    building_apt_types: [],
  };
  function server() {
    const tables = structuredClone(initial);
    let next = 0;
    return recorder((table, chain) => {
      const old: any[] = tables[table] ?? [];
      const matching = (row: any) => chain.filter((c) => c[0] === 'eq').every((c) => row[c[1]] === c[2]);
      const command = chain.find((c) => ['insert', 'update', 'delete', 'upsert'].includes(c[0]));
      let rows = old.filter(matching);
      if (command) {
        const [op, payload, opts] = command;
        if (op === 'delete') {
          tables[table] = old.filter((row) => !matching(row));
          rows = [];
        } else if (op === 'update') {
          rows = rows.map((row) => Object.assign(row, payload));
        } else {
          rows = (Array.isArray(payload) ? payload : [payload]).map((patch: any) => {
            const keys = (opts?.onConflict ?? 'id').split(',');
            const match = old.find((row) =>
              keys.every((key: string) => patch[key] !== undefined && row[key] === patch[key]),
            );
            if (match) {
              if (!opts?.ignoreDuplicates) Object.assign(match, patch);
              return match;
            }
            const row = { id: `new-${++next}`, ...patch };
            old.push(row);
            tables[table] = old;
            return row;
          });
        }
      }
      rows.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
      return { data: chain.some((c) => c[0] === 'single') ? rows[0] : clean(rows), error: null, count: rows.length };
    });
  }
  const one = server(),
    two = server();
  const legacy = loadV1();
  legacy.ctx.__client = one.client;
  legacy.run("sb=__client;navigator.onLine=true;Catalog.scope('a')");
  const local = await LocalDB.open('a', new IDBFactory());
  const cache = new Map<string, string>();
  const storage = {
    getItem: (k: string) => cache.get(k) ?? null,
    setItem: (k: string, v: string) => cache.set(k, v),
  } as unknown as Storage;
  const catalog = createCatalogRepository(new CustomerSync(local, two.client, () => true), storage);
  const legacyCalls = (calls: any[]) => JSON.parse(JSON.stringify(calls).replaceAll(',archived_at', ''));
  const steps: [string, any[]][] = [
    ['load', []],
    ['addProject', ['New', { x_unknown: 1 }]],
    ['addProject', ['P']],
    ['updateProject', ['p', { typical_price_per_m2: 12 }]],
    ['saveBuilding', [{ id: 'b', project_id: 'p', code: 'B', approved_price_per_m2: 15 }]],
    ['saveBuilding', [{ project_id: 'p', code: 'B2' }]],
    ['updateBuilding', ['b', { note: 'x' }]],
    ['saveUnit', [{ id: 'u', building_id: 'b', code: '01', apt_type: '2N', area_m2: 65 }]],
    ['saveUnit', [{ building_id: 'b', code: '02', apt_type: '3N' }]],
    ['saveProjectType', [{ id: 'pt', project_id: 'p', apt_type: '2N', typical_area_m2: 60 }]],
    ['saveProjectType', [{ project_id: 'p', apt_type: '1N' }]],
    ['setBuildingTypes', ['b', [{ apt_type: '2N', area_m2: 62 }]]],
    [
      'importRows',
      [[{ project: 'P', building: 'B', code: '01', floor: '9', apt_type: '2N' }], { floor: true, apt_type: true }],
    ],
  ];
  for (const [name, args] of steps) {
    const oneStart = one.calls.length;
    const twoStart = two.calls.length;
    legacy.ctx.__args = args;
    const a = await legacy.run(`Catalog.${name}(...__args)`);
    const b = await (catalog as any)[name](...args);
    if (name === 'importRows')
      expect(b).toMatchObject({ projects: a.projects, buildings: a.buildings, units: a.units });
    else expect(clean(b ?? null), name).toEqual(clean(a ?? null));
    // D-012 adds archive-aware reads; importRows intentionally uses field-patch updates.
    if (name !== 'importRows' && name !== 'setBuildingTypes' && name !== 'saveUnit')
      expect(legacyCalls(two.calls.slice(twoStart)), name).toEqual(legacyCalls(one.calls.slice(oneStart)));
    for (const getter of ['projects', 'units'])
      expect(clean((catalog as any)[getter]()), name).toEqual(clean(legacy.run(`Catalog.${getter}()`)));
  }
  expect(cache.has('crm_catalog_v2:a')).toBe(true);
  await catalog.archiveUnit('u');
  expect(catalog.units().some((unit: any) => unit.id === 'u')).toBe(false);
  expect(two.calls.some(([table, ...chain]) => table === 'units' && chain.some((c: any) => c[0] === 'delete'))).toBe(
    false,
  );
  await catalog.archiveBuilding('b');
  expect(catalog.buildingsOf('p').some((building: any) => building.id === 'b')).toBe(false);
  await catalog.archiveProject('p');
  expect(catalog.projects().some((project: any) => project.id === 'p')).toBe(false);
  await catalog.archiveProjectType('pt');
  expect(
    two.calls.some(([table, ...chain]) => table === 'project_apt_types' && chain.some((c: any) => c[0] === 'delete')),
  ).toBe(false);
  local.close();
});
it('concurrent ui_state patches serialize read/merge/write and retain both disjoint changes', async () => {
  let value: any = { x_future: { kept: true }, signals: { old: true } };
  const fake = recorder((_table, chain) => {
    const upsert = chain.find((c) => c[0] === 'upsert');
    if (upsert) value = structuredClone(upsert[1].ui_state);
    return { data: { ui_state: structuredClone(value) }, error: null };
  });
  const local = await LocalDB.open('a', new IDBFactory());
  const sync = new CustomerSync(local, fake.client, () => true);
  const first = createRemoteRepository(sync, new CustomerRepository(sync)),
    second = createRemoteRepository(sync, new CustomerRepository(sync));
  await Promise.all([
    first.saveUiStateRemote({ signals: { A: true } }),
    second.saveUiStateRemote({ signals: { B: true } }),
  ]);
  expect(value).toEqual({ x_future: { kept: true }, signals: { old: true, A: true, B: true } });
  local.close();
});
it('closing account during catalog ensureTypes-triggered load prevents a later unit mutation', async () => {
  let entered!: () => void, release!: (value: any) => void;
  const waiting = new Promise<void>((r) => {
    entered = r;
  });
  const fake = recorder((table, chain) => {
    if (table === 'projects' && chain.some((c) => c[0] === 'select')) {
      entered();
      return new Promise((r) => {
        release = r;
      });
    }
    return { data: [], error: null, count: 0 };
  });
  const local = await LocalDB.open('a', new IDBFactory());
  const cache = {
    projects: [{ id: 'p', name: 'P' }],
    buildings: [{ id: 'b', project_id: 'p', code: 'B' }],
    units: [],
    projectTypes: [],
    buildingTypes: [],
  };
  const storage = { getItem: () => JSON.stringify(cache), setItem: () => {} } as unknown as Storage;
  const catalog = createCatalogRepository(new CustomerSync(local, fake.client, () => true), storage);
  const save = catalog.saveUnit({ building_id: 'b', code: '01', apt_type: 'new' });
  await waiting;
  local.close();
  release({ data: [], error: null, count: 0 });
  await expect(save).rejects.toThrow('Phiên dữ liệu');
  expect(
    fake.calls.some(
      (c) =>
        c[0] === 'units' &&
        c.some((step: any) => Array.isArray(step) && ['insert', 'update', 'upsert'].includes(step[0])),
    ),
  ).toBe(false);
});
it.each(['uploadDocument', 'deleteDocument', 'uploadAvatar', 'uploadCover'] as const)(
  '%s starts no eager SDK request after account closes during owner check',
  async (method) => {
    const fake = recorder();
    const local = await LocalDB.open('a', new IDBFactory());
    const sync = new CustomerSync(local, fake.client, () => true);
    const remote = createRemoteRepository(sync, new CustomerRepository(sync));
    vi.spyOn(local, 'assertWritable').mockImplementation(async () => {
      local.close();
    });
    const call =
      method === 'deleteDocument'
        ? remote.deleteDocument({ id: 'doc', customer_id: 'c', storage_path: 'path' })
        : remote[method]('c', new Blob(['x'], { type: 'image/jpeg' }));
    await expect(call).rejects.toThrow('Phiên dữ liệu');
    expect(fake.calls).toEqual([]);
  },
);
