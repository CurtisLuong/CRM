// js/team.js — NHÓM SALE & GIAO KHÁCH CHO ĐỒNG NGHIỆP (quyết định D-003, SQL/add_team_assign.sql)
//
// 3 kịch bản:
//   1. Khách của tôi           : owner_id = tôi
//   2. Giao, tôi vẫn theo dõi  : owner_id = đồng nghiệp, followers chứa tôi → tôi CHỈ XEM
//   3. Giao hẳn                : owner_id = đồng nghiệp, tôi không còn trong followers → khách biến khỏi
//                                danh sách của tôi (trưởng nhóm/admin vẫn xem ở nhóm "Khách nhóm")
// Hiển thị (D-004): tab Khách hàng → Đang chăm / Khách mới = khách MÌNH phụ trách; "Khách nhóm" = khách
// đồng nghiệp phụ trách mà mình thấy được (đang theo dõi; admin: cả nhóm), lọc theo người ở Bộ lọc.
//
// Quy tắc:
//   • Chỉ NGƯỜI PHỤ TRÁCH ghi được (db.js chặn + RLS). Trưởng nhóm (admin) xem mọi khách nhưng khách
//     người khác phụ trách cũng chỉ xem — riêng việc GIAO LẠI thì admin làm được.
//   • Việc hôm nay, chuông nhắc, thống kê Tổng quan: chỉ khách mình phụ trách (ownedCustomers()).
//   • Danh sách nhóm do admin thêm bằng email (menu avatar → Đồng nghiệp). Cache theo tài khoản
//     để dùng offline; giao khách offline vẫn được (đi qua hàng đợi như mọi thao tác).
// File này dùng các hàm/biến global của app.js (allCustomers, currentUser, openDetail…).

let team = [];            // [{user_id, full_name, email, is_admin, is_me}] — rỗng nếu chưa chạy SQL / chưa vào nhóm
let ownerScope = 'all';   // lọc trong nhóm "Khách nhóm": 'all' | 'following' | <user_id đồng nghiệp>
const LS_TEAM = 'crm_team:'; // + userId

function meId() { return currentUser ? currentUser.id : null; }
function amAdmin() { return team.some((m) => m.is_me && m.is_admin); }
function hasTeam() { return team.length > 1; }
function isMine(c) { return !!c && (!c.owner_id || c.owner_id === meId()); }
function isFollowing(c) { return !!c && Array.isArray(c.followers) && c.followers.includes(meId()); }
function memberName(id) {
  if (id && id === meId()) return 'Tôi';
  const m = team.find((x) => x.user_id === id);
  return m ? (m.full_name || (m.email || '').split('@')[0] || 'Đồng nghiệp') : 'Đồng nghiệp';
}
function ownedCustomers() { return allCustomers.filter(isMine); }
function matchesTeamPerson(c) {
  if (ownerScope === 'all') return true;
  if (ownerScope === 'following') return isFollowing(c);
  return c.owner_id === ownerScope;
}
function ownerScopeLabel() {
  if (ownerScope === 'all') return '';
  if (ownerScope === 'following') return 'Đang theo dõi';
  return memberName(ownerScope);
}
// Nhãn người phụ trách trên thẻ — chỉ hiện với khách KHÔNG do mình phụ trách.
function ownerTagHtml(c) {
  if (isMine(c)) return '';
  return `<span class="tag tag-owner" title="Người phụ trách">👤 ${escapeHtml(memberName(c.owner_id))}</span>`;
}

// Mục "Người phụ trách" trong panel Bộ lọc — CHỈ ở nhóm "Khách nhóm" và chỉ trưởng nhóm (đồng nghiệp
// thường chỉ thấy khách mình đang theo dõi nên không cần lọc).
function renderOwnerScope(groupId, presetsId) {
  const group = document.getElementById(groupId); if (!group) return;
  group.hidden = !(custGroup === 'team' && amAdmin() && hasTeam());
  if (group.hidden) return;
  const opts = [['all', 'Tất cả'], ['following', 'Tôi đang theo dõi']];
  team.filter((m) => !m.is_me).forEach((m) => opts.push([m.user_id, memberName(m.user_id)]));
  if (!opts.some(([v]) => v === ownerScope)) ownerScope = 'all';
  document.getElementById(presetsId).innerHTML = opts.map(([v, label]) =>
    `<button type="button" class="date-preset${v === ownerScope ? ' is-sel' : ''}" data-scope="${escapeHtml(v)}">${escapeHtml(label)}</button>`).join('');
}
function onScopeClick(e) {
  const b = e.target.closest('[data-scope]'); if (!b) return;
  e.stopPropagation(); // giữ panel mở
  ownerScope = b.dataset.scope;
  resetSearchPages();
  renderList();
}
$('#filter-owner-presets')?.addEventListener('click', onScopeClick);

