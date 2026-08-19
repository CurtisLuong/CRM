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

// Icon điện thoại (SVG inline, tô theo màu chữ, cỡ ăn theo font-size chỗ đặt).
// Zalo dùng ảnh icons/Zalo-icon.png (đặt trong <img>).
const PHONE_SVG = '<svg class="ic-phone" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

let sb = null;
let currentUser = null;
let allCustomers = [];
let editingId = null;
let formOriginalStage = ''; // care_stage lúc mở form — để biết có đổi bậc không

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
  // Avatar = chữ cái đầu của email; menu hiện email đầy đủ
  const email = user.email || '';
  $('#user-menu-btn').textContent = (email[0] || '?').toUpperCase();
  $('#user-email').textContent = email;
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
  // Nếu đang ở tab Tổng quan thì vẽ lại cho khớp dữ liệu mới nhất.
  if (!$('#dashboard-view').hidden) renderDashboard();
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

// Làm mới dữ liệu: đẩy hàng đợi + kéo bản mới nhất từ Supabase + vẽ lại
// (không phải reload cả trang — giữ nguyên vị trí đang xem).
async function handleReload() {
  const btn = $('#reload-btn');
  btn.classList.add('spinning');
  try {
    await CRM.flushQueue();
    await CRM.pull();
    await refreshList();
    if (!$('#dashboard-view').hidden) renderDashboard();
  } catch (e) {
    console.warn('Làm mới lỗi:', e);
  } finally {
    updateSyncBadge();
    setTimeout(() => btn.classList.remove('spinning'), 500);
  }
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

// Bỏ dấu tiếng Việt để tìm kiếm "theo ký tự": "Hương" → "huong", "Đặng" → "dang".
// Cách làm: NFD tách chữ + dấu thành 2 phần rồi xoá toàn bộ ký tự dấu tổ hợp
// (dấu thanh, mũ, râu ư/ơ...). Riêng đ/Đ không tách được bằng NFD nên thay tay.
function removeVietnameseTones(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

function zaloLink(phone) {
  const clean = normalizePhone(phone).replace(/^\+?84/, '0');
  return `https://zalo.me/${clean}`;
}

function matchesFilters(c) {
  // Tìm kiếm bỏ dấu: gõ "huong" vẫn ra "Hương", gõ "hu" đã ra ngay (theo ký tự).
  const q = removeVietnameseTones($('#search-input').value.trim());
  if (q) {
    const hay = removeVietnameseTones(`${c.phone || ''} ${c.full_name || ''}`);
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

    // Tiến độ chăm sóc → vòng NHỎ (đĩa conic đầy theo bậc) + "x/7" + tên bước.
    const level = careLevel(c.care_stage);
    const ringPct = Math.round((level / 7) * 100);
    const ringColor = careColor(c.care_stage);
    const interest = c.interest_level ?? 0;
    // Timestamp phản ánh lần đổi Tiến độ chăm sóc cuối (không phải mọi lần sửa).
    // Dòng cũ chưa có care_stage_updated_at thì tạm dùng updated_at.
    const updated = timeAgo(c.care_stage_updated_at || c.updated_at);
    const menhShort = c.menh ? c.menh.split(' — ')[0] : ''; // "Mệnh Kim" (bỏ nạp âm dài phía sau)
    card.innerHTML = `
      <div class="card-head">
        <div class="card-name">${escapeHtml(c.full_name || '(chưa có tên)')}</div>
        <div class="card-menu">
          <button class="card-menu-btn" data-action="menu" aria-label="Tuỳ chọn khác">⋯</button>
          <div class="card-menu-pop">
            <button class="menu-item danger" data-action="delete" data-id="${c.id}">Xoá khách</button>
          </div>
        </div>
      </div>
      <div class="phone-row">
        <span class="phone-number">${escapeHtml(c.phone || '')}</span>
        <a class="card-phone" href="tel:${normalizePhone(c.phone)}" aria-label="Gọi ${escapeHtml(c.phone || '')}">${PHONE_SVG}</a>
        <a class="card-zalo" href="${zaloLink(c.phone)}" target="_blank" rel="noopener" aria-label="Nhắn Zalo">
          <img class="ic-zalo" src="/icons/zalo.png" alt="Zalo" />
        </a>
      </div>
      <div class="card-progress">
        <span class="mini-ring" style="--pct:${ringPct}; --ring:${ringColor}" title="${escapeHtml(careLabel(c.care_stage))}"></span>
        <span class="mini-frac">${level}/7</span>
        <span class="stage-name">${escapeHtml(careLabel(c.care_stage))}</span>
        ${c.apt_type ? `<span class="tag">${escapeHtml(c.apt_type)}</span>` : ''}
        ${c.evaluation ? `<span class="tag ${c.evaluation === 'nên chăm' ? 'tag-good' : 'tag-bad'}">${escapeHtml(c.evaluation)}</span>` : ''}
        ${menhShort ? `<span class="tag tag-menh">${escapeHtml(menhShort)}</span>` : ''}
      </div>
      <div class="interest-line">
        <span class="interest-label">Quan tâm</span>
        <span class="interest-bar"><span class="interest-fill" style="width:${interest}%"></span></span>
        <span class="interest-pct">${interest}%</span>
      </div>
      <div class="card-notes">${escapeHtml(c.notes || '')}</div>
      <div class="card-footer">
        <span class="card-updated">${updated ? 'Cập nhật ' + escapeHtml(updated) : ''}</span>
        <button class="btn-small" data-action="edit" data-id="${c.id}">Sửa</button>
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
  const card = e.target.closest('.customer-card');
  const menuBtn = e.target.closest('.card-menu-btn');
  // Đóng mọi menu đang mở (trừ menu của card vừa bấm nút "⋯")
  $$('.customer-card.menu-open').forEach((el) => {
    if (!(menuBtn && el === card)) el.classList.remove('menu-open');
  });
  if (menuBtn) { card.classList.toggle('menu-open'); return; }

  const btn = e.target.closest('button[data-action]');
  if (btn) {
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') openForm(id);
    if (btn.dataset.action === 'delete') confirmDelete(id);
    return;
  }
  // Bấm vào link SĐT → để nó mở Zalo/gọi bình thường, không mở trang chi tiết
  if (e.target.closest('a')) return;
  // Bấm vào chỗ trống còn lại của card → mở trang chi tiết khách
  if (card?.dataset.id) openDetail(card.dataset.id);
});

// Bấm ra ngoài card → đóng menu "⋯" đang mở
document.addEventListener('click', (e) => {
  if (!e.target.closest('.customer-card')) {
    $$('.customer-card.menu-open').forEach((el) => el.classList.remove('menu-open'));
  }
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

  // Ô "Ghi chú cho lần đổi tiến độ" chỉ hiện khi bậc thực sự khác lúc mở form.
  formOriginalStage = c.care_stage || '';
  f.care_stage_note.value = '';
  toggleCareStageNote();

  updateMenhPreview();
  toggleEvalReason();
  $('#form-modal').showModal();
}

// Hiện ô ghi chú-đổi-bậc khi care_stage được chọn khác giá trị lúc mở form.
function toggleCareStageNote() {
  const f = $('#customer-form');
  const changed = !!f.care_stage.value && f.care_stage.value !== formOriginalStage;
  $('#care-stage-note-wrap').hidden = !changed;
  if (!changed) f.care_stage_note.value = '';
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
  // Ghi chú cho lần đổi bậc (chỉ dùng khi care_stage thực sự đổi — db.js tự kiểm).
  const opts = { careStageNote: f.care_stage_note.value.trim() || null };
  if (editingId) await CRM.update(editingId, payload, opts);
  else await CRM.create(payload, opts);
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
let editingHistoryAt = null; // mốc lịch sử đang sửa note (theo 'at'), null = không sửa

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

// Timestamp tương đối kiểu "2 giờ trước" cho "lần cập nhật cuối" trên card.
// Xa hơn 1 tuần thì hiện ngày DD/MM/YYYY cho gọn.
function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return formatDate(iso.slice(0, 10));
}

// Thời điểm cho mốc lịch sử, kiểu "2h30, 30/8/2026" (giờ địa phương).
function formatLogTime(iso) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${dt.getHours()}h${mm}, ${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
}

// Khoảng cách giữa 2 mốc, kiểu "2 ngày 23 giờ" / "3 giờ 15 phút" / "40 phút".
function formatDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return 'chưa tới 1 phút';
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d} ngày ${h} giờ` : `${d} ngày`;
  if (h > 0) return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
  return `${m} phút`;
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
  editingHistoryAt = null; // mở khách mới → thoát chế độ sửa note cũ

  $('#detail-name').textContent = c.full_name || '(chưa có tên)';
  $('#detail-phone').textContent = c.phone || DASH;
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

  renderCareHistory(c.care_stage_history);

  showDetailScreen();
  window.scrollTo(0, 0);
}

// Timeline lịch sử chăm sóc: mỗi mốc là 1 khối ô (tô màu theo bậc), giữa các
// mốc hiện khoảng thời gian; timestamp + note để mờ hơn. Cũ ở trên, mới ở dưới.
// Note của từng mốc sửa được tại chỗ (chỉ đổi note, không đụng stage/thời gian).
function renderCareHistory(history) {
  const section = $('#detail-history-section');
  const box = $('#detail-history');
  const list = Array.isArray(history) ? [...history] : [];
  if (list.length === 0) { section.hidden = true; box.innerHTML = ''; return; }
  section.hidden = false;
  list.sort((a, b) => (a.at || '').localeCompare(b.at || '')); // theo thời gian tăng dần

  let html = '';
  list.forEach((entry, i) => {
    if (i > 0) {
      const gap = new Date(entry.at) - new Date(list[i - 1].at);
      html += `<div class="cs-gap">${escapeHtml(formatDuration(gap))}</div>`;
    }
    const color = careColor(entry.stage);
    const at = escapeHtml(entry.at || '');
    const editing = entry.at === editingHistoryAt;
    let noteHtml;
    if (editing) {
      // Giá trị input sẽ set bằng JS sau khi render (tránh lỗi escape dấu ").
      noteHtml = `
        <div class="cs-note-edit">
          <input class="cs-note-input" type="text" placeholder="Ghi chú cho mốc này..." />
          <button class="btn-small" data-hist-save="${at}">Lưu</button>
          <button class="btn-small" data-hist-cancel="${at}">Huỷ</button>
        </div>`;
    } else if (entry.note) {
      noteHtml = `<span class="cs-sep"> · </span><span class="cs-note-text">${escapeHtml(entry.note)}</span>
        <button class="cs-note-btn" data-hist-edit="${at}" title="Sửa ghi chú">✎</button>`;
    } else {
      noteHtml = `<span class="cs-sep"> · </span><button class="cs-note-add" data-hist-edit="${at}">+ ghi chú</button>`;
    }
    html += `
      <div class="cs-entry" style="--ring:${color}">
        <span class="cs-stage">${escapeHtml(entry.stage || 'Chưa xác định')}</span>
        <div class="cs-meta">
          <span class="cs-time">${escapeHtml(formatLogTime(entry.at))}</span>
          <span class="cs-note-wrap">${noteHtml}</span>
        </div>
      </div>`;
  });
  box.innerHTML = html;

  // Đang sửa 1 mốc → nạp note cũ vào input + focus (đặt con trỏ cuối chuỗi).
  if (editingHistoryAt) {
    const inp = box.querySelector('.cs-note-input');
    const entry = list.find((e) => e.at === editingHistoryAt);
    if (inp) {
      inp.value = entry && entry.note ? entry.note : '';
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }
}

// Vẽ lại riêng phần lịch sử của khách đang xem (sau khi đổi trạng thái sửa).
function rerenderCareHistory() {
  const c = allCustomers.find((x) => x.id === detailId);
  renderCareHistory(c ? c.care_stage_history : []);
}

// Lưu note đã sửa của 1 mốc rồi vẽ lại.
async function saveHistoryNote(at, note) {
  if (detailId) {
    await CRM.updateCareHistoryNote(detailId, at, note);
    allCustomers = await CRM.list();
  }
  editingHistoryAt = null;
  rerenderCareHistory();
}

// Bấm trong timeline lịch sử: ✎/+ghi chú → vào sửa; Lưu/Huỷ → thoát.
$('#detail-history')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-hist-edit]');
  if (editBtn) { editingHistoryAt = editBtn.dataset.histEdit; rerenderCareHistory(); return; }
  const saveBtn = e.target.closest('[data-hist-save]');
  if (saveBtn) {
    const inp = $('#detail-history .cs-note-input');
    saveHistoryNote(saveBtn.dataset.histSave, inp ? inp.value.trim() || null : null);
    return;
  }
  const cancelBtn = e.target.closest('[data-hist-cancel]');
  if (cancelBtn) { editingHistoryAt = null; rerenderCareHistory(); }
});

// Trong ô sửa note: Enter = Lưu, Esc = Huỷ.
$('#detail-history')?.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('cs-note-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveHistoryNote(editingHistoryAt, e.target.value.trim() || null); }
  else if (e.key === 'Escape') { e.preventDefault(); editingHistoryAt = null; rerenderCareHistory(); }
});

