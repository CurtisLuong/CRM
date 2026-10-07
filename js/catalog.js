// catalog.js — GIỎ HÀNG: Dự án → Toà → Căn (bảng projects / buildings / units).
// Nguồn dữ liệu DUY NHẤT cho: danh sách dự án ở form khách, gợi ý mã toà/mã căn,
// bảng tính vay (js/loan/), và màn "Giỏ hàng" (js/catalog-ui.js).
//
// - Đọc: nạp 1 lần lúc vào app (Catalog.load) + cache localStorage → mở offline được.
// - Ghi (thêm/sửa/xoá/nhập Excel): cần mạng, ghi thẳng Supabase rồi nạp lại.
// - Dùng biến `sb` và `CRM` của app.js lúc CHẠY (không lúc tải file) → tải file này
//   trước hay sau app.js đều được. KHÔNG đặt tên biến `supabase` (CLAUDE.md mục 5.1).
// - Schema: SQL/add_loan_module.sql + SQL/add_catalog_buildings.sql + SQL/add_apt_types_by_project.sql.
// - 3 lớp, lớp dưới GHI ĐÈ lớp trên (SQL/catalog_layers_v2.sql):
//     Dự án: loại căn + diện tích điển hình, giá điển hình, VAT, KPBT, bàn giao, nhận sổ, tiến độ
//     Toà:   loại căn (⊂ dự án) + diện tích theo loại, giá điển hình, bàn giao  (trống = dự án)
//     Căn:   loại căn (⊂ toà), tầng, hướng, diện tích, giá                    (trống = toà → dự án)
//   Mọi chỗ trong app lấy giá trị HIỆU LỰC qua các hàm ở đây (unitArea, unitPrice, buildingPrice,
//   buildingHandover...) để form khách, bảng tính vay, màn Giỏ hàng luôn khớp nhau.

