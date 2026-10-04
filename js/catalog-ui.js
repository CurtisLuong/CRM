// catalog-ui.js — Màn "Giỏ hàng" (menu avatar → Giỏ hàng): quản lý Dự án → Toà → Căn.
// 3 cách nhập dữ liệu: (1) sửa trực tiếp ở đây, (2) Nhập Excel (file mẫu tải tại đây),
// (3) sửa thẳng trong Supabase Table Editor (bảng projects / buildings / units).
// Tải SAU app.js: dùng $, escapeHtml, showToast, loadXLSX, APT_TYPES, renameProjectInCustomers.
// Dữ liệu: js/catalog.js (Catalog).

(() => {
  const modal = $('#catalog-modal');
  const body = $('#cat-body');
  const statusEl = $('#cat-status');
  const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Bắc', 'Đông Nam', 'Tây Bắc', 'Tây Nam'];
  const openP = new Set(), openB = new Set(); // dự án / toà đang mở (giữ khi vẽ lại)
  let editingUnit = null;                     // id căn đang sửa
  let pendingImport = null;                   // { rows, cols, fileName }
  const schedDraft = new Map();               // pid → tiến độ đang sửa (chưa lưu)

  const fmt = (n) => (n == null || n === '' ? '' : Math.round(+n).toLocaleString('vi-VN'));
  const digits = (s) => { const d = String(s == null ? '' : s).replace(/[^\d]/g, ''); return d ? +d : null; };
  const num = (s) => { // "53,6" / 53.6 / "53.6 m²" → 53.6
    if (typeof s === 'number') return s;
    const t = String(s == null ? '' : s).replace(/[^\d,.\-]/g, '').replace(',', '.');
    return t === '' || isNaN(+t) ? null : +t;
  };
  const noAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  function setStatus(msg) { statusEl.textContent = msg || ''; }
  async function run(fn, okMsg) {
    try { setStatus('⏳ Đang lưu…'); await fn(); setStatus(''); if (okMsg) showToast(okMsg); render(); }
    catch (e) { console.warn('[catalog-ui]', e); setStatus('⚠️ ' + (e.message || e)); }
  }

  // ---------- Vẽ ----------
  const moneyInp = (name, v, ph) => `<input name="${name}" inputmode="numeric" data-money value="${fmt(v)}" placeholder="${ph || ''}">`;
  const opt = (v, cur, label) => `<option value="${escapeHtml(v)}"${v === (cur || '') ? ' selected' : ''}>${escapeHtml(label == null ? v : label)}</option>`;

  function unitRowEdit(u, bid) {
    u = u || {};
    return `<tr class="cat-edit" data-form="${u.id ? 'unit' : 'unit-add'}" data-uid="${u.id || ''}" data-bid="${bid}">
      <td><input name="code" value="${escapeHtml(u.code || '')}" placeholder="Mã căn"></td>
      <td><input name="area_m2" inputmode="decimal" value="${u.area_m2 ?? ''}" placeholder="${Catalog.typicalArea(Catalog.building(bid).project_id, bid, u.apt_type) || 'theo loại'}"></td>
      <td><input name="floor" inputmode="numeric" value="${u.floor ?? ''}"></td>
      <td><select name="direction">${opt('', u.direction, '—')}${DIRECTIONS.map((d) => opt(d, u.direction)).join('')}</select></td>
      <td><input name="apt_type" list="cat-types-${bid}" value="${escapeHtml(u.apt_type || '')}"></td>
      <td>${moneyInp('price_per_m2_override', u.price_per_m2_override, 'theo toà')}</td>
      <td><select name="status">${Object.entries(Catalog.STATUS).map(([k, l]) => opt(k, u.status || 'available', l)).join('')}</select></td>
      <td class="cat-act">${u.id
        ? '<button type="button" data-act="unit-save" class="btn-small">Lưu</button><button type="button" data-act="unit-cancel" class="btn-small">Huỷ</button>'
        : '<button type="button" data-act="unit-add" class="btn-small">＋ Thêm</button>'}</td></tr>`;
  }
  function unitRow(u) {
    return `<tr class="${u.status === 'sold' ? 'is-sold' : ''}"><td><b>${escapeHtml(u.code)}</b></td>
      <td>${u.area_m2 != null ? u.area_m2 : (Catalog.unitArea(u) ? `<span class="cat-muted" title="Diện tích điển hình của loại căn">${Catalog.unitArea(u)}</span>` : '')}</td><td>${u.floor ?? ''}</td><td>${escapeHtml(u.direction || '')}</td>
      <td>${escapeHtml(u.apt_type || '')}</td><td>${u.price_per_m2_override ? fmt(u.price_per_m2_override) : '<span class="cat-muted">theo toà</span>'}</td>
      <td>${Catalog.statusLabel(u.status)}</td>
      <td class="cat-act"><button type="button" data-act="unit-edit" data-uid="${u.id}" class="btn-small">Sửa</button>
        <button type="button" data-act="unit-del" data-uid="${u.id}" class="btn-small" aria-label="Xoá căn">✕</button></td></tr>`;
  }
  // Loại căn của toà: tích chọn trong các loại của dự án + chỉnh diện tích theo toà
  function buildingTypesHtml(b) {
    const pts = Catalog.projectTypes(b.project_id);
    if (!pts.length) return '<div class="cat-types-note">Dự án chưa có loại căn — khai báo ở mục "Loại căn của dự án" phía trên.</div>';
    const own = Catalog.buildingTypeRows(b.id);
    return `<div class="cat-types" data-form="building-types" data-bid="${b.id}">
      <div class="cat-types-title">Loại căn của toà <span class="cat-muted">(không tích loại nào = dùng tất cả loại của dự án)</span></div>
      ${pts.map((pt) => {
        const bt = own.find((x) => x.apt_type === pt.apt_type);
        return `<label class="cat-type-chk"><input type="checkbox" data-type-chk value="${escapeHtml(pt.apt_type)}"${bt ? ' checked' : ''}>
          <span>${escapeHtml(pt.apt_type)}</span>
          <input data-type-area="${escapeHtml(pt.apt_type)}" inputmode="decimal" value="${bt && bt.area_m2 ? bt.area_m2 : ''}"
            placeholder="${pt.typical_area_m2 ? pt.typical_area_m2 + ' (dự án)' : 'm²'}" title="Diện tích điển hình riêng của toà (trống = theo dự án)"> m²</label>`;
      }).join('')}
      <button type="button" data-act="building-types-save" class="btn-small">Lưu loại căn của toà</button></div>`;
  }
  // ---------- Tiến độ thanh toán của dự án (projects.payment_schedule; null = mặc định 7 đợt) ----------
  // Cách chia VAT / KPBT theo đợt: xem calcMilestones trong js/loan/loan-engine.js.
  const DUE = [['offsetDays', 'Sau ký HĐ (ngày)'], ['handover', 'Ngày bàn giao'], ['afterHandoverMonths', 'Sau bàn giao (tháng)'], ['date', 'Ngày cố định']];
  const ROLE = [['', 'Thường'], ['handover', 'Bàn giao (+KPBT)'], ['title', 'Nhận sổ (không VAT)']];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function schedOf(p) {
    if (!schedDraft.has(p.id)) schedDraft.set(p.id, clone(p.payment_schedule && p.payment_schedule.length ? p.payment_schedule : LoanEngine.DEFAULT_SCHEDULE));
    return schedDraft.get(p.id);
  }
  function schedMeta(rows) {
    const total = Math.round(rows.reduce((s, m) => s + (+m.pct || 0), 0) * 100) / 100;
    let vat = [];
    try { vat = LoanEngine.vatPercents(rows); } catch { /* đang nhập dở */ }
    return { total, vat, errors: LoanEngine.validateSchedule(rows) };
  }
  function scheduleHtml(p) {
    const rows = schedOf(p);
    const custom = !!(p.payment_schedule && p.payment_schedule.length);
    const dirty = JSON.stringify(rows) !== JSON.stringify(custom ? p.payment_schedule : LoanEngine.DEFAULT_SCHEDULE);
    const m = schedMeta(rows);
    return `<div class="cat-types cat-sched" data-form="schedule" data-pid="${p.id}">
      <div class="cat-types-title">Tiến độ thanh toán ·
        ${custom ? `<b>riêng của dự án (${p.payment_schedule.length} đợt)</b>` : '<span class="cat-muted">đang dùng mặc định 7 đợt — sửa rồi bấm Lưu để tạo tiến độ riêng</span>'}
        ${dirty ? ' <span class="cat-dirty">• chưa lưu</span>' : ''}</div>
      <div class="cat-table-wrap"><table class="cat-units cat-sched-table"><thead><tr>
        <th>#</th><th>Tên đợt</th><th>% giá trị</th><th>Thời điểm</th><th></th><th>Loại đợt</th><th>% VAT</th><th></th></tr></thead><tbody>
        ${rows.map((r, i) => {
          const d = r.due || { type: 'offsetDays', value: 0 };
          const valInp = r.role === 'title' ? `<span class="cat-muted" title="Sửa ở ô 'Nhận sổ sau BG' của dự án">${String(+p.title_after_months || 1.5).replace('.', ',')} tháng (theo dự án)</span>`
            : d.type === 'handover' ? '<span class="cat-muted">—</span>'
            : d.type === 'date' ? `<input data-s="value" data-i="${i}" type="date" value="${escapeHtml(d.value || '')}">`
            : `<input data-s="value" data-i="${i}" inputmode="decimal" value="${d.value ?? ''}" style="width:70px">`;
          return `<tr><td>${i + 1}</td>
            <td><input data-s="label" data-i="${i}" value="${escapeHtml(r.label || '')}" placeholder="Đợt ${i + 1}"></td>
            <td><input data-s="pct" data-i="${i}" inputmode="decimal" value="${r.pct ?? ''}" style="width:64px"></td>
            <td>${r.role === 'title' ? '<span class="cat-muted">Sau bàn giao</span>'
              : `<select data-s="dueType" data-i="${i}">${DUE.map(([v, l]) => opt(v, d.type, l)).join('')}</select>`}</td>
            <td>${valInp}</td>
            <td><select data-s="role" data-i="${i}">${ROLE.map(([v, l]) => opt(v, r.role || '', l)).join('')}</select></td>
            <td class="cat-vat" data-vat="${i}">${m.vat[i] != null ? m.vat[i] + '%' : ''}</td>
            <td class="cat-act"><button type="button" data-act="sched-del" data-i="${i}" class="btn-small" aria-label="Xoá đợt">✕</button></td></tr>`;
        }).join('')}
      </tbody></table></div>
      <div class="cat-sched-foot"><span data-sched-total>Tổng: <b>${m.total}%</b></span>
        <span class="cat-sched-err" data-sched-err>${m.errors.map(escapeHtml).join(' · ')}</span></div>
      <div class="cat-sched-btns">
        <button type="button" data-act="sched-add" class="btn-small">＋ Thêm đợt</button>
        <button type="button" data-act="sched-save" class="btn-small">Lưu tiến độ</button>
        ${dirty ? '<button type="button" data-act="sched-undo" class="btn-small">Huỷ thay đổi</button>' : ''}
        ${custom ? '<button type="button" data-act="sched-default" class="btn-small btn-danger">Về mặc định 7 đợt</button>' : ''}
      </div>
      <div class="cat-muted">VAT: đợt nào vào X% giá trị căn thì vào X% tổng VAT; đợt nhận sổ không VAT — phần đó dồn vào đợt ngay trước nó. KPBT thu ở đợt bàn giao. Ngân hàng giải ngân từ đợt 2.</div>
    </div>`;
  }
  // Sửa 1 ô trong bảng tiến độ → cập nhật bản nháp + % VAT / tổng tại chỗ (không vẽ lại, giữ con trỏ)
  function onSchedInput(el) {
    const box = el.closest('[data-form="schedule"]');
    const p = Catalog.project(box.dataset.pid), rows = schedOf(p), i = +el.dataset.i, r = rows[i], k = el.dataset.s;
    if (k === 'label') r.label = el.value;
    if (k === 'pct') r.pct = num(el.value);
    if (k === 'value') r.due = Object.assign({}, r.due, { value: r.due && r.due.type === 'date' ? el.value : num(el.value) });
    if (k === 'dueType' || k === 'role') {
      if (k === 'dueType') r.due = { type: el.value, value: el.value === 'handover' ? undefined : el.value === 'date' ? '' : 0 };
      if (k === 'role') {
        if (el.value) r.role = el.value; else delete r.role;
        if (el.value === 'handover') r.due = { type: 'handover' };
        if (el.value === 'title') r.due = { type: 'afterHandoverMonths', value: +p.title_after_months || 1.5 };
      }
      render(); return;
    }
    const m = schedMeta(rows);
    box.querySelectorAll('[data-vat]').forEach((td) => { const v = m.vat[+td.dataset.vat]; td.textContent = v != null ? v + '%' : ''; });
    box.querySelector('[data-sched-total]').innerHTML = `Tổng: <b>${m.total}%</b>`;
    box.querySelector('[data-sched-err]').textContent = m.errors.join(' · ');
  }

  // Loại căn của dự án + diện tích điển hình chung
  function projectTypesHtml(p) {
    const rows = Catalog.projectTypes(p.id);
    return `<div class="cat-types cat-ptypes">
      <div class="cat-types-title">Loại căn của dự án <span class="cat-muted">· diện tích điển hình (căn có diện tích riêng sẽ ghi đè)</span></div>
      ${rows.map((t) => `<div class="cat-ptype" data-form="ptype" data-tid="${t.id}" data-pid="${p.id}">
        <input name="apt_type" list="cat-apt-types" value="${escapeHtml(t.apt_type)}">
        <input name="typical_area_m2" inputmode="decimal" value="${t.typical_area_m2 ?? ''}" placeholder="m²"> m²
        <button type="button" data-act="ptype-save" class="btn-small">Lưu</button>
        <button type="button" data-act="ptype-del" class="btn-small" aria-label="Xoá loại căn">✕</button></div>`).join('')}
      <div class="cat-ptype" data-form="ptype-add" data-pid="${p.id}">
        <input name="apt_type" list="cat-apt-types" placeholder="Loại căn (VD: 2N-2WC)">
        <input name="typical_area_m2" inputmode="decimal" placeholder="m²"> m²
        <button type="button" data-act="ptype-add" class="btn-small">＋ Thêm</button></div></div>`;
  }
  function buildingHtml(b) {
    const units = Catalog.unitsOf(b.id);
    const isOpen = openB.has(b.id);
    return `<details class="cat-b" data-bid="${b.id}"${isOpen ? ' open' : ''}>
      <summary><b>Toà ${escapeHtml(b.code)}</b> · ${b.approved_price_per_m2 ? fmt(b.approved_price_per_m2) + ' đ/m²' : '<span class="cat-muted">chưa có giá duyệt</span>'} · ${units.length} căn</summary>
      ${isOpen ? `<div class="cat-row" data-form="building" data-bid="${b.id}">
        <label>Mã toà<input name="code" value="${escapeHtml(b.code)}"></label>
        <label>Giá duyệt (đ/m²)${moneyInp('approved_price_per_m2', b.approved_price_per_m2)}</label>
        <button type="button" data-act="building-save" class="btn-small">Lưu toà</button>
        <button type="button" data-act="building-del" class="btn-small btn-danger">Xoá toà</button></div>
      ${buildingTypesHtml(b)}
      <datalist id="cat-types-${b.id}">${Catalog.buildingTypes(b.id).map((t) => `<option value="${escapeHtml(t.apt_type)}">`).join('')}</datalist>
      <div class="cat-table-wrap"><table class="cat-units"><thead><tr><th>Mã căn</th><th>DT (m²)</th><th>Tầng</th><th>Hướng</th><th>Loại căn</th><th>Giá riêng (đ/m²)</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        ${units.map((u) => (u.id === editingUnit ? unitRowEdit(u, b.id) : unitRow(u))).join('')}
        ${unitRowEdit(null, b.id)}
      </tbody></table></div>` : ''}
    </details>`;
  }
  function projectHtml(p) {
    const bs = Catalog.buildingsOf(p.id);
    const nU = Catalog.unitsOfProject(p.id).length;
    const isOpen = openP.has(p.id);
    return `<details class="cat-proj" data-pid="${p.id}"${isOpen ? ' open' : ''}>
      <summary><b>${escapeHtml(p.name)}</b> <span class="cat-muted">${bs.length} toà · ${nU} căn</span></summary>
      ${isOpen ? `<div class="cat-row" data-form="project" data-pid="${p.id}">
        <label class="cat-grow">Tên dự án<input name="name" value="${escapeHtml(p.name)}"></label>
        <label>Bàn giao dự kiến<input name="handover_date" type="date" value="${p.handover_date || ''}"></label>
        <label>Nhận sổ sau BG (tháng)<input name="title_after_months" inputmode="decimal" value="${p.title_after_months ?? 1.5}"></label>
        <label>VAT %<input name="vat_rate" inputmode="decimal" value="${p.vat_rate ?? 5}"></label>
        <label>KPBT %<input name="kpbt_rate" inputmode="decimal" value="${p.kpbt_rate ?? 2}"></label>
        <button type="button" data-act="project-save" class="btn-small">Lưu dự án</button>
        <button type="button" data-act="project-del" class="btn-small btn-danger">Xoá dự án</button></div>
      ${scheduleHtml(p)}
      ${projectTypesHtml(p)}
      <div class="cat-bs">${bs.map(buildingHtml).join('')}</div>
      <div class="cat-row cat-add" data-form="building-add" data-pid="${p.id}">
        <label>Mã toà mới<input name="code" placeholder="VD: S1"></label>
        <label>Giá duyệt (đ/m²)${moneyInp('approved_price_per_m2', null)}</label>
        <button type="button" data-act="building-add" class="btn-small">＋ Thêm toà</button></div>` : ''}
    </details>`;
  }
  function render() {
    if (!modal.open) return;
    const ps = Catalog.projects();
    body.innerHTML = (ps.length ? ps.map(projectHtml).join('') : '<p class="cat-muted">Chưa có dự án nào. Thêm dự án hoặc nhập file Excel.</p>') +
      `<datalist id="cat-apt-types">${APT_TYPES.map((t) => `<option value="${escapeHtml(t)}">`).join('')}</datalist>`;
  }

  // ---------- Đọc form ----------
  function readRow(row) {
    const o = {};
    row.querySelectorAll('input[name],select[name]').forEach((el) => { o[el.name] = el.hasAttribute('data-money') ? digits(el.value) : el.value.trim(); });
    return o;
  }
  function unitPayload(row) {
    const o = readRow(row);
    return { id: row.dataset.uid || null, building_id: row.dataset.bid, code: o.code, area_m2: num(o.area_m2),
             floor: o.floor ? parseInt(o.floor, 10) : null, direction: o.direction || null, apt_type: o.apt_type || null,
             price_per_m2_override: o.price_per_m2_override, status: o.status };
  }

  // ---------- Sự kiện ----------
  body.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement)) return;
    const set = d.dataset.pid ? openP : openB, id = d.dataset.pid || d.dataset.bid;
    const was = set.has(id);
    if (d.open) set.add(id); else set.delete(id);
    if (was !== d.open) render(); // vẽ phần bên trong khi mở (lười vẽ cho giỏ hàng lớn)
  }, true);

  body.addEventListener('input', (e) => { // định dạng ô tiền 19.911.530
    const el = e.target;
    if (el.hasAttribute && el.hasAttribute('data-money')) { const v = digits(el.value); el.value = v == null ? '' : fmt(v); }
  });

  body.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.s && e.target.tagName === 'INPUT') onSchedInput(e.target); });
  body.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.s && e.target.tagName === 'SELECT') onSchedInput(e.target); });

  body.addEventListener('input', (e) => { // gõ diện tích cho loại căn chưa tích → tự tích
    const a = e.target.closest && e.target.closest('[data-type-area]');
    if (a && a.value.trim()) { const cb = a.parentNode.querySelector('[data-type-chk]'); if (cb) cb.checked = true; }
  });

  body.addEventListener('keydown', (e) => { // Enter trong ô = bấm nút chính của dòng đó
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const row = e.target.closest('[data-form]');
    if (row && row.dataset.form === 'schedule') { e.preventDefault(); return; } // bảng tiến độ: Enter không làm gì
    const btn = row && row.querySelector('[data-act$="-save"],[data-act$="-add"]');
    if (btn) { e.preventDefault(); btn.click(); }
  });

  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, row = b.closest('[data-form]');
    if (act === 'project-save') {
      const o = readRow(row), p = Catalog.project(row.dataset.pid), oldName = p.name;
      const patch = { name: o.name, handover_date: o.handover_date || null, title_after_months: num(o.title_after_months) ?? 1.5,
                      vat_rate: num(o.vat_rate) ?? 5, kpbt_rate: num(o.kpbt_rate) ?? 2 };
      if (!patch.name) return setStatus('⚠️ Thiếu tên dự án');
      return run(async () => {
        await Catalog.updateProject(p.id, patch);
        if (patch.name !== oldName) await renameProjectInCustomers(oldName, patch.name);
      }, 'Đã lưu dự án');
    }
    if (act === 'project-del') {
      const p = Catalog.project(row.dataset.pid);
      const nB = Catalog.buildingsOf(p.id).length, nU = Catalog.unitsOfProject(p.id).length;
      if (!confirm(`Xoá dự án "${p.name}"${nB || nU ? ` cùng ${nB} toà, ${nU} căn` : ''}?\n(Khách đã lưu không bị ảnh hưởng)`)) return;
      return run(() => Catalog.deleteProject(p.id), 'Đã xoá dự án');
    }
    if (act === 'building-add') {
      const o = readRow(row);
      return run(() => Catalog.saveBuilding({ project_id: row.dataset.pid, code: o.code, approved_price_per_m2: o.approved_price_per_m2 }), 'Đã thêm toà');
    }
    if (act === 'building-save') {
      const o = readRow(row), bd = Catalog.building(row.dataset.bid);
      return run(() => Catalog.saveBuilding({ id: bd.id, project_id: bd.project_id, code: o.code, approved_price_per_m2: o.approved_price_per_m2 }), 'Đã lưu toà');
    }
    if (act === 'building-del') {
      const bd = Catalog.building(row.dataset.bid), n = Catalog.unitsOf(bd.id).length;
      if (!confirm(`Xoá toà "${bd.code}"${n ? ` cùng ${n} căn` : ''}?`)) return;
      return run(() => Catalog.deleteBuilding(bd.id), 'Đã xoá toà');
    }
    if (act === 'ptype-add' || act === 'ptype-save') {
      const o = readRow(row);
      const area = num(o.typical_area_m2);
      if (o.typical_area_m2 && !(area > 0)) return setStatus('⚠️ Diện tích không hợp lệ');
      return run(() => Catalog.saveProjectType({ id: row.dataset.tid || null, project_id: row.dataset.pid,
        apt_type: canonicalAptType(o.apt_type), typical_area_m2: area }), act === 'ptype-add' ? 'Đã thêm loại căn' : 'Đã lưu loại căn');
    }
    if (act === 'ptype-del') {
      const t = Catalog.projectTypes(row.dataset.pid).find((x) => x.id === row.dataset.tid);
      if (t && confirm(`Xoá loại căn "${t.apt_type}" khỏi dự án? (các toà cũng bỏ loại này; căn đã nhập giữ nguyên)`)) {
        run(() => Catalog.deleteProjectType(t.id), 'Đã xoá loại căn');
      }
      return;
    }
    if (act === 'building-types-save') {
      const rows = [...row.querySelectorAll('[data-type-chk]:checked')].map((cb) => {
        const a = num(row.querySelector(`[data-type-area="${CSS.escape(cb.value)}"]`).value);
        return { apt_type: cb.value, area_m2: a > 0 ? a : null };
      });
      return run(() => Catalog.setBuildingTypes(row.dataset.bid, rows), 'Đã lưu loại căn của toà');
    }
    if (act && act.startsWith('sched-')) {
      const p = Catalog.project(row.dataset.pid), rows = schedOf(p);
      if (act === 'sched-add') { // thêm đợt thường TRƯỚC đợt bàn giao/nhận sổ, cách đợt trước 60 ngày
        let at = rows.findIndex((r) => r.role === 'handover' || r.role === 'title');
        if (at < 0) at = rows.length;
        const prev = rows.slice(0, at).reverse().find((r) => r.due && r.due.type === 'offsetDays');
        rows.splice(at, 0, { label: '', pct: 0, due: { type: 'offsetDays', value: prev ? (+prev.due.value || 0) + 60 : 0 } });
        render(); return;
      }
      if (act === 'sched-del') { rows.splice(+b.dataset.i, 1); render(); return; }
      if (act === 'sched-undo') { schedDraft.delete(p.id); render(); return; }
      if (act === 'sched-default') {
        if (!confirm(`Dự án "${p.name}" quay về tiến độ mặc định 7 đợt?`)) return;
        return run(async () => { await Catalog.updateProject(p.id, { payment_schedule: null }); schedDraft.delete(p.id); }, 'Đã về tiến độ mặc định');
      }
      if (act === 'sched-save') {
        const errs = LoanEngine.validateSchedule(rows);
        if (errs.length) return setStatus('⚠️ Tiến độ chưa hợp lệ: ' + errs.join(' · '));
        const clean = rows.map((r, i) => {
          const o = { label: (r.label || '').trim() || 'Đợt ' + (i + 1), pct: +r.pct, due: { type: r.due.type } };
          if (r.due.type !== 'handover') o.due.value = r.due.type === 'date' ? r.due.value : (+r.due.value || 0);
          if (r.role === 'title') o.due = { type: 'afterHandoverMonths', value: +p.title_after_months || 1.5 }; // 1 chỗ nhập: ô của dự án
          if (r.role) o.role = r.role;
          return o;
        });
        return run(async () => { await Catalog.updateProject(p.id, { payment_schedule: clean }); schedDraft.delete(p.id); }, 'Đã lưu tiến độ thanh toán');
      }
    }
    if (act === 'unit-add') return run(() => Catalog.saveUnit(unitPayload(row)), 'Đã thêm căn');
    if (act === 'unit-save') return run(async () => { await Catalog.saveUnit(unitPayload(row)); editingUnit = null; }, 'Đã lưu căn');
    if (act === 'unit-edit') { editingUnit = b.dataset.uid; render(); return; }
    if (act === 'unit-cancel') { editingUnit = null; render(); return; }
    if (act === 'unit-del') {
      const u = Catalog.unitsOf(b.closest('[data-bid]').dataset.bid).find((x) => x.id === b.dataset.uid);
      if (u && confirm(`Xoá căn ${u.code}?`)) run(() => Catalog.deleteUnit(u.id), 'Đã xoá căn');
    }
  });

  $('#cat-add-project').addEventListener('click', () => {
    const name = prompt('Tên dự án mới:');
    if (!name || !name.trim()) return;
    run(async () => { const p = await Catalog.addProject(name.trim()); openP.add(p.id); }, 'Đã thêm dự án');
  });

  // ---------- Nhập Excel ----------
  // Nhận diện cột theo tiêu đề (không phân biệt dấu/hoa thường). Thứ tự quan trọng:
  // cột GIÁ xét trước để "Giá duyệt toà" không bị nhận nhầm thành "Mã toà".
  const COLS = [
    ['buildingPrice', ['gia duyet', 'gia toa', 'gia trung binh', 'don gia toa']],
    ['price_per_m2_override', ['gia rieng', 'don gia can', 'gia can']],
    ['project', ['du an', 'project']],
    ['code', ['ma can', 'can ho', 'so can', 'can']],
    ['building', ['ma toa', 'toa', 'block', 'building']],
    ['area_m2', ['dien tich', 'dt']],
    ['floor', ['tang', 'floor']],
    ['direction', ['huong']],
    ['apt_type', ['loai can', 'loai']],
    ['status', ['trang thai', 'status']],
  ];
  const HEAD = ['Dự án', 'Mã toà', 'Giá duyệt toà (đ/m²)', 'Mã căn', 'Diện tích (m²)', 'Tầng', 'Hướng', 'Loại căn', 'Giá riêng (đ/m²)', 'Trạng thái'];

  function detectCols(header) {
    const map = {}; // field → index cột
    header.forEach((h, i) => {
      const t = noAccent(h).replace(/\(.*?\)/g, '').trim();
      if (!t) return;
      const hit = COLS.find(([f, al]) => !(f in map) && al.some((a) => t === a || t.startsWith(a + ' ')));
      if (hit) map[hit[0]] = i;
    });
    return map;
  }
  function parseStatus(v) {
    const t = noAccent(v);
    if (!t || t.startsWith('con') || t === 'available') return 'available';
    if (t.includes('giu') || t === 'holding') return 'holding';
    if (t.includes('ban') || t === 'sold') return 'sold';
    return 'available';
  }

  async function onFile(file) {
    if (!file) return;
    setStatus('⏳ Đang đọc file…');
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
        .filter((r) => r.some((v) => String(v).trim() !== ''));
      if (aoa.length < 2) throw new Error('File không có dữ liệu (cần 1 dòng tiêu đề + các dòng căn).');
      const map = detectCols(aoa[0]);
      if (!('project' in map) || !('building' in map)) throw new Error('Không thấy cột "Dự án" và "Mã toà" ở dòng tiêu đề. Tải "File mẫu" để xem đúng định dạng.');
      const cols = {}; Object.keys(map).forEach((k) => { cols[k] = true; });
      let lastP = '', lastB = '';
      const rows = aoa.slice(1).map((r) => {
        const g = (f) => (f in map ? r[map[f]] : '');
        // Ô dự án/toà để trống (ô gộp trong Excel CĐT) → lấy theo dòng trên
        const project = String(g('project')).trim() || lastP;
        const bCode = String(g('building')).trim() || lastB;
        lastP = project; lastB = bCode;
        return {
          project, building: bCode,
          buildingPrice: digits(g('buildingPrice')), code: String(g('code')).trim(),
          area_m2: num(g('area_m2')), floor: g('floor') === '' ? null : parseInt(g('floor'), 10) || null,
          direction: String(g('direction')).trim() || null, apt_type: String(g('apt_type')).trim() || null,
          price_per_m2_override: digits(g('price_per_m2_override')), status: parseStatus(g('status')),
        };
      }).filter((r) => r.project && r.building);
      const newP = new Set(rows.map((r) => r.project).filter((n) => !Catalog.projectByName(n)));
      const keyB = (r) => noAccent(r.project) + '|' + noAccent(r.building);
      const newB = new Set(rows.filter((r) => { const p = Catalog.projectByName(r.project); return !p || !Catalog.buildingByCode(p.id, r.building); }).map(keyB));
      let nNew = 0, nUpd = 0;
      const seen = new Set();
      rows.filter((r) => r.code).forEach((r) => {
        const k = keyB(r) + '|' + noAccent(r.code);
        if (seen.has(k)) return; seen.add(k);
        const p = Catalog.projectByName(r.project), b = p && Catalog.buildingByCode(p.id, r.building);
        if (b && Catalog.unitByCode(b.id, r.code)) nUpd++; else nNew++;
      });
      pendingImport = { rows, cols };
      const labels = { project: 'Dự án', building: 'Mã toà', buildingPrice: 'Giá duyệt toà', code: 'Mã căn', area_m2: 'Diện tích', floor: 'Tầng', direction: 'Hướng', apt_type: 'Loại căn', price_per_m2_override: 'Giá riêng', status: 'Trạng thái' };
      $('#cat-import-preview').innerHTML = `<b>${escapeHtml(file.name)}</b> — ${rows.length} dòng.<br>
        Cột nhận ra: ${Object.keys(map).map((k) => labels[k]).join(', ')}.<br>
        Sẽ tạo <b>${newP.size}</b> dự án mới, <b>${newB.size}</b> toà mới; <b>${nNew}</b> căn mới, <b>${nUpd}</b> căn cập nhật.
        <div class="cat-muted">Cột có trong file sẽ ghi đè dữ liệu cũ (ô trống = xoá giá trị đó); cột không có trong file giữ nguyên.</div>
        <div class="io-actions"><button type="button" id="cat-import-cancel" class="btn-ghost btn-small">Huỷ</button>
        <button type="button" id="cat-import-do" class="btn-primary btn-small">Nhập</button></div>`;
      $('#cat-import-preview').hidden = false;
      setStatus('');
    } catch (e) { console.warn('[catalog-ui] import', e); setStatus('⚠️ ' + (e.message || e)); }
  }

  $('#cat-import').addEventListener('click', () => { $('#cat-file').value = ''; $('#cat-file').click(); });
  $('#cat-file').addEventListener('change', (e) => onFile(e.target.files[0]));
  $('#cat-import-preview').addEventListener('click', async (e) => {
    if (e.target.id === 'cat-import-cancel') { pendingImport = null; $('#cat-import-preview').hidden = true; return; }
    if (e.target.id !== 'cat-import-do' || !pendingImport) return;
    e.target.disabled = true;
    try {
      setStatus('⏳ Đang nhập…');
      const st = await Catalog.importRows(pendingImport.rows, pendingImport.cols);
      pendingImport = null; $('#cat-import-preview').hidden = true;
      setStatus(`✓ Đã nhập: ${st.projects} dự án mới, ${st.buildings} toà mới, ${st.units} căn.`);
      render();
    } catch (err) { console.warn(err); setStatus('⚠️ ' + (err.message || err)); e.target.disabled = false; }
  });

  $('#cat-template').addEventListener('click', async () => {
    try {
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet([HEAD,
        ['Happy Home Tràng Cát', 'THE RISE 3', 19911530, 'R30413', 53.6, 4, 'Đông Nam', '2N-2WC', '', 'Còn'],
        ['', '', '', 'R30414', 60.2, 4, 'Tây Bắc', '2N+, 2WC', 20500000, 'Giữ chỗ'],
        ['Happy Home Tràng Cát', 'THE RISE 5', 19500000, '', '', '', '', '', '', ''],
      ]);
      ws['!cols'] = HEAD.map((h) => ({ wch: Math.max(12, h.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Giỏ hàng');
      XLSX.writeFile(wb, 'gio-hang-mau.xlsx');
    } catch (e) { setStatus('⚠️ ' + (e.message || e)); }
  });

  // ---------- Mở / đóng ----------
  $('#catalog-btn').addEventListener('click', async () => {
    $('#topbar-menu').classList.remove('open'); // đóng menu avatar
    pendingImport = null; editingUnit = null; schedDraft.clear();
    $('#cat-import-preview').hidden = true;
    setStatus('');
    modal.showModal();
    render();
    if (await Catalog.load()) render(); // lấy bản mới nhất (online)
  });
  $('#catalog-close').addEventListener('click', () => modal.close());
  Catalog.onChange(render);
})();