// ---------------------------------------------------------- DASHBOARD -----

// Chuyển tab giữa danh sách khách và bảng tổng quan.
function showListView() {
  $('#list-view').hidden = false;
  $('#dashboard-view').hidden = true;
  $('#tab-list').classList.add('is-active');
  $('#tab-dashboard').classList.remove('is-active');
}
function showDashboardView() {
  $('#list-view').hidden = true;
  $('#dashboard-view').hidden = false;
  $('#tab-list').classList.remove('is-active');
  $('#tab-dashboard').classList.add('is-active');
  renderDashboard();
}

// ---- helper nhỏ ----
function pctOf(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }
function daysSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return isNaN(t) ? Infinity : Math.floor((Date.now() - t) / 86400000);
}
function mondayOf(d) {
  const dt = new Date(d); dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // lùi về thứ Hai
  return dt;
}
function lastNWeeks(n) {
  const start = mondayOf(new Date());
  return Array.from({ length: n }, (_, i) => {
    const w = new Date(start); w.setDate(w.getDate() - (n - 1 - i) * 7); return w;
  });
}
function ddmm(d) { return `${d.getDate()}/${d.getMonth() + 1}`; }

// Chỉ số bậc tuyến tính CAO NHẤT khách đã đạt (cho phễu). Suy từ lịch sử + bậc
// hiện tại. Bậc trống coi như 0 (Chưa gọi được); 'Không quan tâm-kết thúc' dựa
// vào lịch sử để biết đã đi tới đâu trước khi rớt. -1 = chưa vào phễu.
function funnelMaxIndex(c) {
  let maxIdx = c.care_stage ? CARE_STAGES.indexOf(c.care_stage) : 0;
  const hist = Array.isArray(c.care_stage_history) ? c.care_stage_history : [];
  for (const h of hist) {
    const i = CARE_STAGES.indexOf(h.stage);
    if (i > maxIdx) maxIdx = i;
  }
  return maxIdx;
}