const Catalog = (() => {
  const LS_CACHE = 'crm_catalog_v2';
  let cacheKey = null, scopeEpoch = 0;
  const empty = () => ({ projects: [], buildings: [], units: [], projectTypes: [], buildingTypes: [] });
  const STATUS = { available: 'Còn', holding: 'Giữ chỗ', sold: 'Đã bán' };
  let data = { projects: [], buildings: [], units: [], projectTypes: [], buildingTypes: [] };
  const listeners = [];

  function scope(userId) {
    scopeEpoch++; cacheKey = userId ? LS_CACHE + ':' + userId : null; data = empty();
    try { const c = cacheKey && JSON.parse(localStorage.getItem(cacheKey)); if (c && c.projects) data = Object.assign(empty(), c); } catch {}
    reindex();
  }
  let projectIndex = new Map(), buildingIndex = new Map(), unitsIndex = new Map();
  function reindex() {
    projectIndex = new Map(data.projects.map((p) => [p.id, p]));
    buildingIndex = new Map(data.buildings.map((b) => [b.id, b]));
    unitsIndex = new Map(); for (const u of data.units) { if (!unitsIndex.has(u.building_id)) unitsIndex.set(u.building_id, []); unitsIndex.get(u.building_id).push(u); }
  }


  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const byOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0) ||
    String(a.created_at || '').localeCompare(String(b.created_at || ''));
  // Loại căn: theo thứ tự danh sách chuẩn APT_TYPES (Studio, 1N…), loại tự gõ xếp sau
  const typeRank = (t) => { const L = typeof APT_TYPES !== 'undefined' ? APT_TYPES : []; const i = L.indexOf(t); return i < 0 ? 99 : i; };
  const byTypeOrder = (a, b) => typeRank(a.apt_type) - typeRank(b.apt_type) || String(a.apt_type).localeCompare(String(b.apt_type));
  const byCode = (a, b) => String(a.code).localeCompare(String(b.code), 'vi', { numeric: true });

  function online() { return typeof sb !== 'undefined' && sb && (typeof CRM === 'undefined' || CRM.isOnline()); }
  function needOnline() { if (!online()) throw new Error('Cần có mạng để sửa giỏ hàng.'); }
  function emit() {
    reindex();
    try { if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* bỏ qua */ }
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[catalog] listener', e); } });
  }
  function check(r) { if (r.error) throw r.error; return r.data; }

  async function load() {
    if (!online()) return false;
    const epoch = scopeEpoch, client = sb;
    const read = (table, columns) => CRMFetch.all(client, table, columns, () => epoch === scopeEpoch);
    try {
      const [p, b, u, pt, bt] = await Promise.all([
        read('projects', 'id,name,typical_price_per_m2,vat_rate,kpbt_rate,handover_date,title_after_months,payment_schedule,sort_order,created_at'),
        read('buildings', 'id,project_id,code,approved_price_per_m2,handover_date,note,sort_order,created_at'),
        read('units', 'id,project_id,building_id,code,area_m2,floor,direction,apt_type,price_per_m2_override,net_price_override,status,note'),
        read('project_apt_types', 'id,project_id,apt_type,typical_area_m2,sort_order'),
        read('building_apt_types', 'id,building_id,project_id,apt_type,area_m2'),
      ]);
      if (epoch !== scopeEpoch) return false;
      data = { projects: p.sort(byOrder), buildings: b.sort(byOrder), units: u.sort(byCode),
               projectTypes: pt.sort(byTypeOrder), buildingTypes: bt };
      emit();
      return true;
    } catch (e) { console.warn('[catalog] load lỗi, dùng cache:', e.message || e); return false; }
  }

  // ---------- Đọc ----------
  const projects = () => data.projects;
  const project = (id) => projectIndex.get(id) || null;
  const projectByName = (name) => (norm(name) && data.projects.find((p) => norm(p.name) === norm(name))) || null;
  const buildingsOf = (projectId) => data.buildings.filter((b) => b.project_id === projectId).sort(byCode);
  const building = (id) => buildingIndex.get(id) || null;
  const buildingByCode = (projectId, code) =>
    (norm(code) && data.buildings.find((b) => b.project_id === projectId && norm(b.code) === norm(code))) || null;
  const unitsOf = (buildingId) => unitsIndex.get(buildingId) || [];
  const unitByCode = (buildingId, code) =>
    (norm(code) && data.units.find((u) => u.building_id === buildingId && norm(u.code) === norm(code))) || null;
  const unitsOfProject = (projectId) => data.units.filter((u) => u.project_id === projectId);
  // ---------- Giá trị HIỆU LỰC (đã áp ghi đè) ----------
  const projectPrice = (p) => (p && p.typical_price_per_m2 ? +p.typical_price_per_m2 : null);
  // Giá điển hình của toà: riêng của toà > dự án
  function buildingPrice(b) {
    if (!b) return null;
    return b.approved_price_per_m2 ? +b.approved_price_per_m2 : projectPrice(project(b.project_id));
  }
  // Đơn giá của căn: riêng của căn > toà > dự án
  function unitPrice(u) {
    if (!u) return null;
    if (u.price_per_m2_override) return +u.price_per_m2_override;
    return buildingPrice(building(u.building_id)) || projectPrice(project(u.project_id));
  }
  // Nguồn của giá trị: 'căn' | 'toà' | 'dự án' | null
  function unitPriceSource(u) {
    if (!u) return null;
    if (u.price_per_m2_override) return 'căn';
    const b = building(u.building_id);
    if (b && b.approved_price_per_m2) return 'toà';
    return projectPrice(project(u.project_id)) ? 'dự án' : null;
  }
  const buildingPriceSource = (b) => (b && b.approved_price_per_m2 ? 'toà' : projectPrice(b && project(b.project_id)) ? 'dự án' : null);
  // Bàn giao dự kiến: riêng của toà > dự án
  function buildingHandover(b) {
    if (!b) return null;
    const p = project(b.project_id);
    return b.handover_date || (p && p.handover_date) || null;
  }
  const buildingHandoverSource = (b) => (b && b.handover_date ? 'toà' : buildingHandover(b) ? 'dự án' : null);
  function unitAreaSource(u) {
    if (!u) return null;
    if (u.area_m2) return 'căn';
    const bt = data.buildingTypes.find((x) => x.building_id === u.building_id && x.apt_type === u.apt_type);
    if (bt && bt.area_m2) return 'toà';
    return typicalArea(u.project_id, null, u.apt_type) ? 'dự án' : null;
  }
  const statusLabel = (s) => STATUS[s] || STATUS.available;

  // ---------- Loại căn + diện tích điển hình ----------
  // Loại căn của dự án: [{ apt_type, typical_area_m2 }]
  const projectTypes = (projectId) => data.projectTypes.filter((t) => t.project_id === projectId);
  // Loại căn ĐÃ KHAI BÁO riêng cho toà (có thể rỗng = toà dùng mọi loại của dự án)
  const buildingTypeRows = (buildingId) => data.buildingTypes.filter((t) => t.building_id === buildingId);
  // Loại căn HIỆU LỰC của toà: [{ apt_type, area, source: 'toà' | 'dự án' | null }]
  function buildingTypes(buildingId) {
    const b = building(buildingId);
    if (!b) return [];
    const own = buildingTypeRows(buildingId);
    return projectTypes(b.project_id)
      .filter((pt) => !own.length || own.some((x) => x.apt_type === pt.apt_type))
      .map((pt) => {
        const bt = own.find((x) => x.apt_type === pt.apt_type);
        const area = (bt && bt.area_m2) || pt.typical_area_m2 || null;
        return { apt_type: pt.apt_type, area: area ? +area : null,
                 source: bt && bt.area_m2 ? 'toà' : pt.typical_area_m2 ? 'dự án' : null };
      });
  }
  // Diện tích điển hình của 1 loại căn: toà > dự án
  function typicalArea(projectId, buildingId, aptType) {
    if (!aptType) return null;
    const bt = buildingId && data.buildingTypes.find((x) => x.building_id === buildingId && x.apt_type === aptType);
    if (bt && bt.area_m2) return +bt.area_m2;
    const pt = data.projectTypes.find((x) => x.project_id === projectId && x.apt_type === aptType);
    return pt && pt.typical_area_m2 ? +pt.typical_area_m2 : null;
  }
  // Diện tích hiệu lực của căn: riêng của căn > toà > dự án
  function unitArea(u) {
    if (!u) return null;
    return u.area_m2 ? +u.area_m2 : typicalArea(u.project_id, u.building_id, u.apt_type);
  }

  // ---------- Ghi ----------
  async function addProject(name, extra) {
    needOnline();
    name = String(name || '').trim();
    if (!name) throw new Error('Thiếu tên dự án');
    const ex = projectByName(name);
    if (ex) return ex;
    const row = check(await sb.from('projects').insert(Object.assign({ name }, extra || {})).select().single());
    data.projects.push(row); emit();
    return row;
  }
  async function updateProject(id, patch) {
    needOnline();
    const row = check(await sb.from('projects').update(patch).eq('id', id).select().single());
    Object.assign(project(id), row); emit();
    return row;
  }
  async function deleteProject(id) {
    needOnline();
    check(await sb.from('projects').delete().eq('id', id));
    const bIds = data.buildings.filter((b) => b.project_id === id).map((b) => b.id);
    data.projects = data.projects.filter((p) => p.id !== id);
    data.buildings = data.buildings.filter((b) => b.project_id !== id);
    data.units = data.units.filter((u) => u.project_id !== id && !bIds.includes(u.building_id));
    data.projectTypes = data.projectTypes.filter((t) => t.project_id !== id);
    data.buildingTypes = data.buildingTypes.filter((t) => t.project_id !== id);
    emit();
  }
  async function saveBuilding(b) { // có id → sửa, không → thêm
    needOnline();
    const payload = { project_id: b.project_id, code: String(b.code || '').trim(),
                      approved_price_per_m2: b.approved_price_per_m2 || null, handover_date: b.handover_date || null };
    if (!payload.code) throw new Error('Thiếu mã toà');
    if (b.id) {
      const row = check(await sb.from('buildings').update(payload).eq('id', b.id).select().single());
      Object.assign(building(b.id), row);
    } else {
      data.buildings.push(check(await sb.from('buildings').insert(payload).select().single()));
    }
    emit();
  }
  async function updateBuilding(id, patch) {
    needOnline();
    const row = check(await sb.from('buildings').update(patch).eq('id', id).select().single());
    Object.assign(building(id), row); emit();
    return row;
  }
  async function deleteBuilding(id) {
    needOnline();
    check(await sb.from('buildings').delete().eq('id', id));
    data.buildings = data.buildings.filter((b) => b.id !== id);
    data.units = data.units.filter((u) => u.building_id !== id);
    data.buildingTypes = data.buildingTypes.filter((t) => t.building_id !== id);
    emit();
  }
  async function saveUnit(u) {
    needOnline();
    const b = building(u.building_id);
    if (!b) throw new Error('Căn phải thuộc 1 toà');
    const payload = {
      project_id: b.project_id, building_id: b.id, building: b.code, code: String(u.code || '').trim(),
      area_m2: u.area_m2 || null, floor: u.floor || null, direction: u.direction || null, apt_type: u.apt_type || null,
      price_per_m2_override: u.price_per_m2_override || null, status: u.status || 'available',
    };
    if (!payload.code) throw new Error('Thiếu mã căn');
    if (await ensureTypes([payload])) await load(); // loại căn mới → khai báo trước (ràng buộc DB)
    if (u.id) {
      const row = check(await sb.from('units').update(payload).eq('id', u.id).select().single());
      Object.assign(data.units.find((x) => x.id === u.id), row);
    } else {
      data.units.push(check(await sb.from('units').insert(payload).select().single()));
    }
    data.units.sort(byCode); emit();
  }
  async function deleteUnit(id) {
    needOnline();
    check(await sb.from('units').delete().eq('id', id));
    data.units = data.units.filter((u) => u.id !== id); emit();
  }

  // Căn mang loại căn chưa khai báo → tự thêm vào dự án (và vào toà nếu toà đã có danh sách riêng)
  async function ensureTypes(units) {
    const pNeed = new Map(), bNeed = new Map();
    units.forEach((u) => {
      if (!u.apt_type) return;
      if (!data.projectTypes.some((t) => t.project_id === u.project_id && t.apt_type === u.apt_type)) {
        pNeed.set(u.project_id + '|' + u.apt_type, { project_id: u.project_id, apt_type: u.apt_type });
      }
      const own = buildingTypeRows(u.building_id);
      if (own.length && !own.some((t) => t.apt_type === u.apt_type)) {
        bNeed.set(u.building_id + '|' + u.apt_type, { building_id: u.building_id, project_id: u.project_id, apt_type: u.apt_type });
      }
    });
    if (pNeed.size) check(await sb.from('project_apt_types').upsert([...pNeed.values()], { onConflict: 'project_id,apt_type', ignoreDuplicates: true }));
    if (bNeed.size) check(await sb.from('building_apt_types').upsert([...bNeed.values()], { onConflict: 'building_id,apt_type', ignoreDuplicates: true }));
    return pNeed.size + bNeed.size > 0;
  }

  // Loại căn của dự án: thêm / sửa (đổi tên → DB tự đổi theo ở toà + căn), xoá (toà mất theo)
  async function saveProjectType(t) {
    needOnline();
    const payload = { project_id: t.project_id, apt_type: String(t.apt_type || '').trim(), typical_area_m2: t.typical_area_m2 || null };
    if (!payload.apt_type) throw new Error('Thiếu tên loại căn');
    if (t.id) check(await sb.from('project_apt_types').update(payload).eq('id', t.id));
    else check(await sb.from('project_apt_types').insert(payload));
    await load();
  }
  async function deleteProjectType(id) {
    needOnline();
    check(await sb.from('project_apt_types').delete().eq('id', id));
    await load();
  }
  // Ghi lại toàn bộ loại căn của 1 toà: rows = [{ apt_type, area_m2 }] (rỗng = dùng mọi loại của dự án)
  async function setBuildingTypes(buildingId, rows) {
    needOnline();
    const b = building(buildingId);
    check(await sb.from('building_apt_types').delete().eq('building_id', buildingId));
    if (rows.length) {
      check(await sb.from('building_apt_types').insert(rows.map((r) => ({
        building_id: buildingId, project_id: b.project_id, apt_type: r.apt_type, area_m2: r.area_m2 || null,
      }))));
    }
    await load();
  }

  // ---------- Nhập hàng loạt (Excel) ----------
  // rows: [{ project, building, buildingPrice?, code?, area_m2?, floor?, direction?, apt_type?,
  //          price_per_m2_override?, status? }]. `cols` = các field CÓ cột trong file — chỉ
  // field đó được ghi (ô trống → xoá giá trị), field không có cột giữ nguyên dữ liệu cũ.
  async function importRows(rows, cols) {
    needOnline();
    const stat = { projects: 0, buildings: 0, units: 0 };
    // 1) Dự án chưa có → tạo
    const names = [...new Set(rows.map((r) => r.project).filter(Boolean))];
    const missing = names.filter((n) => !projectByName(n));
    if (missing.length) {
      const ins = check(await sb.from('projects').insert(missing.map((name) => ({ name }))).select());
      data.projects.push(...ins); stat.projects = ins.length;
    }
    // 2) Toà: có cột giá → upsert kèm giá; không → chỉ thêm toà chưa có
    const bMap = new Map();
    rows.forEach((r) => {
      const p = projectByName(r.project);
      if (!p || !r.building) return;
      const key = p.id + '|' + norm(r.building);
      const cur = bMap.get(key) || { project_id: p.id, code: String(r.building).trim() };
      if (cols.buildingPrice && r.buildingPrice != null) cur.approved_price_per_m2 = r.buildingPrice;
      bMap.set(key, cur);
    });
    const bRows = [...bMap.values()];
    const before = data.buildings.length;
    const withPrice = bRows.filter((b) => 'approved_price_per_m2' in b);
    const noPrice = bRows.filter((b) => !('approved_price_per_m2' in b));
    if (withPrice.length) check(await sb.from('buildings').upsert(withPrice, { onConflict: 'project_id,code' }));
    if (noPrice.length) check(await sb.from('buildings').upsert(noPrice, { onConflict: 'project_id,code', ignoreDuplicates: true }));
    data.buildings = (await CRMFetch.all(sb, 'buildings', 'id,project_id,code,approved_price_per_m2,handover_date,note,sort_order,created_at')).sort(byOrder); reindex();
    stat.buildings = data.buildings.length - before;
    // 3) Căn: upsert theo (toà, mã căn)
    const FIELDS = ['area_m2', 'floor', 'direction', 'apt_type', 'price_per_m2_override', 'status'];
    const uMap = new Map();
    rows.forEach((r) => {
      if (!r.code) return;
      const p = projectByName(r.project), b = p && buildingByCode(p.id, r.building);
      if (!b) return;
      const u = { project_id: p.id, building_id: b.id, building: b.code, code: String(r.code).trim() };
      FIELDS.forEach((f) => { if (cols[f]) u[f] = r[f] == null || r[f] === '' ? (f === 'status' ? 'available' : null) : r[f]; });
      uMap.set(b.id + '|' + norm(u.code), u); // trùng dòng → lấy dòng sau
    });
    const uRows = [...uMap.values()];
    if (await ensureTypes(uRows)) await load(); // khai báo loại căn mới TRƯỚC khi ghi căn (DB kiểm tra)
    for (let i = 0; i < uRows.length; i += 500) { // chia lô cho file lớn
      check(await sb.from('units').upsert(uRows.slice(i, i + 500), { onConflict: 'building_id,code' }));
    }
    stat.units = uRows.length;
    await load();
    return stat;
  }

  return {
    STATUS, load, scope, units: () => data.units, onChange: (fn) => listeners.push(fn),
    projects, project, projectByName, buildingsOf, building, buildingByCode,
    unitsOf, unitByCode, unitsOfProject, unitPrice, statusLabel,
    projectTypes, buildingTypeRows, buildingTypes, typicalArea, unitArea, unitAreaSource,
    projectPrice, buildingPrice, buildingPriceSource, unitPriceSource, buildingHandover, buildingHandoverSource,
    addProject, updateProject, deleteProject, saveBuilding, updateBuilding, deleteBuilding, saveUnit, deleteUnit, importRows,
    saveProjectType, deleteProjectType, setBuildingTypes,
  };
})();