// ---- Tải danh sách nhóm: cache local trước (offline), rồi lấy bản mới từ server ----
async function syncTeam() {
  const uid = meId(); if (!uid) return;
  try { const cached = JSON.parse(localStorage.getItem(LS_TEAM + uid) || 'null'); if (Array.isArray(cached)) team = cached; } catch { /* bỏ qua */ }
  afterTeamChange();
  const remote = await CRM.teamList();
  if (remote === undefined || uid !== meId()) return; // offline / lỗi / đã đổi tài khoản
  team = remote;
  try { localStorage.setItem(LS_TEAM + uid, JSON.stringify(team)); } catch { /* bỏ qua */ }
  afterTeamChange();
}
function afterTeamChange() {
  $('#team-btn').hidden = !team.length && !amAdmin();
  if (!$('#cust-subtabs').hidden) syncCustSubtabs();
  renderList(); renderLeads();
  if (!$('#dashboard-view').hidden) renderDashboard();
}
function resetTeamState() { team = []; ownerScope = 'all'; }

// ---- Trạng thái "chỉ xem" + nút Giao khách ở trang hồ sơ / hộp Khách mới ----
function canAssign(c) { return hasTeam() && (isMine(c) || amAdmin()); }
function readonlyText(c) {
  return isFollowing(c)
    ? `👁 Bạn đã giao khách này cho ${memberName(c.owner_id)} và đang theo dõi — chỉ xem.`
    : `👁 Khách do ${memberName(c.owner_id)} phụ trách — chỉ xem.`;
}
function applyTeamDetail(c) {
  const ro = !isMine(c);
  $('#detail-screen').classList.toggle('is-readonly', ro);
  const banner = $('#detail-readonly');
  banner.hidden = !ro; if (ro) banner.textContent = readonlyText(c);
  $('#detail-assign-btn').hidden = !canAssign(c);
  $('#detail-followers').hidden = !(hasTeam() && isMine(c) && (c.followers || []).length);
  if (!$('#detail-followers').hidden) $('#detail-followers').textContent = 'Cùng theo dõi: ' + c.followers.map(memberName).join(', ');
}
function applyTeamLead(c) {
  const ro = !isMine(c);
  $('#lead-modal').classList.toggle('is-readonly', ro);
  const banner = $('#lead-readonly');
  banner.hidden = !ro; if (ro) banner.textContent = readonlyText(c);
  $('#lead-assign-btn').hidden = !canAssign(c);
}

// ---- Hộp GIAO KHÁCH ----
let assignState = null; // {id, to, mode}
function openAssign(id) {
  const c = allCustomers.find((x) => x.id === id); if (!c || !canAssign(c)) return;
  assignState = { id, to: null, mode: 'keep' };
  $('#assign-title').textContent = 'Giao khách: ' + (c.full_name || '');
  const fol = (c.followers || []).filter((x) => x !== c.owner_id);
  $('#assign-sub').textContent = `Đang phụ trách: ${memberName(c.owner_id)}` + (fol.length ? ` · Cùng theo dõi: ${fol.map(memberName).join(', ')}` : '');
  $('#assign-members').innerHTML = team.filter((m) => m.user_id !== c.owner_id).map((m) =>
    `<button type="button" class="sched-opt" data-to="${escapeHtml(m.user_id)}">${escapeHtml(m.is_me ? 'Tôi (lấy lại)' : memberName(m.user_id))}</button>`).join('')
    || '<div class="dash-empty">Chưa có đồng nghiệp nào trong nhóm.</div>';
  $$('#assign-modes .sched-opt').forEach((b) => b.classList.toggle('is-sel', b.dataset.mode === 'keep'));
  $('#assign-note').value = '';
  $('#assign-error').textContent = '';
  syncAssignModes();
  $('#assign-modal').showModal();
}
function syncAssignModes() {
  const toMe = assignState && assignState.to === meId();
  $('#assign-mode-group').hidden = toMe; // lấy lại về mình → không cần chọn kiểu giao
}
$('#assign-members')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-to]'); if (!b || !assignState) return;
  assignState.to = b.dataset.to;
  $$('#assign-members .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
  $('#assign-error').textContent = '';
  syncAssignModes();
});
$('#assign-modes')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b || !assignState) return;
  assignState.mode = b.dataset.mode;
  $$('#assign-modes .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
});
$('#assign-save')?.addEventListener('click', async () => {
  if (!assignState) return;
  const c = allCustomers.find((x) => x.id === assignState.id); if (!c) return;
  const to = assignState.to;
  if (!to) { $('#assign-error').textContent = 'Chọn người nhận.'; return; }
  const me = meId(), keep = assignState.mode === 'keep' && to !== me;
  let followers = (c.followers || []).filter((x) => x !== to && x !== me);
  if (keep) followers.push(me);
  followers = [...new Set(followers)];
  const name = memberName(to), extra = $('#assign-note').value.trim();
  const note = (to === me ? 'Lấy lại về tôi' : `Giao cho ${name}${keep ? ' (người giao vẫn theo dõi)' : ''}`) + (extra ? '. ' + extra : '');
  await CRM.update(c.id, { owner_id: to, followers, care_stage: c.care_stage || CARE_STAGE_DEFAULT },
    { assign: true, careStageNote: note, forceLog: true });
  assignState = null;
  $('#assign-modal').close();
  await refreshList();
  showToast(to === me ? 'Đã lấy khách về' : `Đã giao cho ${name}${keep ? ' — bạn vẫn theo dõi' : ''}`);
  // Giao hẳn → khách không còn trong danh sách của mình: đóng hồ sơ / hộp Khách mới.
  const stillVisible = isMine(c) || keep || to === me || amAdmin();
  if ($('#lead-modal').open && leadSheetId === c.id) { if (stillVisible) openLeadSheet(c.id); else $('#lead-modal').close(); }
  if (!$('#detail-screen').hidden && detailId === c.id) { if (stillVisible) openDetail(c.id); else closeDetailToList(); }
});
$('#assign-cancel')?.addEventListener('click', () => { assignState = null; $('#assign-modal').close(); });
$('#assign-cancel-x')?.addEventListener('click', () => { assignState = null; $('#assign-modal').close(); });
$('#detail-assign-btn')?.addEventListener('click', () => { if (detailId) openAssign(detailId); });
$('#lead-assign-btn')?.addEventListener('click', () => { if (leadSheetId) openAssign(leadSheetId); });