// Bar ngang dùng chung: items = [{label, value, sub?, color?}]
function hbars(items, opts = {}) {
  if (!items.length) return `<div class="dash-empty">${opts.empty || 'Chưa có dữ liệu'}</div>`;
  const mx = opts.max || Math.max(...items.map((i) => i.value), 1);
  return `<div class="hbars">` + items.map((i) => `
    <div class="hbar-row">
      <div class="hbar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(pctOf(i.value, mx), 2)}%;background:${i.color || 'var(--teal-light)'}"></div></div>
      <div class="hbar-val">${opts.fmt ? opts.fmt(i.value) : i.value}${i.sub ? `<span class="hbar-sub"> ${escapeHtml(i.sub)}</span>` : ''}</div>
    </div>`).join('') + `</div>`;
}

// Cột dọc (khách mới theo tuần)
function vbars(values, labels, color) {
  const mx = Math.max(...values, 1);
  return `<div class="vbars">` + values.map((v, i) => `
    <div class="vbar-col">
      <div class="vbar-val">${v || ''}</div>
      <div class="vbar" style="height:${Math.round((v / mx) * 66) + 3}px;background:${color || 'var(--teal-light)'}"></div>
      <div class="vbar-x">${escapeHtml(labels[i])}</div>
    </div>`).join('') + `</div>`;
}

