/* app.js — UI + điều phối chính của CRM */

// 7 bậc tiến độ chăm sóc "đi tới" (bậc 1 → bậc 7), theo đúng thứ tự phễu bán hàng.
// Bậc 7 ('Đã ký hợp đồng mua bán') = chăm sóc XONG, chốt thành công.
const CARE_STAGES = [
  'Chưa gọi được',
  'Hẹn gọi lại',
  'Chờ kết bạn Zalo',
  'Đang chăm sóc qua Zalo',
  'Đã yêu cầu hỗ trợ hồ sơ',
  'Đã booking',
  'Đã ký hợp đồng mua bán',
];

// 'Không quan tâm-kết thúc' KHÔNG phải bậc thứ 8 của phễu — nó là 1 trạng thái
// KẾT THÚC quá trình chăm sóc mà không chốt được khách. Về mặt "đã xong hay chưa"
// nó tương đương bậc 7 (đều là xong), nhưng hiển thị vòng tròn màu xám để phân
// biệt "kết thúc nhưng không mua" với "đã ký hợp đồng".
const CARE_STAGE_DROPPED = 'Không quan tâm-kết thúc';

// Danh sách đổ vào các <select>: 7 bậc + trạng thái kết thúc ở cuối cùng.
const CARE_STAGE_OPTIONS = [...CARE_STAGES, CARE_STAGE_DROPPED];

// Hai trạng thái coi là "chăm sóc đã xong" — mặc định ẩn khỏi dashboard.
const CARE_DONE_STAGES = ['Đã ký hợp đồng mua bán', CARE_STAGE_DROPPED];

// Màu từng bậc (đỏ đất → xanh lá: càng về sau càng "chín"). Bậc kết thúc = xám.
const CARE_STAGE_COLORS = {
  'Chưa gọi được':           '#b0463a', // đỏ đất — mới, chưa liên hệ được
  'Hẹn gọi lại':             '#c96a4f', // cam đất
  'Chờ kết bạn Zalo':        '#d29b2c', // vàng cam
  'Đang chăm sóc qua Zalo':  '#b6a92f', // vàng xanh
  'Đã yêu cầu hỗ trợ hồ sơ': '#7f9b3f', // xanh cốm
  'Đã booking':              '#3f8f6b', // xanh ngọc
  'Đã ký hợp đồng mua bán':  '#2f7d5e', // xanh lá đậm — chốt thành công
  [CARE_STAGE_DROPPED]:      '#9a9a90', // xám — kết thúc, không mua
};

// Khách chưa đặt tiến độ (bỏ trống) coi như bậc 1 'Chưa gọi được' (theo yêu cầu).
function careLevel(stage) {
  if (stage === CARE_STAGE_DROPPED) return 7; // vòng đầy như bậc 7
  const idx = CARE_STAGES.indexOf(stage);
  return idx === -1 ? 1 : idx + 1; // bỏ trống / lạ → bậc 1
}

function careColor(stage) {
  return CARE_STAGE_COLORS[stage] || CARE_STAGE_COLORS['Chưa gọi được'];
}

function careLabel(stage) {
  return stage || 'Chưa gọi được';
}

function isCareDone(stage) {
  return CARE_DONE_STAGES.includes(stage);
}

// Thứ hạng để SẮP XẾP theo tiến độ (khác careLevel dùng để vẽ vòng tròn):
// bỏ trống → 1, 7 bậc phễu → 1-7, 'Không quan tâm-kết thúc' → 8 (xếp cuối cùng).
function careSortRank(stage) {
  if (stage === CARE_STAGE_DROPPED) return 8;
  const idx = CARE_STAGES.indexOf(stage);
  return idx === -1 ? 1 : idx + 1;
}

const EVAL_REASONS = [
  'Không đủ điều kiện',
  'Khách dò giá',
  'Khách hồ sơ quá phức tạp',
  'Khách không quan tâm',
  'Khác',
];

