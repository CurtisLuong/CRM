/* app.js — UI + điều phối chính của CRM */

const CARE_STAGES = [
  'Chưa gọi được',
  'Hẹn gọi lại',
  'Chờ kết bạn Zalo',
  'Đang chăm sóc qua Zalo',
  'Đã yêu cầu hỗ trợ hồ sơ',
  'Đã booking',
  'Đã ký hợp đồng mua bán',
];

const EVAL_REASONS = [
  'Không đủ điều kiện',
  'Khách dò giá',
  'Khách hồ sơ quá phức tạp',
  'Khách không quan tâm',
  'Khác',
];

let supabase = null;
let currentUser = null;
let allCustomers = [];
let editingId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------------------------------------------------------------- AUTH ----

function initSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function boot() {
  initSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await onLoggedIn(session.user);
  } else {
    showAuthScreen();
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session && !currentUser) onLoggedIn(session.user);
    if (!session) { currentUser = null; showAuthScreen(); }
  });
}

async function onLoggedIn(user) {
  currentUser = user;
  showAppScreen();
  CRM.init(supabase, user.id);
  await CRM.flushQueue();
  await CRM.pull();
  await refreshList();
  setInterval(async () => {
    await CRM.flushQueue();
    updateSyncBadge();
  }, 15000);
  updateSyncBadge();
}

function showAuthScreen() {
  $('#auth-screen').hidden = false;
  $('#app-screen').hidden = true;
}

function showAppScreen() {
  $('#auth-screen').hidden = true;
  $('#app-screen').hidden = false;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errBox = $('#auth-error');
  errBox.textContent = '';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { errBox.textContent = 'Đăng nhập lỗi: ' + error.message; return; }
  await onLoggedIn(data.user);
}

async function handleSignup(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errBox = $('#auth-error');
  errBox.textContent = '';
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { errBox.textContent = 'Đăng ký lỗi: ' + error.message; return; }
  if (data.session) { await onLoggedIn(data.user); }
  else { errBox.textContent = 'Đã gửi email xác nhận — kiểm tra hộp thư rồi đăng nhập lại.'; }
}

function handleLogout() {
  supabase.auth.signOut();
}

// ------------------------------------------------------------- SYNC UI ----

async function updateSyncBadge() {
  const n = await CRM.pendingCount();
  const badge = $('#sync-badge');
  if (!CRM.isOnline()) {
    badge.textContent = '🔴 Offline' + (n ? ` — ${n} thay đổi chờ đồng bộ` : '');
  } else if (n > 0) {
    badge.textContent = `🟡 Đang đồng bộ ${n} thay đổi...`;
  } else {
    badge.textContent = '🟢 Đã đồng bộ';
  }
}
window.addEventListener('online', updateSyncBadge);
window.addEventListener('offline', updateSyncBadge);

// -------------------------------------------------------------- LIST ------

async function refreshList() {
  allCustomers = await CRM.list();
  renderList();
  updateSyncBadge();
}

function normalizePhone(p) {
  return (p || '').replace(/[^\d+]/g, '');
}

function zaloLink(phone) {
  const clean = normalizePhone(phone).replace(/^\+?84/, '0');
  return `https://zalo.me/${clean}`;
}

function matchesFilters(c) {
  const q = $('#search-input').value.trim().toLowerCase();
  if (q) {
    const hay = `${c.phone || ''} ${c.full_name || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const stage = $('#filter-stage').value;
  if (stage && c.care_stage !== stage) return false;
  const evalFilter = $('#filter-evaluation').value;
  if (evalFilter && c.evaluation !== evalFilter) return false;
  const minInterest = Number($('#filter-min-interest').value || 0);
  if ((c.interest_level || 0) < minInterest) return false;
  return true;
}

function sortCustomers(list) {
  const sortBy = $('#sort-select').value;
  const arr = [...list];
  if (sortBy === 'interest_desc') arr.sort((a, b) => (b.interest_level || 0) - (a.interest_level || 0));
  else if (sortBy === 'name_asc') arr.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi'));
  else if (sortBy === 'updated_desc') arr.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return arr;
}

function renderList() {
  const list = sortCustomers(allCustomers.filter(matchesFilters));
  const container = $('#customer-list');
  container.innerHTML = '';
  $('#empty-state').hidden = list.length !== 0;
  $('#result-count').textContent = `${list.length} khách hàng`;

  for (const c of list) {
    const card = document.createElement('div');
    card.className = 'customer-card';
    if (c.evaluation === 'không nên chăm') card.classList.add('is-dropped');

    const interest = c.interest_level ?? 0;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="card-name">${escapeHtml(c.full_name || '(chưa có tên)')}</div>
          <a class="card-phone" href="${zaloLink(c.phone)}" target="_blank" rel="noopener">📞 ${escapeHtml(c.phone || '')}</a>
        </div>
        <div class="interest-pill" style="--pct:${interest}">${interest}%</div>
      </div>
      <div class="card-tags">
        ${c.care_stage ? `<span class="tag tag-stage">${escapeHtml(c.care_stage)}</span>` : ''}
        ${c.evaluation ? `<span class="tag ${c.evaluation === 'nên chăm' ? 'tag-good' : 'tag-bad'}">${escapeHtml(c.evaluation)}</span>` : ''}
        ${c.apt_type ? `<span class="tag">${escapeHtml(c.apt_type)}</span>` : ''}
        ${c.menh ? `<span class="tag tag-menh">${escapeHtml(c.menh)}</span>` : ''}
      </div>
      ${c.notes ? `<div class="card-notes">${escapeHtml(c.notes)}</div>` : ''}
      <div class="card-actions">
        <button class="btn-small" data-action="edit" data-id="${c.id}">Sửa</button>
        <button class="btn-small btn-danger" data-action="delete" data-id="${c.id}">Xoá</button>
      </div>
    `;
    container.appendChild(card);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

$('#customer-list')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'edit') openForm(id);
  if (btn.dataset.action === 'delete') confirmDelete(id);
});

