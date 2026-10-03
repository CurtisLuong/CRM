// catalog.js — GIỎ HÀNG: Dự án → Toà → Căn (bảng projects / buildings / units).
// Nguồn dữ liệu DUY NHẤT cho: danh sách dự án ở form khách, gợi ý mã toà/mã căn,
// bảng tính vay (js/loan/), và màn "Giỏ hàng" (js/catalog-ui.js).
//
// - Đọc: nạp 1 lần lúc vào app (Catalog.load) + cache localStorage → mở offline được.
// - Ghi (thêm/sửa/xoá/nhập Excel): cần mạng, ghi thẳng Supabase rồi nạp lại.
// - Dùng biến `sb` và `CRM` của app.js lúc CHẠY (không lúc tải file) → tải file này
//   trước hay sau app.js đều được. KHÔNG đặt tên biến `supabase` (CLAUDE.md mục 5.1).
// - Schema: SQL/add_loan_module.sql + SQL/add_catalog_buildings.sql.

const Catalog = (() => {
  const LS_CACHE = 'crm_catalog_v1';
  const STATUS = { available: 'Còn', holding: 'Giữ chỗ', sold: 'Đã bán' };
  let data = { projects: [], buildings: [], units: [] };
  const listeners = [];

  try { const c = JSON.parse(localStorage.getItem(LS_CACHE)); if (c && c.projects) data = c; } catch { /* bỏ qua */ }

  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const byOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0) ||
    String(a.created_at || '').localeCompare(String(b.created_at || ''));
  const byCode = (a, b) => String(a.code).localeCompare(String(b.code), 'vi', { numeric: true });

  function online() { return typeof sb !== 'undefined' && sb && (typeof CRM === 'undefined' || CRM.isOnline()); }
  function needOnline() { if (!online()) throw new Error('Cần có mạng để sửa giỏ hàng.'); }
  function emit() {
    try { localStorage.setItem(LS_CACHE, JSON.stringify(data)); } catch { /* bỏ qua */ }
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[catalog] listener', e); } });
  }
  function check(r) { if (r.error) throw r.error; return r.data; }

  async function load() {
    if (!online()) return false;
    try {
      const [p, b, u] = await Promise.all([
        sb.from('projects').select('id,name,vat_rate,kpbt_rate,handover_date,title_after_months,payment_schedule,sort_order,created_at'),
        sb.from('buildings').select('id,project_id,code,approved_price_per_m2,note,sort_order,created_at'),
        sb.from('units').select('id,project_id,building_id,code,area_m2,floor,direction,apt_type,price_per_m2_override,net_price_override,status,note'),
      ]);
      data = { projects: check(p).sort(byOrder), buildings: check(b).sort(byOrder), units: check(u).sort(byCode) };
      emit();
      return true;
    } catch (e) { console.warn('[catalog] load lỗi, dùng cache:', e.message || e); return false; }
  }

  // ---------- Đọc ----------
  const projects = () => data.projects;
  const project = (id) => data.projects.find((p) => p.id === id) || null;
  const projectByName = (name) => (norm(name) && data.projects.find((p) => norm(p.name) === norm(name))) || null;
  const buildingsOf = (projectId) => data.buildings.filter((b) => b.project_id === projectId).sort(byCode);
  const building = (id) => data.buildings.find((b) => b.id === id) || null;
  const buildingByCode = (projectId, code) =>
    (norm(code) && data.buildings.find((b) => b.project_id === projectId && norm(b.code) === norm(code))) || null;
  const unitsOf = (buildingId) => data.units.filter((u) => u.building_id === buildingId);
  const unitByCode = (buildingId, code) =>
    (norm(code) && data.units.find((u) => u.building_id === buildingId && norm(u.code) === norm(code))) || null;
  const unitsOfProject = (projectId) => data.units.filter((u) => u.project_id === projectId);
  // Đơn giá áp cho căn: giá riêng của căn > giá duyệt của toà
  function unitPrice(u) {
    if (u && u.price_per_m2_override) return +u.price_per_m2_override;
    const b = u && building(u.building_id);
    return b && b.approved_price_per_m2 ? +b.approved_price_per_m2 : null;
  }
  const statusLabel = (s) => STATUS[s] || STATUS.available;

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
    emit();
  }
  async function saveBuilding(b) { // có id → sửa, không → thêm
    needOnline();
    const payload = { project_id: b.project_id, code: String(b.code || '').trim(),
                      approved_price_per_m2: b.approved_price_per_m2 || null, note: b.note || null };
    if (!payload.code) throw new Error('Thiếu mã toà');
    if (b.id) {
      const row = check(await sb.from('buildings').update(payload).eq('id', b.id).select().single());
      Object.assign(building(b.id), row);
    } else {
      data.buildings.push(check(await sb.from('buildings').insert(payload).select().single()));
    }
    emit();
  }
  async function deleteBuilding(id) {
    needOnline();
    check(await sb.from('buildings').delete().eq('id', id));
    data.buildings = data.buildings.filter((b) => b.id !== id);
    data.units = data.units.filter((u) => u.building_id !== id);
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
    data.buildings = check(await sb.from('buildings').select('id,project_id,code,approved_price_per_m2,note,sort_order,created_at')).sort(byOrder);
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
    for (let i = 0; i < uRows.length; i += 500) { // chia lô cho file lớn
      check(await sb.from('units').upsert(uRows.slice(i, i + 500), { onConflict: 'building_id,code' }));
    }
    stat.units = uRows.length;
    await load();
    return stat;
  }

  return {
    STATUS, load, onChange: (fn) => listeners.push(fn),
    projects, project, projectByName, buildingsOf, building, buildingByCode,
    unitsOf, unitByCode, unitsOfProject, unitPrice, statusLabel,
    addProject, updateProject, deleteProject, saveBuilding, deleteBuilding, saveUnit, deleteUnit, importRows,
  };
})();