let sb = null;
let currentUser = null;
let allCustomers = [];
let editingId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------------------------------------------------------------- AUTH ----

function initSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function boot() {
  initSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onLoggedIn(session.user);
  } else {
    showAuthScreen();
  }
  sb.auth.onAuthStateChange((_event, session) => {
    if (session && !currentUser) onLoggedIn(session.user);
    if (!session) { currentUser = null; showAuthScreen(); }
  });
}

async function onLoggedIn(user) {
  currentUser = user;
  showAppScreen();
  CRM.init(sb, user.id);
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
  $('#detail-screen').hidden = true;
}

function showAppScreen() {
  $('#auth-screen').hidden = true;
  $('#app-screen').hidden = false;
  $('#detail-screen').hidden = true;
}

function showDetailScreen() {
  $('#auth-screen').hidden = true;
  $('#app-screen').hidden = true;
  $('#detail-screen').hidden = false;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errBox = $('#auth-error');
  errBox.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errBox.textContent = 'Đăng nhập lỗi: ' + error.message; return; }
  await onLoggedIn(data.user);
}

async function handleSignup(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errBox = $('#auth-error');
  errBox.textContent = '';
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) { errBox.textContent = 'Đăng ký lỗi: ' + error.message; return; }
  if (data.session) { await onLoggedIn(data.user); }
  else { errBox.textContent = 'Đã gửi email xác nhận — kiểm tra hộp thư rồi đăng nhập lại.'; }
}

function handleLogout() {
  sb.auth.signOut();
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
  if (stage) {
    // Chọn 1 bậc cụ thể → lọc đúng bậc đó, bỏ qua lọc trạng thái xong/chưa xong.
    if (c.care_stage !== stage) return false;
  } else {
    // Không chọn bậc cụ thể → áp bộ lọc trạng thái (mặc định chỉ hiện "đang chăm sóc").
    const progress = $('#filter-progress').value; // 'active' | 'done' | 'all'
    const done = isCareDone(c.care_stage);
    if (progress === 'active' && done) return false;
    if (progress === 'done' && !done) return false;
  }
  const evalFilter = $('#filter-evaluation').value;
  if (evalFilter && c.evaluation !== evalFilter) return false;
  const minInterest = Number($('#filter-min-interest').value || 0);
  if ((c.interest_level || 0) < minInterest) return false;
  return true;
}