// -------------------------------------------------------------- FORM ------

function openForm(id) {
  editingId = id || null;
  const c = id ? allCustomers.find((x) => x.id === id) : {};
  $('#form-title').textContent = id ? 'Sửa thông tin khách' : 'Thêm khách mới';

  const f = $('#customer-form');
  f.phone.value = c.phone || '';
  f.full_name.value = c.full_name || '';
  f.gender.value = c.gender || '';
  f.dob.value = c.dob || '';
  f.marital_status.value = c.marital_status || '';
  f.income.value = c.income || '';
  f.residence.value = c.residence || '';
  f.apt_type.value = c.apt_type || '';
  f.apt_code.value = c.apt_code || '';
  f.building_code.value = c.building_code || '';
  f.apt_price.value = c.apt_price || '';
  f.notes.value = c.notes || '';
  f.interest_level.value = c.interest_level ?? 50;
  $('#interest-output').textContent = (c.interest_level ?? 50) + '%';
  f.care_stage.value = c.care_stage || '';
  f.evaluation.value = c.evaluation || '';
  f.evaluation_reason.value = c.evaluation_reason || '';

  updateMenhPreview();
  toggleEvalReason();
  $('#form-modal').showModal();
}

function closeForm() {
  $('#form-modal').close();
  editingId = null;
}

function updateMenhPreview() {
  const dob = $('#customer-form').dob.value;
  const menh = dob ? window.LunarUtil.calcMenhFromSolarDOB(dob) : '';
  $('#menh-preview').textContent = menh || '— nhập ngày sinh để tính mệnh —';
}

function toggleEvalReason() {
  const isBad = $('#customer-form').evaluation.value === 'không nên chăm';
  $('#evaluation-reason-wrap').hidden = !isBad;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const f = $('#customer-form');
  const dob = f.dob.value || null;
  const payload = {
    phone: f.phone.value.trim(),
    full_name: f.full_name.value.trim(),
    gender: f.gender.value || null,
    dob,
    menh: dob ? window.LunarUtil.calcMenhFromSolarDOB(dob) : null,
    marital_status: f.marital_status.value || null,
    income: f.income.value.trim() || null,
    residence: f.residence.value.trim() || null,
    apt_type: f.apt_type.value.trim() || null,
    apt_code: f.apt_code.value.trim() || null,
    building_code: f.building_code.value.trim() || null,
    apt_price: f.apt_price.value ? Number(f.apt_price.value) : null,
    notes: f.notes.value.trim() || null,
    interest_level: Number(f.interest_level.value),
    care_stage: f.care_stage.value || null,
    evaluation: f.evaluation.value || null,
    evaluation_reason: f.evaluation.value === 'không nên chăm' ? (f.evaluation_reason.value || null) : null,
  };
  if (!payload.phone || !payload.full_name) {
    alert('Cần nhập ít nhất Số điện thoại và Họ tên.');
    return;
  }
  if (editingId) await CRM.update(editingId, payload);
  else await CRM.create(payload);
  closeForm();
  await refreshList();
}

async function confirmDelete(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!confirm(`Xoá khách "${c?.full_name || ''}"? Không thể hoàn tác.`)) return;
  await CRM.remove(id);
  await refreshList();
}

// -------------------------------------------------------------- WIRE UP ---

function populateSelects() {
  const stageOptions = ['<option value="">— Tất cả —</option>', ...CARE_STAGES.map((s) => `<option value="${s}">${s}</option>`)].join('');
  $('#filter-stage').innerHTML = stageOptions;

  const formStageOptions = ['<option value="">— Chưa xác định —</option>', ...CARE_STAGES.map((s) => `<option value="${s}">${s}</option>`)].join('');
  $('#customer-form').care_stage.innerHTML = formStageOptions;

  $('#eval-reason-datalist').innerHTML = EVAL_REASONS.map((r) => `<option value="${r}">`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  populateSelects();
  boot();

  $('#login-form').addEventListener('submit', handleLogin);
  $('#signup-btn').addEventListener('click', handleSignup);
  $('#logout-btn').addEventListener('click', handleLogout);

  $('#add-customer-btn').addEventListener('click', () => openForm(null));
  $('#customer-form').addEventListener('submit', handleFormSubmit);
  $('#cancel-form-btn').addEventListener('click', closeForm);
  $('#customer-form').dob.addEventListener('input', updateMenhPreview);
  $('#customer-form').evaluation.addEventListener('change', toggleEvalReason);
  $('#customer-form').interest_level.addEventListener('input', (e) => {
    $('#interest-output').textContent = e.target.value + '%';
  });

  $('#search-input').addEventListener('input', renderList);
  $('#filter-stage').addEventListener('change', renderList);
  $('#filter-evaluation').addEventListener('change', renderList);
  $('#filter-min-interest').addEventListener('input', renderList);
  $('#sort-select').addEventListener('change', renderList);
  $('#clear-filters-btn').addEventListener('click', () => {
    $('#search-input').value = '';
    $('#filter-stage').value = '';
    $('#filter-evaluation').value = '';
    $('#filter-min-interest').value = 0;
    renderList();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
