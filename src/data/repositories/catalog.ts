/** Account-scoped catalog cache and online writes; port of legacy/js/catalog.js. */
// biome-ignore-all lint/suspicious/noExplicitAny: Catalog metadata is extensible and legacy payloads retain unknown properties.
import { APT_TYPES } from '@/config/aptTypes';
import { pagedFetch } from '../pagedFetch';
import type { CustomerSync } from '../sync';
import type { Data } from './customers';

type CatalogData = {
  projects: Data[];
  buildings: Data[];
  units: Data[];
  projectTypes: Data[];
  buildingTypes: Data[];
  [key: string]: unknown;
};
export function createCatalogRepository(sync: CustomerSync, storage: Storage = localStorage) {
  const sb: any = {
    from(table: string) {
      sync.local.assertOpen();
      return sync.client.from(table);
    },
  };
  const LS_CACHE = 'crm_catalog_v2';
  let cacheKey: string | null = null,
    scopeEpoch = 0;
  const empty = (): CatalogData => ({ projects: [], buildings: [], units: [], projectTypes: [], buildingTypes: [] });
  const STATUS: Record<string, string> = { available: 'Còn', holding: 'Giữ chỗ', sold: 'Đã bán' };
  let data: CatalogData = { projects: [], buildings: [], units: [], projectTypes: [], buildingTypes: [] };
  const listeners: (() => void)[] = [];

  function visibleCatalog(rows: CatalogData): CatalogData {
    const projects = rows.projects.filter((row: any) => !row.archived_at);
    const projectIds = new Set(projects.map((row: any) => row.id));
    const buildings = rows.buildings.filter((row: any) => !row.archived_at && projectIds.has(row.project_id));
    const buildingIds = new Set(buildings.map((row: any) => row.id));
    const projectTypes = rows.projectTypes.filter((row: any) => !row.archived_at && projectIds.has(row.project_id));
    const activeTypes = new Set(projectTypes.map((row: any) => `${row.project_id}|${row.apt_type}`));
    return {
      ...rows,
      projects,
      buildings,
      units: rows.units.filter(
        (row: any) => !row.archived_at && projectIds.has(row.project_id) && buildingIds.has(row.building_id),
      ),
      projectTypes,
      buildingTypes: rows.buildingTypes.filter(
        (row: any) =>
          !row.archived_at && buildingIds.has(row.building_id) && activeTypes.has(`${row.project_id}|${row.apt_type}`),
      ),
    };
  }

  function scope(userId: any) {
    sync.local.assertOpen();
    if (userId && userId !== sync.local.userId) throw new Error('Phiên dữ liệu đã thay đổi.');
    scopeEpoch++;
    cacheKey = userId ? `${LS_CACHE}:${userId}` : null;
    data = empty();
    try {
      const c = cacheKey && JSON.parse(storage.getItem(cacheKey) ?? 'null');
      if (c?.projects) data = visibleCatalog({ ...empty(), ...c });
    } catch {}
    reindex();
  }
  let projectIndex = new Map<any, any>(),
    buildingIndex = new Map<any, any>(),
    unitsIndex = new Map<any, any>();
  function reindex() {
    projectIndex = new Map(data.projects.map((p: any) => [p.id, p]));
    buildingIndex = new Map(data.buildings.map((b: any) => [b.id, b]));
    unitsIndex = new Map<any, any>();
    for (const u of data.units) {
      if (!unitsIndex.has(u.building_id)) unitsIndex.set(u.building_id, []);
      unitsIndex.get(u.building_id).push(u);
    }
  }

  const norm = (s: any) =>
    String(s == null ? '' : s)
      .trim()
      .toLowerCase();
  const byOrder = (a: any, b: any) =>
    (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
  // Loại căn: theo thứ tự danh sách chuẩn APT_TYPES (Studio, 1N…), loại tự gõ xếp sau
  const typeRank = (t: any) => {
    const L = APT_TYPES;
    const i = L.indexOf(t);
    return i < 0 ? 99 : i;
  };
  const byTypeOrder = (a: any, b: any) =>
    typeRank(a.apt_type) - typeRank(b.apt_type) || String(a.apt_type).localeCompare(String(b.apt_type));
  const byCode = (a: any, b: any) => String(a.code).localeCompare(String(b.code), 'vi', { numeric: true });

  function online() {
    return !sync.local.isClosed && sync.isOnline();
  }
  function needOnline() {
    if (!online()) throw new Error('Cần có mạng để sửa giỏ hàng.');
  }
  function emit() {
    sync.local.assertOpen();
    reindex();
    try {
      if (cacheKey) storage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      /* bỏ qua */
    }
    listeners.forEach((fn: any) => {
      try {
        fn();
      } catch (raw) {
        console.warn('[catalog] listener', raw);
      }
    });
  }
  function check(r: any) {
    sync.local.assertOpen();
    if (r.error) throw r.error;
    return r.data;
  }

  async function load() {
    sync.local.assertOpen();
    if (!online()) return false;
    const epoch = scopeEpoch,
      client = sb;
    const read = (table: any, columns: any) =>
      pagedFetch<Data & { id: string }>(client, table, columns, () => epoch === scopeEpoch && !sync.local.isClosed);
    try {
      const [p, b, u, pt, bt] = await Promise.all([
        read(
          'projects',
          'id,name,typical_price_per_m2,vat_rate,kpbt_rate,handover_date,title_after_months,payment_schedule,sort_order,created_at,archived_at',
        ),
        read(
          'buildings',
          'id,project_id,code,approved_price_per_m2,handover_date,note,sort_order,created_at,archived_at',
        ),
        read(
          'units',
          'id,project_id,building_id,code,area_m2,floor,direction,apt_type,price_per_m2_override,net_price_override,status,note,archived_at',
        ),
        read('project_apt_types', 'id,project_id,apt_type,typical_area_m2,sort_order,archived_at'),
        read('building_apt_types', 'id,building_id,project_id,apt_type,area_m2,archived_at'),
      ]);
      if (epoch !== scopeEpoch || sync.local.isClosed) return false;
      data = visibleCatalog({ projects: p, buildings: b, units: u, projectTypes: pt, buildingTypes: bt });
      data.projects.sort(byOrder);
      data.buildings.sort(byOrder);
      data.units.sort(byCode);
      data.projectTypes.sort(byTypeOrder);
      emit();
      return true;
    } catch (raw) {
      console.warn('[catalog] load lỗi, dùng cache:', String(raw));
      return false;
    }
  }

  // ---------- Đọc ----------
  const projects = () => data.projects;
  const project = (id: any) => projectIndex.get(id) || null;
  const projectByName = (name: any) =>
    (norm(name) && data.projects.find((p: any) => norm(p.name) === norm(name))) || null;
  const buildingsOf = (projectId: any) => data.buildings.filter((b: any) => b.project_id === projectId).sort(byCode);
  const building = (id: any) => buildingIndex.get(id) || null;
  const buildingByCode = (projectId: any, code: any) =>
    (norm(code) && data.buildings.find((b: any) => b.project_id === projectId && norm(b.code) === norm(code))) || null;
  const unitsOf = (buildingId: any) => unitsIndex.get(buildingId) || [];
  const unitByCode = (buildingId: any, code: any) =>
    (norm(code) && data.units.find((u: any) => u.building_id === buildingId && norm(u.code) === norm(code))) || null;
  const unitsOfProject = (projectId: any) => data.units.filter((u: any) => u.project_id === projectId);
  // ---------- Giá trị HIỆU LỰC (đã áp ghi đè) ----------
  const projectPrice = (p: any) => (p?.typical_price_per_m2 ? +p.typical_price_per_m2 : null);
  // Giá điển hình của toà: riêng của toà > dự án
  function buildingPrice(b: any) {
    if (!b) return null;
    return b.approved_price_per_m2 ? +b.approved_price_per_m2 : projectPrice(project(b.project_id));
  }
  // Đơn giá của căn: riêng của căn > toà > dự án
  function unitPrice(u: any) {
    if (!u) return null;
    if (u.price_per_m2_override) return +u.price_per_m2_override;
    return buildingPrice(building(u.building_id)) || projectPrice(project(u.project_id));
  }
  // Nguồn của giá trị: 'căn' | 'toà' | 'dự án' | null
  function unitPriceSource(u: any) {
    if (!u) return null;
    if (u.price_per_m2_override) return 'căn';
    const b = building(u.building_id);
    if (b?.approved_price_per_m2) return 'toà';
    return projectPrice(project(u.project_id)) ? 'dự án' : null;
  }
  const buildingPriceSource = (b: any) =>
    b?.approved_price_per_m2 ? 'toà' : projectPrice(b && project(b.project_id)) ? 'dự án' : null;
  // Bàn giao dự kiến: riêng của toà > dự án
  function buildingHandover(b: any) {
    if (!b) return null;
    const p = project(b.project_id);
    return b.handover_date || p?.handover_date || null;
  }
  const buildingHandoverSource = (b: any) => (b?.handover_date ? 'toà' : buildingHandover(b) ? 'dự án' : null);
  function unitAreaSource(u: any) {
    if (!u) return null;
    if (u.area_m2) return 'căn';
    const bt = data.buildingTypes.find((x: any) => x.building_id === u.building_id && x.apt_type === u.apt_type);
    if (bt?.area_m2) return 'toà';
    return typicalArea(u.project_id, null, u.apt_type) ? 'dự án' : null;
  }
  const statusLabel = (s: any) => STATUS[s] || STATUS.available;

  // ---------- Loại căn + diện tích điển hình ----------
  // Loại căn của dự án: [{ apt_type, typical_area_m2 }]
  const projectTypes = (projectId: any) => data.projectTypes.filter((t: any) => t.project_id === projectId);
  // Loại căn ĐÃ KHAI BÁO riêng cho toà (có thể rỗng = toà dùng mọi loại của dự án)
  const buildingTypeRows = (buildingId: any) => data.buildingTypes.filter((t: any) => t.building_id === buildingId);
  // Loại căn HIỆU LỰC của toà: [{ apt_type, area, source: 'toà' | 'dự án' | null }]
  function buildingTypes(buildingId: any) {
    const b = building(buildingId);
    if (!b) return [];
    const own = buildingTypeRows(buildingId);
    return projectTypes(b.project_id)
      .filter((pt: any) => !own.length || own.some((x: any) => x.apt_type === pt.apt_type))
      .map((pt: any) => {
        const bt = own.find((x: any) => x.apt_type === pt.apt_type);
        const area = bt?.area_m2 || pt.typical_area_m2 || null;
        return {
          apt_type: pt.apt_type,
          area: area ? +area : null,
          source: bt?.area_m2 ? 'toà' : pt.typical_area_m2 ? 'dự án' : null,
        };
      });
  }
  // Diện tích điển hình của 1 loại căn: toà > dự án
  function typicalArea(projectId: any, buildingId: any, aptType: any) {
    if (!aptType) return null;
    const bt =
      buildingId && data.buildingTypes.find((x: any) => x.building_id === buildingId && x.apt_type === aptType);
    if (bt?.area_m2) return +bt.area_m2;
    const pt = data.projectTypes.find((x: any) => x.project_id === projectId && x.apt_type === aptType);
    return pt?.typical_area_m2 ? +pt.typical_area_m2 : null;
  }
  // Diện tích hiệu lực của căn: riêng của căn > toà > dự án
  function unitArea(u: any) {
    if (!u) return null;
    return u.area_m2 ? +u.area_m2 : typicalArea(u.project_id, u.building_id, u.apt_type);
  }

  // ---------- Ghi ----------
  async function addProject(name: any, extra: any) {
    needOnline();
    name = String(name || '').trim();
    if (!name) throw new Error('Thiếu tên dự án');
    const ex = projectByName(name);
    if (ex) return ex;
    const row = check(
      await sb
        .from('projects')
        .insert(Object.assign({ name }, extra || {}))
        .select()
        .single(),
    );
    data.projects.push(row);
    emit();
    return row;
  }
  async function updateProject(id: any, patch: any) {
    needOnline();
    const row = check(await sb.from('projects').update(patch).eq('id', id).select().single());
    Object.assign(project(id), row);
    emit();
    return row;
  }
  async function archiveProject(id: any) {
    needOnline();
    check(await sb.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', id));
    const bIds = new Set(data.buildings.filter((b: any) => b.project_id === id).map((b: any) => b.id));
    data.projects = data.projects.filter((p: any) => p.id !== id);
    data.buildings = data.buildings.filter((b: any) => b.project_id !== id);
    data.units = data.units.filter((u: any) => u.project_id !== id && !bIds.has(u.building_id));
    data.projectTypes = data.projectTypes.filter((t: any) => t.project_id !== id);
    data.buildingTypes = data.buildingTypes.filter((t: any) => t.project_id !== id);
    emit();
  }
  async function saveBuilding(b: any) {
    // có id → sửa, không → thêm
    needOnline();
    const payload: Data = {
      project_id: b.project_id,
      code: String(b.code || '').trim(),
      approved_price_per_m2: b.approved_price_per_m2 || null,
      handover_date: b.handover_date || null,
    };
    if (!payload.code) throw new Error('Thiếu mã toà');
    if (b.id) {
      const row = check(await sb.from('buildings').update(payload).eq('id', b.id).select().single());
      Object.assign(building(b.id), row);
    } else {
      data.buildings.push(check(await sb.from('buildings').insert(payload).select().single()));
    }
    emit();
  }
  async function updateBuilding(id: any, patch: any) {
    needOnline();
    const row = check(await sb.from('buildings').update(patch).eq('id', id).select().single());
    Object.assign(building(id), row);
    emit();
    return row;
  }
  async function archiveBuilding(id: any) {
    needOnline();
    check(await sb.from('buildings').update({ archived_at: new Date().toISOString() }).eq('id', id));
    data.buildings = data.buildings.filter((b: any) => b.id !== id);
    data.units = data.units.filter((u: any) => u.building_id !== id);
    data.buildingTypes = data.buildingTypes.filter((t: any) => t.building_id !== id);
    emit();
  }
  async function saveUnit(u: any) {
    needOnline();
    const b = building(u.building_id);
    if (!b) throw new Error('Căn phải thuộc 1 toà');
    const payload: Data = {
      project_id: b.project_id,
      building_id: b.id,
      building: b.code,
      code: String(u.code || '').trim(),
      area_m2: u.area_m2 || null,
      floor: u.floor || null,
      direction: u.direction || null,
      apt_type: u.apt_type || null,
      price_per_m2_override: u.price_per_m2_override || null,
      status: u.status || 'available',
    };
    if (!payload.code) throw new Error('Thiếu mã căn');
    if (await ensureTypes([payload])) await load(); // loại căn mới → khai báo trước (ràng buộc DB)
    if (u.id) {
      const row = check(await sb.from('units').update(payload).eq('id', u.id).select().single());
      Object.assign(data.units.find((x: any) => x.id === u.id) || {}, row);
    } else {
      data.units.push(check(await sb.from('units').insert(payload).select().single()));
    }
    data.units.sort(byCode);
    emit();
  }
  async function archiveUnit(id: any) {
    needOnline();
    check(await sb.from('units').update({ archived_at: new Date().toISOString() }).eq('id', id));
    data.units = data.units.filter((u: any) => u.id !== id);
    emit();
  }

  // Căn mang loại căn chưa khai báo → tự thêm vào dự án (và vào toà nếu toà đã có danh sách riêng)
  async function ensureTypes(units: any) {
    const pNeed = new Map<any, any>(),
      bNeed = new Map<any, any>();
    units.forEach((u: any) => {
      if (!u.apt_type) return;
      if (!data.projectTypes.some((t: any) => t.project_id === u.project_id && t.apt_type === u.apt_type)) {
        pNeed.set(`${u.project_id}|${u.apt_type}`, { project_id: u.project_id, apt_type: u.apt_type });
      }
      const own = buildingTypeRows(u.building_id);
      if (own.length && !own.some((t: any) => t.apt_type === u.apt_type)) {
        bNeed.set(`${u.building_id}|${u.apt_type}`, {
          building_id: u.building_id,
          project_id: u.project_id,
          apt_type: u.apt_type,
        });
      }
    });
    for (const row of pNeed.values() as any) {
      const matches = check(
        await sb
          .from('project_apt_types')
          .select('id,archived_at')
          .eq('project_id', row.project_id)
          .eq('apt_type', row.apt_type),
      );
      const archived = matches?.[0];
      if (archived?.archived_at)
        check(await sb.from('project_apt_types').update({ archived_at: null }).eq('id', archived.id));
      else if (!archived) check(await sb.from('project_apt_types').insert(row));
    }
    for (const row of bNeed.values() as any) {
      const matches = check(
        await sb
          .from('building_apt_types')
          .select('id,archived_at')
          .eq('building_id', row.building_id)
          .eq('apt_type', row.apt_type),
      );
      const archived = matches?.[0];
      if (archived?.archived_at)
        check(await sb.from('building_apt_types').update({ archived_at: null }).eq('id', archived.id));
      else if (!archived) check(await sb.from('building_apt_types').insert(row));
    }
    return pNeed.size + bNeed.size > 0;
  }

  // Loại căn của dự án: thêm / sửa (đổi tên → DB tự đổi theo ở toà + căn), lưu trữ mềm.
  async function saveProjectType(t: any) {
    needOnline();
    const payload: Data = {
      project_id: t.project_id,
      apt_type: String(t.apt_type || '').trim(),
      typical_area_m2: t.typical_area_m2 || null,
    };
    if (!payload.apt_type) throw new Error('Thiếu tên loại căn');
    if (t.id) check(await sb.from('project_apt_types').update(payload).eq('id', t.id));
    else check(await sb.from('project_apt_types').insert(payload));
    await load();
  }
  async function archiveProjectType(id: any) {
    needOnline();
    const archived = data.projectTypes.find((t: any) => t.id === id);
    check(await sb.from('project_apt_types').update({ archived_at: new Date().toISOString() }).eq('id', id));
    data.projectTypes = data.projectTypes.filter((t: any) => t.id !== id);
    if (archived)
      data.buildingTypes = data.buildingTypes.filter(
        (t: any) => t.project_id !== archived.project_id || t.apt_type !== archived.apt_type,
      );
    emit();
  }
  // Ghi lại toàn bộ loại căn của 1 toà: rows = [{ apt_type, area_m2 }] (rỗng = dùng mọi loại của dự án)
  async function setBuildingTypes(buildingId: any, rows: any) {
    needOnline();
    const b = building(buildingId);
    if (!b) throw new Error('Không tìm thấy toà.');
    const current = check(
      await sb
        .from('building_apt_types')
        .select('id,building_id,project_id,apt_type,area_m2,archived_at')
        .eq('building_id', buildingId),
    ) as Data[];
    const desired = new Map(rows.map((row: any) => [row.apt_type, row]));
    for (const existing of current as any[]) {
      const next: any = desired.get(existing.apt_type);
      if (next) {
        const area = next.area_m2 || null;
        if (existing.archived_at || existing.area_m2 !== area)
          check(await sb.from('building_apt_types').update({ archived_at: null, area_m2: area }).eq('id', existing.id));
        desired.delete(existing.apt_type);
      } else if (!existing.archived_at) {
        check(
          await sb.from('building_apt_types').update({ archived_at: new Date().toISOString() }).eq('id', existing.id),
        );
      }
    }
    if (desired.size) {
      check(
        await sb.from('building_apt_types').insert(
          [...desired.values()].map((row: any) => ({
            building_id: buildingId,
            project_id: b.project_id,
            apt_type: row.apt_type,
            area_m2: row.area_m2 || null,
          })),
        ),
      );
    }
    await load();
  }

  // ---------- Nhập hàng loạt (Excel) ----------
  // rows: [{ project, building, buildingPrice?, code?, area_m2?, floor?, direction?, apt_type?,
  //          price_per_m2_override?, status? }]. `cols` = các field CÓ cột trong file — chỉ
  // field đó được ghi (ô trống → xoá giá trị), field không có cột giữ nguyên dữ liệu cũ.
  async function importRows(rows: any, cols: any) {
    needOnline();
    const stat = { projects: 0, buildings: 0, units: 0 };
    // 1) Dự án chưa có → tạo
    const names = [...new Set(rows.map((r: any) => r.project).filter(Boolean))];
    const missing = names.filter((n: any) => !projectByName(n));
    if (missing.length) {
      const ins = check(
        await sb
          .from('projects')
          .insert(missing.map((name: any) => ({ name })))
          .select(),
      );
      data.projects.push(...ins);
      stat.projects = ins.length;
    }
    // 2) Toà: có cột giá → upsert kèm giá; không → chỉ thêm toà chưa có
    const bMap = new Map<any, any>();
    rows.forEach((r: any) => {
      const p = projectByName(r.project);
      if (!p || !r.building) return;
      const key = `${p.id}|${norm(r.building)}`;
      const cur: Data = bMap.get(key) || { project_id: p.id, code: String(r.building).trim() };
      if (cols.buildingPrice)
        cur.approved_price_per_m2 = r.buildingPrice == null || r.buildingPrice === '' ? null : r.buildingPrice;
      bMap.set(key, cur);
    });
    const bRows = [...bMap.values()];
    const before = data.buildings.length;
    const withPrice = bRows.filter((b: any) => 'approved_price_per_m2' in b);
    const noPrice = bRows.filter((b: any) => !('approved_price_per_m2' in b));
    if (withPrice.length) check(await sb.from('buildings').upsert(withPrice, { onConflict: 'project_id,code' }));
    if (noPrice.length)
      check(await sb.from('buildings').upsert(noPrice, { onConflict: 'project_id,code', ignoreDuplicates: true }));
    data.buildings = (
      await pagedFetch<Data & { id: string }>(
        sb,
        'buildings',
        'id,project_id,code,approved_price_per_m2,handover_date,note,sort_order,created_at',
        () => !sync.local.isClosed,
      )
    ).sort(byOrder);
    reindex();
    stat.buildings = data.buildings.length - before;
    // 3) Căn: upsert theo (toà, mã căn)
    const FIELDS = ['area_m2', 'floor', 'direction', 'apt_type', 'price_per_m2_override', 'status'];
    const uMap = new Map<any, any>();
    rows.forEach((r: any) => {
      if (!r.code) return;
      const p = projectByName(r.project),
        b = p && buildingByCode(p.id, r.building);
      if (!b) return;
      const u: Data = { project_id: p.id, building_id: b.id, building: b.code, code: String(r.code).trim() };
      FIELDS.forEach((f: any) => {
        if (cols[f]) u[f] = r[f] == null || r[f] === '' ? (f === 'status' ? 'available' : null) : r[f];
      });
      uMap.set(`${b.id}|${norm(u.code)}`, u); // trùng dòng → lấy dòng sau
    });
    const uRows = [...uMap.values()];
    if (await ensureTypes(uRows)) await load(); // khai báo loại căn mới TRƯỚC khi ghi căn (DB kiểm tra)
    if (uRows.length) {
      // Đọc khóa hiện có để import cập nhật theo patch. Upsert một row bị thiếu cột
      // sẽ ghi NULL vào các cột bị lược khỏi file, làm mất dữ liệu đã nhập trước đó.
      const existing = await pagedFetch<Data & { id: string }>(
        sb,
        'units',
        'id,project_id,building_id,code,area_m2,floor,direction,apt_type,price_per_m2_override,net_price_override,status,note,archived_at',
        () => !sync.local.isClosed,
      );
      const byKey = new Map(existing.map((unit: any) => [`${unit.building_id}|${norm(unit.code)}`, unit]));
      const inserts: Data[] = [];
      for (const unit of uRows) {
        const current: any = byKey.get(`${unit.building_id}|${norm(unit.code)}`);
        if (current) {
          const { project_id, building_id, code, ...fields } = unit;
          check(
            await sb
              .from('units')
              .update({
                project_id,
                building_id,
                code,
                ...(current.archived_at ? { archived_at: null } : {}),
                ...fields,
              })
              .eq('id', current.id),
          );
        } else inserts.push(unit);
      }
      for (let i = 0; i < inserts.length; i += 500) {
        check(await sb.from('units').insert(inserts.slice(i, i + 500)));
      }
    }
    stat.units = uRows.length;
    await load();
    return stat;
  }

  scope(sync.local.userId);
  return {
    STATUS,
    load,
    scope,
    units: () => data.units,
    onChange: (fn: any) => {
      listeners.push(fn);
      return () => {
        const index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    projects,
    project,
    projectByName,
    buildingsOf,
    building,
    buildingByCode,
    unitsOf,
    unitByCode,
    unitsOfProject,
    unitPrice,
    statusLabel,
    projectTypes,
    buildingTypeRows,
    buildingTypes,
    typicalArea,
    unitArea,
    unitAreaSource,
    projectPrice,
    buildingPrice,
    buildingPriceSource,
    unitPriceSource,
    buildingHandover,
    buildingHandoverSource,
    addProject,
    updateProject,
    archiveProject,
    saveBuilding,
    updateBuilding,
    archiveBuilding,
    saveUnit,
    archiveUnit,
    importRows,
    saveProjectType,
    archiveProjectType,
    setBuildingTypes,
  };
}