function sortCustomers(list) {
  const sortBy = $('#sort-select').value;
  const arr = [...list];
  if (sortBy === 'care_asc') {
    // Mặc định: tiến độ chăm sóc tăng dần (bậc 1 → 7), cùng bậc thì mức độ
    // quan tâm tăng dần (thấp → cao). Đưa khách "cần chăm sớm" lên đầu.
    arr.sort((a, b) => {
      const d = careSortRank(a.care_stage) - careSortRank(b.care_stage);
      if (d !== 0) return d;
      return (a.interest_level || 0) - (b.interest_level || 0);
    });
  }
  else if (sortBy === 'interest_desc') arr.sort((a, b) => (b.interest_level || 0) - (a.interest_level || 0));
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
    card.dataset.id = c.id; // để bấm vào thân card mở xem/sửa đầy đủ
    if (c.evaluation === 'không nên chăm') card.classList.add('is-dropped');

    // Vòng tròn tiến độ chăm sóc: đầy dần theo bậc (level/7), màu theo từng bậc.
    // Giữa vòng ghi số bậc (1-7); bậc kết thúc "không quan tâm" hiện dấu ✕.
    const level = careLevel(c.care_stage);
    const ringPct = Math.round((level / 7) * 100);
    const ringColor = careColor(c.care_stage);
    const ringText = c.care_stage === CARE_STAGE_DROPPED ? '✕' : String(level);
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="card-name">${escapeHtml(c.full_name || '(chưa có tên)')}</div>
          <a class="card-phone" href="${zaloLink(c.phone)}" target="_blank" rel="noopener">📞 ${escapeHtml(c.phone || '')}</a>
        </div>
        <div class="progress-ring" style="--pct:${ringPct}; --ring:${ringColor}" title="${escapeHtml(careLabel(c.care_stage))}">
          <span class="progress-ring-inner">${ringText}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-tags">
          ${c.care_stage ? `<span class="tag tag-stage">${escapeHtml(c.care_stage)}</span>` : ''}
          ${c.evaluation ? `<span class="tag ${c.evaluation === 'nên chăm' ? 'tag-good' : 'tag-bad'}">${escapeHtml(c.evaluation)}</span>` : ''}
          ${c.apt_type ? `<span class="tag">${escapeHtml(c.apt_type)}</span>` : ''}
          ${c.menh ? `<span class="tag tag-menh">${escapeHtml(c.menh)}</span>` : ''}
        </div>
        ${c.notes ? `<div class="card-notes">${escapeHtml(c.notes)}</div>` : ''}
      </div>
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
  if (btn) {
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') openForm(id);
    if (btn.dataset.action === 'delete') confirmDelete(id);
    return;
  }
  // Bấm vào link SĐT → để nó mở Zalo bình thường, không mở trang chi tiết
  if (e.target.closest('a')) return;
  // Bấm vào chỗ trống còn lại của card → mở trang chi tiết khách
  const card = e.target.closest('.customer-card');
  if (card?.dataset.id) openDetail(card.dataset.id);
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
  const savedId = editingId;
  if (editingId) await CRM.update(editingId, payload);
  else await CRM.create(payload);
  closeForm();
  await refreshList();
  // Nếu đang mở trang chi tiết khách vừa sửa → vẽ lại cho khớp dữ liệu mới
  if (savedId && !$('#detail-screen').hidden) openDetail(savedId);
}

async function confirmDelete(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!confirm(`Xoá khách "${c?.full_name || ''}"? Không thể hoàn tác.`)) return;
  await CRM.remove(id);
  await refreshList();
}

// ------------------------------------------------------------ DETAIL ------

let detailId = null; // khách đang xem ở trang chi tiết

// Chuỗi HTML các "chấm" tiến độ: 7 chấm, tô màu bậc cho tới level hiện tại.
function stageDotsHtml(stage) {
  const level = careLevel(stage);
  const color = careColor(stage);
  let out = '';
  for (let i = 1; i <= 7; i++) {
    out += `<span class="dot" style="background:${i <= level ? color : '#dcd9cf'}"></span>`;
  }
  return out;
}