// ---- Hộp ĐỒNG NGHIỆP (menu avatar → Đồng nghiệp) ----
function renderTeamModal() {
  const admin = amAdmin();
  $('#team-add-row').hidden = !admin;
  $('#team-hint').textContent = admin
    ? 'Khách giao cho đồng nghiệp nằm ở tab Khách hàng → Khách nhóm. Đồng nghiệp tự tạo tài khoản trong app (màn đăng nhập → Tạo tài khoản mới), rồi bạn nhập email của họ để thêm vào nhóm.'
    : 'Trưởng nhóm quản lý danh sách này. Bạn có thể đặt tên hiển thị của mình để đồng nghiệp dễ nhận ra.';
  const me = team.find((m) => m.is_me);
  $('#team-my-name').value = (me && me.full_name) || '';
  $('#team-list').innerHTML = team.length ? team.map((m) => `
    <div class="team-row">
      <div class="team-row-main">
        <div class="team-name">${escapeHtml(m.full_name || (m.email || '').split('@')[0])}${m.is_me ? ' <span class="team-badge">Bạn</span>' : ''}${m.is_admin ? ' <span class="team-badge is-lead">Trưởng nhóm</span>' : ''}</div>
        <div class="team-email">${escapeHtml(m.email || '')}</div>
      </div>
      ${admin && !m.is_me && !m.is_admin ? `<button type="button" class="tpl-del" data-team-del="${escapeHtml(m.user_id)}">Xoá</button>` : ''}
    </div>`).join('') : '<div class="dash-empty">Chưa có nhóm. Trưởng nhóm cần chạy SQL/add_team_assign.sql và đặt quyền trưởng nhóm.</div>';
}
$('#team-btn')?.addEventListener('click', async () => {
  $('#topbar-menu').classList.remove('open');
  $('#team-error').textContent = '';
  renderTeamModal();
  $('#team-modal').showModal();
  await syncTeam();
  if ($('#team-modal').open) renderTeamModal();
});
$('#team-add-btn')?.addEventListener('click', async () => {
  const email = $('#team-email').value.trim();
  $('#team-error').textContent = '';
  if (!/^\S+@\S+\.\S+$/.test(email)) { $('#team-error').textContent = 'Nhập email hợp lệ.'; return; }
  try {
    await CRM.teamAdd(email);
    $('#team-email').value = '';
    await syncTeam(); renderTeamModal();
    showToast('Đã thêm vào nhóm');
  } catch (e) { $('#team-error').textContent = e.message || String(e); }
});
$('#team-list')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-team-del]'); if (!b) return;
  const id = b.dataset.teamDel;
  const n = allCustomers.filter((c) => c.owner_id === id).length;
  if (!confirm(`Xoá ${memberName(id)} khỏi nhóm?` + (n ? `\n\nNgười này đang phụ trách ${n} khách — khách vẫn thuộc họ cho tới khi bạn giao lại (lọc "${memberName(id)}" trong Bộ lọc).` : ''))) return;
  try { await CRM.teamRemove(id); await syncTeam(); renderTeamModal(); }
  catch (err) { $('#team-error').textContent = err.message || String(err); }
});
$('#team-name-save')?.addEventListener('click', async () => {
  $('#team-error').textContent = '';
  try { await CRM.setMyName($('#team-my-name').value); await syncTeam(); renderTeamModal(); showToast('Đã lưu tên'); }
  catch (e) { $('#team-error').textContent = e.message || String(e); }
});
$('#team-close')?.addEventListener('click', () => $('#team-modal').close());

// Thao tác ghi bị chặn vì khách không do mình phụ trách (db.js ném lỗi READ_ONLY) → báo nhẹ.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.code === 'READ_ONLY') { e.preventDefault(); showToast(e.reason.message); }
});