// Đường xu hướng (SVG) cho điểm quan tâm TB theo tuần (thang 0–100)
function sparkline(values, labels) {
  const pts = values.map((v, i) => ({ x: i, v }));
  const defined = pts.filter((p) => p.v != null);
  if (defined.length < 1) return '<div class="dash-empty">Chưa đủ dữ liệu</div>';
  const W = 280, H = 90, pad = 10, n = values.length;
  const X = (i) => pad + (n > 1 ? i * (W - 2 * pad) / (n - 1) : (W - 2 * pad) / 2);
  const Y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const path = defined.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const dots = defined.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3" fill="var(--terracotta)"/>`).join('');
  const xlabels = labels.map((l, i) => `<text x="${X(i).toFixed(1)}" y="${H - 1}" class="spark-x">${escapeHtml(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="spark">
    <line x1="${pad}" y1="${Y(50)}" x2="${W - pad}" y2="${Y(50)}" class="spark-mid"/>
    <path d="${path}" fill="none" stroke="var(--terracotta)" stroke-width="2"/>${dots}${xlabels}</svg>`;
}

function dashCard(title, bodyHtml, hint) {
  return `<div class="dash-card">
    <h3>${escapeHtml(title)}</h3>
    ${hint ? `<p class="dash-hint">${escapeHtml(hint)}</p>` : ''}
    ${bodyHtml}
  </div>`;
}

function renderDashboard() {
  const all = allCustomers;
  const box = $('#dashboard-content');
  if (!all.length) {
    box.innerHTML = `<div class="dash-card"><div class="dash-empty">Chưa có khách hàng nào. Thêm khách để xem thống kê.</div></div>`;
    return;
  }
  const active = all.filter((c) => !isCareDone(c.care_stage)); // đang chăm (chưa xong)
  const weeks = lastNWeeks(8);
  const wkeys = new Map(weeks.map((w, i) => [w.getTime(), i]));
  const weekIdx = (iso) => { const k = mondayOf(iso).getTime(); return wkeys.has(k) ? wkeys.get(k) : -1; };

  const cards = [];

  // 1) PHỄU + % chuyển đổi ------------------------------------------------
  const fc = CARE_STAGES.map(() => 0);
  all.forEach((c) => { const m = funnelMaxIndex(c); for (let i = 0; i <= m && i < fc.length; i++) fc[i]++; });
  // % chuyển đổi giữa các bước + tìm nút thắt (bước rớt nhiều nhất)
  const convs = fc.map((v, i) => (i === 0 ? null : pctOf(fc[i], fc[i - 1])));
  let worst = -1, worstV = 101;
  convs.forEach((v, i) => { if (v != null && fc[i - 1] > 0 && v < worstV) { worstV = v; worst = i; } });
  let funnelHtml = '<div class="funnel">';
  CARE_STAGES.forEach((s, i) => {
    if (i > 0) {
      const bottleneck = i === worst;
      funnelHtml += `<div class="funnel-conv ${bottleneck ? 'is-bottleneck' : ''}">↓ ${convs[i]}%${bottleneck ? ' · nút thắt' : ''}</div>`;
    }
    funnelHtml += `<div class="funnel-step" style="--ring:${careColor(s)}">
      <div class="funnel-bar" style="width:${Math.max(pctOf(fc[i], fc[0]), 3)}%"></div>
      <div class="funnel-txt"><span class="funnel-stage">${escapeHtml(s)}</span><span class="funnel-n">${fc[i]}</span></div>
    </div>`;
  });
  funnelHtml += '</div>';
  const dropped = all.filter((c) => c.care_stage === CARE_STAGE_DROPPED).length;
  if (dropped) funnelHtml += `<div class="funnel-dropped">Đã kết thúc "không quan tâm": ${dropped} khách</div>`;
  cards.push(dashCard('Phễu bán hàng theo tiến độ', funnelHtml, '% là tỉ lệ khách đi tiếp sang bước sau — bước "nút thắt" là nơi rớt nhiều nhất.'));

  // 2) ĐÁNH GIÁ + lý do loại ---------------------------------------------
  const evalGood = all.filter((c) => c.evaluation === 'nên chăm').length;
  const evalBad = all.filter((c) => c.evaluation === 'không nên chăm').length;
  const evalNone = all.length - evalGood - evalBad;
  const evalHtml = hbars([
    { label: 'Nên chăm', value: evalGood, color: 'var(--good)', sub: `${pctOf(evalGood, all.length)}%` },
    { label: 'Không nên chăm', value: evalBad, color: 'var(--bad)', sub: `${pctOf(evalBad, all.length)}%` },
    { label: 'Chưa đánh giá', value: evalNone, color: '#c9c4b6', sub: `${pctOf(evalNone, all.length)}%` },
  ]);
  // lý do trong nhóm "không nên chăm"
  const reasonMap = {};
  all.filter((c) => c.evaluation === 'không nên chăm').forEach((c) => {
    const r = (c.evaluation_reason && c.evaluation_reason.trim()) || '(chưa ghi lý do)';
    reasonMap[r] = (reasonMap[r] || 0) + 1;
  });
  const reasonItems = Object.entries(reasonMap).sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: 'var(--bad)', sub: `${pctOf(value, evalBad)}%` }));
  const reasonHtml = evalBad ? `<div class="dash-sub-title">Lý do "không nên chăm"</div>` + hbars(reasonItems) : '';
  cards.push(dashCard('Đánh giá khách', evalHtml + reasonHtml,
    'Đào sâu lý do loại: "dò giá" → cần chốt giá rõ hơn; "không đủ điều kiện" → cần sàng lọc kỹ hơn.'));

  // 3) KHÁCH MỚI THEO TUẦN -----------------------------------------------
  const newByWeek = weeks.map(() => 0);
  all.forEach((c) => { const i = weekIdx(c.created_at); if (i >= 0) newByWeek[i]++; });
  cards.push(dashCard('Khách mới theo tuần', vbars(newByWeek, weeks.map(ddmm)),
    '8 tuần gần nhất (theo ngày tạo).'));

  // 4) ĐIỂM QUAN TÂM TRUNG BÌNH + xu hướng --------------------------------
  const withInterest = all.filter((c) => c.interest_level != null);
  const avgAll = withInterest.length ? Math.round(withInterest.reduce((s, c) => s + c.interest_level, 0) / withInterest.length) : 0;
  const wSum = weeks.map(() => 0), wCnt = weeks.map(() => 0);
  all.forEach((c) => { const i = weekIdx(c.created_at); if (i >= 0 && c.interest_level != null) { wSum[i] += c.interest_level; wCnt[i]++; } });
  const avgByWeek = weeks.map((w, i) => (wCnt[i] ? Math.round(wSum[i] / wCnt[i]) : null));
  const trendHtml = `<div class="big-stat">${avgAll}%<span class="big-stat-cap">quan tâm TB toàn pipeline</span></div>`
    + `<div class="dash-sub-title">Xu hướng khách mới theo tuần</div>` + sparkline(avgByWeek, weeks.map(ddmm));
  cards.push(dashCard('Mức độ quan tâm trung bình', trendHtml,
    'Đường đi lên = khách mới vào đang "nóng" hơn; đi xuống = "nguội" hơn.'));

  // 5) PHÂN BỔ LOẠI CĂN / TOÀ (khách đang chăm) --------------------------
  const tally = (arr, key) => {
    const m = {};
    arr.forEach((c) => { const v = (c[key] && String(c[key]).trim()); if (v) m[v] = (m[v] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
  };
  const aptItems = tally(active, 'apt_type');
  const bldItems = tally(active, 'building_code');
  const distHtml = `<div class="dash-sub-title">Loại căn</div>${hbars(aptItems, { empty: 'Chưa có dữ liệu loại căn' })}`
    + `<div class="dash-sub-title">Mã toà</div>${hbars(bldItems, { empty: 'Chưa có dữ liệu mã toà', color: '#8a7bb0' })}`;
  cards.push(dashCard('Căn hộ quan tâm (khách đang chăm)', distHtml,
    'Căn/toà "hot" nhất trong pipeline — feedback ngược cho đội dự án nên đẩy bán căn nào.'));

  // 6) KHÁCH BỊ BỎ QUÊN (kẹt bậc > 7 ngày) --------------------------------
  const stuck = active.filter((c) => daysSince(c.care_stage_updated_at) > 7)
    .sort((a, b) => daysSince(b.care_stage_updated_at) - daysSince(a.care_stage_updated_at));
  const stuckHtml = stuck.length
    ? `<div class="dash-list">` + stuck.map((c) => `
        <button class="dash-row" data-open="${c.id}">
          <span class="dash-row-name">${escapeHtml(c.full_name || '(chưa tên)')}</span>
          <span class="tag tag-stage">${escapeHtml(careLabel(c.care_stage))}</span>
          <span class="dash-row-badge warn">${daysSince(c.care_stage_updated_at)} ngày</span>
        </button>`).join('') + `</div>`
    : '<div class="dash-empty">Không có khách nào bị kẹt quá 7 ngày 👍</div>';
  cards.push(dashCard(`Khách bị bỏ quên (${stuck.length})`, stuckHtml,
    'Đang chăm nhưng chưa đổi tiến độ quá 7 ngày — cần theo sát lại.'));

  // 7) THỜI GIAN TRUNG BÌNH Ở MỖI BẬC ------------------------------------
  const sSum = {}, sCnt = {};
  all.forEach((c) => {
    const h = Array.isArray(c.care_stage_history) ? [...c.care_stage_history].sort((a, b) => (a.at || '').localeCompare(b.at || '')) : [];
    for (let i = 0; i < h.length - 1; i++) {
      const dur = new Date(h[i + 1].at) - new Date(h[i].at);
      if (dur >= 0 && h[i].stage) { sSum[h[i].stage] = (sSum[h[i].stage] || 0) + dur; sCnt[h[i].stage] = (sCnt[h[i].stage] || 0) + 1; }
    }
  });
  const stageTimeItems = CARE_STAGES.filter((s) => sCnt[s]).map((s) => ({
    label: s, value: sSum[s] / sCnt[s], color: careColor(s), sub: `(${sCnt[s]} lượt)`,
  }));
  cards.push(dashCard('Thời gian trung bình ở mỗi bậc',
    hbars(stageTimeItems, { fmt: (ms) => formatDuration(ms), empty: 'Chưa đủ dữ liệu chuyển bậc' }),
    'Bậc nào tốn nhiều thời gian nhất trước khi khách đi tiếp.'));

  // 8) KHÁCH NÓNG CẦN GỌI NGAY (quan tâm >70% & >7 ngày chưa cập nhật) ----
  const hot = active.filter((c) => (c.interest_level || 0) > 70 && daysSince(c.care_stage_updated_at) > 7)
    .sort((a, b) => (b.interest_level || 0) - (a.interest_level || 0));
  const hotHtml = hot.length
    ? `<div class="dash-list">` + hot.map((c) => `
        <div class="dash-row hot">
          <button class="dash-row-main" data-open="${c.id}">
            <span class="dash-row-name">${escapeHtml(c.full_name || '(chưa tên)')}</span>
            <span class="dash-row-sub">${escapeHtml(c.phone || '')} · quan tâm ${c.interest_level || 0}% · ${daysSince(c.care_stage_updated_at)} ngày chưa động</span>
          </button>
          <a class="dash-row-call" href="tel:${normalizePhone(c.phone)}" aria-label="Gọi">${PHONE_SVG}</a>
        </div>`).join('') + `</div>`
    : '<div class="dash-empty">Không có khách nóng nào đang bị bỏ lỡ 👍</div>';
  cards.push(dashCard(`🔥 Khách nóng cần gọi ngay (${hot.length})`, hotHtml,
    'Quan tâm cao (>70%) nhưng >7 ngày chưa động tới — ưu tiên gọi.'));

  // Masonry: chia card vào cột thấp nhất để các cột cân chiều cao.
  box.innerHTML = '';
  const ncol = Math.min(3, Math.max(1, Math.floor((box.clientWidth || 800) / 360)));
  const wrap = document.createElement('div');
  wrap.className = 'dash-cols';
  const cols = Array.from({ length: ncol }, () => {
    const c = document.createElement('div'); c.className = 'dash-col'; wrap.appendChild(c); return c;
  });
  box.appendChild(wrap);
  for (const cardHtml of cards) {
    let shortest = cols[0];
    for (const c of cols) if (c.offsetHeight < shortest.offsetHeight) shortest = c;
    const tmp = document.createElement('div');
    tmp.innerHTML = cardHtml;
    shortest.appendChild(tmp.firstElementChild);
  }
}

// Bấm 1 dòng khách trong dashboard → mở trang chi tiết
$('#dashboard-content')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-open]');
  if (el) openDetail(el.dataset.open);
});