// 5 chấm mức quan tâm (mỗi chấm ~20%).
function interestDotsHtml(interest) {
  const filled = Math.round((interest || 0) / 20);
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="dot" style="background:${i <= filled ? 'var(--terracotta)' : '#dcd9cf'}"></span>`;
  }
  return out;
}

// Giá VNĐ → "1,2 tỷ" / "800 triệu" cho dễ đọc.
function formatPrice(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' triệu';
  return n.toLocaleString('vi-VN') + ' đ';
}

// "YYYY-MM-DD" → "DD/MM/YYYY".
function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

// Viết hoa chữ cái đầu (hiển thị 'nam' → 'Nam').
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const DASH = '—'; // giá trị trống

function openDetail(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!c) return;
  detailId = id;

  $('#detail-name').textContent = c.full_name || '(chưa có tên)';
  $('#detail-phone').textContent = '📞 ' + (c.phone || DASH);
  $('#detail-call-btn').href = c.phone ? `tel:${normalizePhone(c.phone)}` : '#';
  $('#detail-zalo-btn').href = zaloLink(c.phone);

  // Tiến độ
  $('#detail-stage-dots').innerHTML = stageDotsHtml(c.care_stage);
  $('#detail-stage-dots').style.color = careColor(c.care_stage);
  $('#detail-stage-text').textContent = careLabel(c.care_stage);
  // Mức quan tâm
  const interest = c.interest_level ?? 0;
  $('#detail-interest-dots').innerHTML = interestDotsHtml(interest);
  $('#detail-interest-text').textContent = interest + '%';
  // Đánh giá
  const evalBox = $('#detail-eval');
  if (c.evaluation) {
    evalBox.hidden = false;
    evalBox.className = 'tag ' + (c.evaluation === 'nên chăm' ? 'tag-good' : 'tag-bad');
    evalBox.textContent = c.evaluation;
  } else {
    evalBox.hidden = true;
  }

  // Ghi chú
  const notesBox = $('#detail-notes');
  notesBox.textContent = c.notes || 'Chưa có ghi chú.';
  notesBox.classList.toggle('is-empty', !c.notes);

  // Căn hộ quan tâm
  const aptRows = [
    ['Loại căn', c.apt_type || DASH],
    ['Mã căn', c.apt_code || DASH],
    ['Mã toà', c.building_code || DASH],
    ['Giá', formatPrice(c.apt_price)],
  ];
  $('#detail-apt').innerHTML = aptRows
    .map(([k, v]) => `<tr><th>${k}</th><td>${escapeHtml(String(v))}</td></tr>`)
    .join('');

  // Thông tin cá nhân — mỗi mục "Nhãn: giá trị", ngăn nhau bằng dấu ·
  const personal = [
    ['Giới tính', c.gender ? capitalize(c.gender) : DASH],
    ['Hôn nhân', c.marital_status ? capitalize(c.marital_status) : DASH],
    ['Ngày sinh', formatDate(c.dob)],
    ['Mệnh', c.menh ? c.menh.replace(/^Mệnh\s+/, '') : DASH],
    ['Thu nhập', c.income || DASH],
    ['Thường trú', c.residence || DASH],
  ];
  $('#detail-personal').innerHTML = personal
    .map(([k, v]) => `<span class="pi-item"><span class="pi-label">${k}:</span> ${escapeHtml(String(v))}</span>`)
    .join(' <span class="pi-sep">·</span> '); // có khoảng trắng để dòng tự ngắt khi hẹp

  showDetailScreen();
  window.scrollTo(0, 0);
}

// -------------------------------------------------------------- WIRE UP ---

function populateSelects() {
  const stageOptions = ['<option value="">— Mọi bậc —</option>', ...CARE_STAGE_OPTIONS.map((s) => `<option value="${s}">${s}</option>`)].join('');
  $('#filter-stage').innerHTML = stageOptions;

  const formStageOptions = ['<option value="">— Chưa xác định —</option>', ...CARE_STAGE_OPTIONS.map((s) => `<option value="${s}">${s}</option>`)].join('');
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
  $('#detail-back-btn').addEventListener('click', () => { detailId = null; showAppScreen(); });
  $('#detail-edit-btn').addEventListener('click', () => { if (detailId) openForm(detailId); });
  $('#customer-form').addEventListener('submit', handleFormSubmit);
  $('#cancel-form-btn').addEventListener('click', closeForm);
  $('#customer-form').dob.addEventListener('input', updateMenhPreview);
  $('#customer-form').evaluation.addEventListener('change', toggleEvalReason);
  $('#customer-form').interest_level.addEventListener('input', (e) => {
    $('#interest-output').textContent = e.target.value + '%';
  });

  $('#search-input').addEventListener('input', renderList);
  $('#filter-progress').addEventListener('change', renderList);
  $('#filter-stage').addEventListener('change', renderList);
  $('#filter-evaluation').addEventListener('change', renderList);
  $('#filter-min-interest').addEventListener('input', renderList);
  $('#sort-select').addEventListener('change', renderList);
  $('#clear-filters-btn').addEventListener('click', () => {
    $('#search-input').value = '';
    $('#filter-progress').value = 'active'; // về mặc định: chỉ hiện khách đang chăm sóc
    $('#filter-stage').value = '';
    $('#filter-evaluation').value = '';
    $('#filter-min-interest').value = 0;
    renderList();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