// Đổi kích thước cửa sổ → chia lại cột masonry (chỉ khi đang xem dashboard)
let _dashResizeT = null;
window.addEventListener('resize', () => {
  if ($('#dashboard-view').hidden) return;
  clearTimeout(_dashResizeT);
  _dashResizeT = setTimeout(renderDashboard, 200);
});

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
  $('#tab-list').addEventListener('click', showListView);
  $('#tab-dashboard').addEventListener('click', showDashboardView);
  $('#detail-back-btn').addEventListener('click', () => { detailId = null; showAppScreen(); });
  $('#detail-edit-btn').addEventListener('click', () => { if (detailId) openForm(detailId); });
  $('#customer-form').addEventListener('submit', handleFormSubmit);
  $('#cancel-form-btn').addEventListener('click', closeForm);
  $('#customer-form').dob.addEventListener('input', updateMenhPreview);
  $('#customer-form').evaluation.addEventListener('change', toggleEvalReason);
  $('#customer-form').care_stage.addEventListener('change', toggleCareStageNote);
  $('#customer-form').interest_level.addEventListener('input', (e) => {
    $('#interest-output').textContent = e.target.value + '%';
  });

  $('#search-input').addEventListener('input', () => {
    // Gõ tìm khi đang ở tab Tổng quan → tự chuyển sang tab Khách hàng để thấy kết quả.
    if ($('#search-input').value.trim() && $('#dashboard-view').hidden === false) showListView();
    renderList();
  });
  $('#reload-btn').addEventListener('click', handleReload);
  $('#user-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#topbar-menu').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#topbar-menu')) $('#topbar-menu').classList.remove('open');
  });
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
