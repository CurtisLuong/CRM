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

// 'Không chốt-kết thúc' KHÔNG phải bậc thứ 8 của phễu — nó là 1 trạng thái
// KẾT THÚC quá trình chăm sóc mà không chốt được khách. Về mặt "đã xong hay chưa"
// nó tương đương bậc 7 (đều là xong), nhưng hiển thị vòng tròn màu xám để phân
// biệt "kết thúc nhưng không mua" với "đã ký hợp đồng".
const CARE_STAGE_DROPPED = 'Không chốt-kết thúc';

// Danh sách đổ vào các <select>: 7 bậc + trạng thái kết thúc ở cuối cùng.
const CARE_STAGE_OPTIONS = [...CARE_STAGES, CARE_STAGE_DROPPED];

// Hai trạng thái coi là "chăm sóc đã xong" — mặc định ẩn khỏi dashboard.
const CARE_DONE_STAGES = ['Đã ký hợp đồng mua bán', CARE_STAGE_DROPPED];

// Đổi bậc chăm sóc → TỰ set mức quan tâm (chỉ các bậc dưới; bậc khác giữ nguyên).
// Kéo slider bằng tay sẽ ghi đè giá trị tự động này. 'Không chốt-kết thúc' → 0%.
const STAGE_INTEREST = {
  'Đang chăm sóc qua Zalo': 60,
  'Đã yêu cầu hỗ trợ hồ sơ': 70,
  'Đã booking': 90,
  'Đã ký hợp đồng mua bán': 100,
  [CARE_STAGE_DROPPED]: 0,
};

// Các bậc có thể LẶP LẠI nhiều lần mà vẫn ở nguyên bậc đó — mỗi lần liên hệ là 1
// mốc riêng trong lịch sử để tiện theo dõi (vd gọi mãi không nghe, hẹn lại nhiều
// lần). Chỉ những bậc này mới cho "ghi thêm lần".
const CARE_STAGES_REPEATABLE = ['Chưa gọi được', 'Hẹn gọi lại'];
function isRepeatableStage(stage) {
  return CARE_STAGES_REPEATABLE.includes(stage);
}

// Ghi chú TỰ ĐỘNG: lấy note của mốc care stage MỚI NHẤT có ghi chú (quét lịch sử
// từ mới → cũ, lấy note đầu tiên khác rỗng). Không có note nào → null. KHÔNG lưu
// xuống DB — tính lại mỗi lần hiển thị nên luôn bám theo note care stage mới nhất.
function autoNoteFromHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const sorted = [...history].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const n = (sorted[i].note || '').trim();
    if (n) return n;
  }
  return null;
}

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
// bỏ trống → 1, 7 bậc phễu → 1-7, 'Không chốt-kết thúc' → 8 (xếp cuối cùng).
function careSortRank(stage) {
  if (stage === CARE_STAGE_DROPPED) return 8;
  const idx = CARE_STAGES.indexOf(stage);
  return idx === -1 ? 1 : idx + 1;
}

// 4 bậc MỨC QUAN TÂM → nhãn + màu (dùng cho viền trái card + badge trên card).
// Ngưỡng: Nguội <35, Ấm 35–<60, Nóng 60–<80, Rất nóng >=80. Xếp min giảm dần để
// find() lấy đúng bậc đầu tiên khách đạt.
const INTEREST_TIERS = [
  { key: 'ratnong', label: 'Rất nóng', color: '#a8302a', min: 80 },
  { key: 'nong',    label: 'Nóng',     color: '#c94f3e', min: 60 },
  { key: 'am',      label: 'Ấm',       color: '#e8a33d', min: 35 },
  { key: 'nguoi',   label: 'Nguội',    color: '#8b93a0', min: 0 },
];
function interestTier(pct) {
  const v = pct || 0;
  return INTEREST_TIERS.find((t) => v >= t.min) || INTEREST_TIERS[INTEREST_TIERS.length - 1];
}

const EVAL_REASONS = [
  'Không đủ điều kiện',
  'Khách dò giá',
  'Khách hồ sơ quá phức tạp',
  'Khách không quan tâm',
  'Khác',
];

// Loại căn có sẵn (select + "Khác" tự nhập, không lưu vào danh sách chung).
const APT_TYPES = ['1N-1WC', '1N+, 1WC', '2N-2WC', '2N+, 2WC', '3N-2WC'];

// Nghề nghiệp (khớp enum ở schema) — dùng để lọc giá trị OCR trả về cho hợp lệ.
const OCCUPATIONS = ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội'];

// Icon điện thoại (SVG inline, tô theo màu chữ, cỡ ăn theo font-size chỗ đặt).
// Zalo dùng ảnh icons/Zalo-icon.png (đặt trong <img>).
const PHONE_SVG = '<svg class="ic-phone" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

let sb = null;
let currentUser = null;
let allCustomers = [];
let editingId = null;
let formOriginalStage = ''; // care_stage lúc mở form — để biết có đổi bậc không
let pendingOcrNote = null;  // ghi chú OCR đọc được → thêm thành 1 note sau khi tạo khách
let pendingOcrImage = null; // ảnh OCR (blob đã nén) → lưu thành tài liệu reg_image sau khi tạo khách

// Nhãn "Nguồn khách" (source) — hệ thống tự set, user không sửa.
const SOURCE_LABELS = {
  manual: 'Quảng cáo (nhập tay)',
  ocr: 'Quảng cáo (từ ảnh)',
  landing: 'Landing page',
};
function sourceLabel(s) { return SOURCE_LABELS[s] || SOURCE_LABELS.manual; }

// Nhãn hiển thị cho loại tài liệu (kind). Mở rộng khi có loại giấy tờ mới.
const DOC_KIND_LABELS = {
  reg_image: 'Ảnh đăng ký',
  cccd: 'CCCD/CMND',
  so_ho_khau: 'Sổ hộ khẩu',
  hop_dong: 'Hợp đồng',
  khac: 'Khác',
};

// Dự án (multi-select, danh sách tự quản lý — lưu ở bảng project_options)
let projectOptions = [];        // [{id, name}]
let selectedProjects = [];      // tên dự án đang chọn ở form
let projManageMode = false;     // đang bật chế độ xoá dự án
const LS_PROJ_CACHE = 'crm_project_options';   // cache đọc offline
const LS_LAST_PROJECTS = 'crm_last_projects';  // lựa chọn gần nhất → mặc định khách mới

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
  await loadProjectOptions();
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
  const err = CRM.lastSyncError && CRM.lastSyncError();
  badge.classList.remove('sync-err');
  if (!CRM.isOnline()) {
    badge.textContent = '🔴 Offline' + (n ? ` — ${n} thay đổi chờ` : '');
  } else if (n > 0 && err) {
    // Có thao tác đẩy lên server bị lỗi (không phải mất mạng) → kẹt, cần xử lý.
    badge.textContent = `🔴 Kẹt đồng bộ (${n}) — chạm để xử lý`;
    badge.classList.add('sync-err');
  } else if (n > 0) {
    badge.textContent = `🟡 Đang đồng bộ ${n} thay đổi...`;
  } else {
    badge.textContent = '🟢 Đã đồng bộ';
  }
}
window.addEventListener('online', updateSyncBadge);
window.addEventListener('offline', updateSyncBadge);

// Bấm badge khi đang kẹt → xem lỗi + cho phép xoá thao tác kẹt (escape hatch).
$('#sync-badge')?.addEventListener('click', async () => {
  const n = await CRM.pendingCount();
  if (!n) return;
  const err = CRM.lastSyncError && CRM.lastSyncError();
  await CRM.flushQueue(); // thử đẩy lại 1 lần trước
  if ((await CRM.pendingCount()) === 0) { updateSyncBadge(); alert('Đã đồng bộ xong.'); return; }
  const detail = err ? `Lỗi: ${err.message}${err.code ? ' (' + err.code + ')' : ''}\n\n` : '';
  if (confirm(`${detail}Có ${n} thay đổi không đẩy lên server được (đang kẹt).\n\nBỏ qua & xoá các thay đổi kẹt này?\n(Dữ liệu khách đã lưu trên máy vẫn còn — chỉ ngừng cố đẩy các thao tác lỗi. Nếu cần, mở khách đó bấm Lưu để đồng bộ lại.)`)) {
    await CRM.clearQueue();
    await refreshList();
    updateSyncBadge();
  }
});

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

// Máy Mac để bàn (KHÔNG phải iPhone/iPad giả UA Macintosh). iPad Safari cũng báo
// "Macintosh" nhưng có cảm ứng (maxTouchPoints > 1) → loại ra để iOS vẫn dùng web.
function isMacDesktop() {
  const ua = navigator.userAgent || '';
  const isMac = /Macintosh|Mac OS X/.test(ua);
  const isTouchIOS = /iPhone|iPad|iPod/.test(ua) || (isMac && navigator.maxTouchPoints > 1);
  return isMac && !isTouchIOS;
}

function zaloLink(phone) {
  const clean = normalizePhone(phone).replace(/^\+?84/, '0');
  // Trên Mac có app Zalo native: deep-link mở THẲNG cửa sổ chat của khách (scheme
  // này dò được từ app Zalo Mac — xem CHANGELOG 2026-08-20). Các nền tảng khác
  // (Android/iOS/Windows...) dùng link web zalo.me, tự mở app nếu có (App/Universal
  // Links). Lưu ý: nếu Mac chưa cài app Zalo thì bấm sẽ không mở gì — chấp nhận
  // được vì đây là công cụ nội bộ cho sale luôn dùng Zalo.
  if (isMacDesktop()) return `zalo://conversation?phone=${clean}`;
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
    // Mặc định: 1) tiến độ chăm sóc tăng dần (bậc 1 → 7);
    // 2) cùng bậc → mức quan tâm GIẢM dần (cao → thấp);
    // 3) bằng nhau → khách mới tạo gần đây lên trước (created_at giảm dần).
    arr.sort((a, b) => {
      const d = careSortRank(a.care_stage) - careSortRank(b.care_stage);
      if (d !== 0) return d;
      const i = (b.interest_level || 0) - (a.interest_level || 0);
      if (i !== 0) return i;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }
  else if (sortBy === 'interest_desc') arr.sort((a, b) => (b.interest_level || 0) - (a.interest_level || 0));
  else if (sortBy === 'name_asc') arr.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi'));
  else if (sortBy === 'updated_desc') arr.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return arr;
}

function renderList() {
  let list = sortCustomers(allCustomers.filter(matchesFilters));
  // Nhắc gọi ĐÈ sort hiện tại: card có tag nhắc gọi luôn nổi lên đầu, sắp theo
  // giờ hẹn tăng dần (quá/đến giờ → sắp gọi nhất → xa hơn).
  const reminders = new Map();
  for (const c of list) { const r = callReminder(c); if (r) reminders.set(c.id, r); }
  if (reminders.size) {
    const withR = [], without = [];
    for (const c of list) (reminders.has(c.id) ? withR : without).push(c);
    withR.sort((a, b) => reminders.get(a.id).sort - reminders.get(b.id).sort);
    list = [...withR, ...without];
  }
  const container = $('#customer-list');
  container.innerHTML = '';
  $('#empty-state').hidden = list.length !== 0;
  $('#result-count').textContent = `${list.length} khách hàng`;

  for (const c of list) {
    const card = document.createElement('div');
    card.className = 'customer-card';
    card.dataset.id = c.id; // để bấm vào thân card mở xem/sửa đầy đủ
    if (c.evaluation === 'không nên chăm') card.classList.add('is-dropped');
    // Viền trái card = màu bậc mức quan tâm (Nguội/Ấm/Nóng/Rất nóng).
    const tier = interestTier(c.interest_level ?? 0);
    card.style.setProperty('--tier', tier.color);

    // Tiến độ chăm sóc → vòng NHỎ (đĩa conic đầy theo bậc) + "x/7" + tên bước.
    const level = careLevel(c.care_stage);
    const ringPct = Math.round((level / 7) * 100);
    const ringColor = careColor(c.care_stage);
    // Timestamp phản ánh lần đổi Tiến độ chăm sóc cuối (không phải mọi lần sửa).
    // Dòng cũ chưa có care_stage_updated_at thì tạm dùng updated_at.
    const updated = timeAgo(c.care_stage_updated_at || c.updated_at);
    const menhShort = c.menh ? c.menh.split(' — ')[0] : ''; // "Mệnh Kim" (bỏ nạp âm dài phía sau)
    // Link Zalo: web (http) mở tab mới; app native (zalo://) mở app tại chỗ, không target.
    const zaloHref = zaloLink(c.phone);
    const zaloAttr = zaloHref.startsWith('http') ? 'target="_blank" rel="noopener"' : '';
    // Ghi chú trên card: note TỰ ĐỘNG (từ care stage mới nhất) lên đầu, rồi note tự nhập.
    // Cắt còn 2 dòng bằng CSS (.card-notes line-clamp). Cũ ở dưới, mới ở trên.
    const autoNote = autoNoteFromHistory(c.care_stage_history);
    // Mới nhất lên trên (tạo sau = cập nhật hơn).
    const manualNotes = (Array.isArray(c.notes_manual) ? [...c.notes_manual] : [])
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    const noteLines = [];
    if (autoNote) noteLines.push(`<span class="note-auto">• ${escapeHtml(autoNote)}</span>`);
    for (const n of manualNotes) noteLines.push(`• ${escapeHtml(n.text || '')}`);
    const cardNotesInner = noteLines.join('<br>');
    card.innerHTML = `
      <div class="card-head">
        <div class="card-name">${escapeHtml(c.full_name || '(chưa có tên)')}</div>
        <div class="card-head-right">
          ${reminders.has(c.id) ? `<button class="call-tag call-${reminders.get(c.id).state}" data-calltag="${c.id}">${escapeHtml(reminders.get(c.id).text)}</button>` : ''}
          <div class="card-menu">
            <button class="card-menu-btn" data-action="menu" aria-label="Tuỳ chọn khác">⋯</button>
            <div class="card-menu-pop">
              <button class="menu-item" data-action="schedule" data-id="${c.id}">Hẹn lịch gọi</button>
            </div>
          </div>
        </div>
      </div>
      <div class="phone-row">
        <span class="phone-number">${escapeHtml(c.phone || '')}</span>
        <a class="card-phone" href="tel:${normalizePhone(c.phone)}" aria-label="Gọi ${escapeHtml(c.phone || '')}">${PHONE_SVG}</a>
        <a class="card-zalo" href="${zaloHref}" ${zaloAttr} aria-label="Nhắn Zalo">
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
        <span class="tag tag-interest ti-${tier.key}"><span class="ti-dot">◆</span> ${tier.label}</span>
      </div>
      <div class="card-notes">${cardNotesInner}</div>
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

  // Bấm tag nhắc gọi → popup xác nhận gọi (không mở trang chi tiết)
  const callTag = e.target.closest('[data-calltag]');
  if (callTag) { openCallAction(callTag.dataset.calltag); return; }

  const btn = e.target.closest('button[data-action]');
  if (btn) {
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') openForm(id);
    // Hẹn lịch gọi: đóng menu "⋯" rồi mở helper hẹn lịch (cùng modal ở trang chi tiết).
    if (btn.dataset.action === 'schedule') { card?.classList.remove('menu-open'); openScheduler(id); }
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

// --------------------------------------------------------- DỰ ÁN ----------

// Nạp danh sách dự án: online → lấy từ Supabase + cache; offline → đọc cache.
async function loadProjectOptions() {
  try {
    if (sb && CRM.isOnline()) {
      const { data, error } = await sb.from('project_options').select('id,name').order('created_at');
      if (error) throw error;
      projectOptions = data || [];
      localStorage.setItem(LS_PROJ_CACHE, JSON.stringify(projectOptions));
      return;
    }
  } catch (e) { console.warn('Nạp dự án lỗi, dùng cache:', e.message); }
  try { projectOptions = JSON.parse(localStorage.getItem(LS_PROJ_CACHE) || '[]'); }
  catch { projectOptions = []; }
}

// Thêm dự án mới (cần online — thao tác hiếm). Trả về true nếu thành công.
async function addProjectOption(name) {
  name = (name || '').trim();
  if (!name) return false;
  if (projectOptions.some((o) => o.name === name)) return true; // đã có
  if (!CRM.isOnline()) { alert('Cần có mạng để thêm dự án mới.'); return false; }
  const { data, error } = await sb.from('project_options').insert({ name }).select('id,name').single();
  if (error) { alert('Thêm dự án lỗi: ' + error.message); return false; }
  projectOptions.push(data);
  localStorage.setItem(LS_PROJ_CACHE, JSON.stringify(projectOptions));
  return true;
}

// Xoá 1 dự án khỏi danh sách (cần online).
async function removeProjectOption(id) {
  if (!CRM.isOnline()) { alert('Cần có mạng để xoá dự án.'); return; }
  const { error } = await sb.from('project_options').delete().eq('id', id);
  if (error) { alert('Xoá dự án lỗi: ' + error.message); return; }
  projectOptions = projectOptions.filter((o) => o.id !== id);
  localStorage.setItem(LS_PROJ_CACHE, JSON.stringify(projectOptions));
}

// Vẽ các chip dự án trong form (chọn nhiều; chế độ Quản lý hiện nút xoá).
// Dropdown chọn nhiều dự án: nút tóm tắt (tên đã chọn) + panel danh sách checkbox.
function renderProjSelect() {
  const btn = $('#proj-dropdown-btn');
  if (btn) btn.textContent = selectedProjects.length ? selectedProjects.join(', ') : '— Chọn dự án —';
  const box = $('#proj-options');
  if (!box) return;
  box.innerHTML = projectOptions.map((o) => {
    const sel = selectedProjects.includes(o.name);
    return `<div class="proj-opt ${sel ? 'is-sel' : ''}">
      <label class="proj-opt-label">
        <input type="checkbox" data-projtoggle="${escapeHtml(o.name)}" ${sel ? 'checked' : ''} />
        <span>${escapeHtml(o.name)}</span>
      </label>
      ${projManageMode ? `<button type="button" class="proj-chip-del" data-projdel="${o.id}" title="Xoá dự án khỏi danh sách">✕</button>` : ''}
    </div>`;
  }).join('') || '<div class="proj-empty">Chưa có dự án nào</div>';
}

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
  f.occupation.value = c.occupation || '';
  f.income.value = c.income || '';
  f.residence.value = c.residence || '';
  // Thời gian đăng ký: khách cũ dùng registered_at (hoặc created_at); khách mới = giờ hiện tại.
  const reg = c.registered_at ? new Date(c.registered_at) : (c.created_at ? new Date(c.created_at) : new Date());
  f.registered_at.value = toLocalDatetimeInput(reg);
  // Loại căn: nếu khớp option có sẵn → chọn; nếu khác → "Khác" + ô tự nhập.
  const at = c.apt_type || '';
  if (!at) { f.apt_type_select.value = ''; f.apt_type_other.value = ''; }
  else if (APT_TYPES.includes(at)) { f.apt_type_select.value = at; f.apt_type_other.value = ''; }
  else { f.apt_type_select.value = '__other'; f.apt_type_other.value = at; }
  toggleAptOther();
  f.apt_code.value = c.apt_code || '';
  f.building_code.value = c.building_code || '';
  f.apt_price.value = c.apt_price || '';
  f.interest_level.value = c.interest_level ?? 50;
  $('#interest-output').textContent = (c.interest_level ?? 50) + '%';
  f.care_stage.value = c.care_stage || '';
  f.evaluation.value = c.evaluation || '';
  f.evaluation_reason.value = c.evaluation_reason || '';

  // Dự án: khách cũ dùng lịch sử của khách; khách mới lấy lựa chọn gần nhất
  // (localStorage) làm mặc định nếu chưa chủ động set.
  if (id) selectedProjects = Array.isArray(c.projects) ? [...c.projects] : [];
  else { try { selectedProjects = JSON.parse(localStorage.getItem(LS_LAST_PROJECTS) || '[]'); } catch { selectedProjects = []; } }
  projManageMode = false;
  $('#proj-add-row').hidden = true;
  $('#proj-add-btn').hidden = false;
  $('#proj-dropdown-panel').hidden = true; // dropdown thu gọn mỗi lần mở form
  renderProjSelect();

  // Ô "Ghi chú" khi tạo/sửa khách — luôn để trống (là ô THÊM ghi chú mới).
  f.new_note.value = '';

  // Ô "Ghi chú cho lần đổi tiến độ" chỉ hiện khi bậc thực sự khác lúc mở form.
  formOriginalStage = c.care_stage || '';
  f.care_stage_note.value = '';
  toggleCareStageNote();

  // Reset trạng thái OCR mỗi lần mở form (ghi chú tạm + ảnh tạm + dòng thông báo).
  pendingOcrNote = null;
  pendingOcrImage = null;
  const ocrStatus = $('#ocr-status'); if (ocrStatus) ocrStatus.textContent = '';

  // Nút Xoá khách + mục Tài liệu: chỉ khi SỬA (đã có khách). Khách mới thì ẩn.
  $('#delete-customer-btn').hidden = !id;
  $('#form-docs-section').hidden = !id;
  $('#form-doc-status').textContent = '';
  $('#form-doc-file').value = '';
  if (id) loadFormDocs(id);

  updateMenhPreview();
  toggleEvalReason();
  $('#form-modal').showModal();
}

// Hiện ô "loại căn khác" khi chọn "Khác..."
function toggleAptOther() {
  const f = $('#customer-form');
  f.apt_type_other.hidden = f.apt_type_select.value !== '__other';
}

// Hiện ô ghi chú khi: (a) đổi sang bậc khác, HOẶC (b) chọn lại ĐÚNG bậc cũ nhưng
// là bậc lặp được (Chưa gọi được / Hẹn gọi lại) → cho ghi thêm 1 lần liên hệ mới.
function toggleCareStageNote() {
  const f = $('#customer-form');
  const val = f.care_stage.value;
  const changed = !!val && val !== formOriginalStage;
  const relog = !!val && val === formOriginalStage && isRepeatableStage(val);
  const show = changed || relog;
  $('#care-stage-note-wrap').hidden = !show;
  // Nhãn đổi theo ngữ cảnh để người dùng hiểu đang làm gì.
  const lbl = $('#care-stage-note-label');
  if (lbl) lbl.textContent = relog
    ? 'Ghi chú lần liên hệ mới (thêm 1 mốc, vẫn ở bậc này)'
    : 'Ghi chú cho lần đổi tiến độ này';
  if (!show) f.care_stage_note.value = '';
}

// Khi ĐỔI bậc chăm sóc: tự chỉnh mức quan tâm theo bậc (nếu bậc có map). Riêng
// 'Không chốt-kết thúc' → 0% + tự đánh giá 'không nên chăm'. Người dùng kéo
// slider tay sau đó sẽ ghi đè (giá trị hiển thị lúc Lưu là giá trị cuối cùng).
function onCareStageChange() {
  toggleCareStageNote();
  const f = $('#customer-form');
  const stage = f.care_stage.value;
  if (Object.prototype.hasOwnProperty.call(STAGE_INTEREST, stage)) {
    const v = STAGE_INTEREST[stage];
    f.interest_level.value = v;
    $('#interest-output').textContent = v + '%';
  }
  if (stage === CARE_STAGE_DROPPED) {
    f.evaluation.value = 'không nên chăm';
    toggleEvalReason();
  }
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
    occupation: f.occupation.value || null,
    income: f.income.value.trim() || null,
    residence: f.residence.value.trim() || null,
    registered_at: f.registered_at.value ? new Date(f.registered_at.value).toISOString() : null,
    apt_type: (f.apt_type_select.value === '__other' ? f.apt_type_other.value.trim() : f.apt_type_select.value) || null,
    projects: selectedProjects,
    apt_code: f.apt_code.value.trim() || null,
    building_code: f.building_code.value.trim() || null,
    apt_price: f.apt_price.value ? Number(f.apt_price.value) : null,
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
  // Nhớ lựa chọn dự án lần này làm mặc định cho khách mới sau (nếu không tự set).
  localStorage.setItem(LS_LAST_PROJECTS, JSON.stringify(selectedProjects));
  // Ghi chú cho lần đổi bậc / lần liên hệ mới.
  const note = f.care_stage_note.value.trim() || null;
  const opts = { careStageNote: note };
  // Ghi chú nhập ở form (ô "Ghi chú") → thêm thành 1 mục ghi chú sau khi lưu.
  const formNote = f.new_note.value.trim() || null;
  if (editingId) {
    const newStage = payload.care_stage;
    const orig = formOriginalStage;
    if (newStage && orig && careSortRank(newStage) < careSortRank(orig)) {
      // (a) CẬP NHẬT LÙI: bậc mới thấp hơn bậc cũ → cảnh báo trước khi xoá lịch sử.
      const ok = confirm(
        '⚠️ CẬP NHẬT LÙI TIẾN ĐỘ\n\n' +
        `Từ "${orig}" → "${newStage}".\n\n` +
        `Mọi mốc lịch sử ở bậc CAO HƠN "${newStage}" sẽ bị XOÁ vĩnh viễn ` +
        '(coi các bước sau là nhầm/thử). Tiếp tục?'
      );
      if (!ok) return; // huỷ: giữ nguyên form để sửa lại
      opts.rewind = true;
      opts.keepStages = CARE_STAGE_OPTIONS.filter((s) => careSortRank(s) <= careSortRank(newStage));
    } else if (newStage && newStage === orig && isRepeatableStage(newStage) && note) {
      // (b) Cùng bậc lặp được + có ghi chú → ghi thêm 1 lần liên hệ mới.
      opts.forceLog = true;
    }
    await CRM.update(editingId, payload, opts);
    if (pendingOcrNote) { await CRM.addNote(editingId, pendingOcrNote); pendingOcrNote = null; }
    if (formNote) await CRM.addNote(editingId, formNote);
  } else {
    // Nguồn khách: hệ thống tự set khi tạo — dùng ảnh (OCR) → 'ocr', nhập tay → 'manual'.
    payload.source = pendingOcrImage ? 'ocr' : 'manual';
    const created = await CRM.create(payload, opts);
    // Nếu OCR đọc được 1 ghi chú → thêm thành 1 note tự nhập cho khách vừa tạo.
    if (created && pendingOcrNote) { await CRM.addNote(created.id, pendingOcrNote); pendingOcrNote = null; }
    if (created && formNote) await CRM.addNote(created.id, formNote);
    // Lưu ảnh OCR thành tài liệu reg_image (cần mạng; offline thì bỏ qua, không chặn tạo khách).
    if (created && pendingOcrImage) {
      try { await CRM.uploadDocument(created.id, pendingOcrImage, 'reg_image', 'Ảnh đăng ký'); }
      catch (err) { console.warn('Lưu ảnh đăng ký lỗi:', err); }
      pendingOcrImage = null;
    }
  }
  closeForm();
  await refreshList();
  // Nếu đang mở trang chi tiết khách vừa sửa → vẽ lại cho khớp dữ liệu mới
  if (savedId && !$('#detail-screen').hidden) openDetail(savedId);
}

async function confirmDelete(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!confirm(`Xoá khách "${c?.full_name || ''}"? Không thể hoàn tác.`)) return;
  await CRM.remove(id);
  closeForm();
  if (detailId === id) { detailId = null; showAppScreen(); } // đang xem chi tiết khách này → về danh sách
  await refreshList();
}

// ------------------------------------------------- LƯU VÀO DANH BẠ ----------
// Tạo vCard (.vcf) rồi: điện thoại dùng Web Share (bung "Thêm liên hệ") — mượt nhất;
// desktop fallback tải file .vcf (macOS/Windows mở Danh bạ/Contacts để thêm).
// Tên danh bạ = Họ tên + loại căn; SĐT + ngày sinh + thường trú map vào field khớp;
// còn lại gộp vào NOTE của hồ sơ danh bạ.

function vcardEsc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function buildContactNote(c) {
  const L = [];
  const push = (label, val) => { if (val != null && String(val).trim() !== '') L.push(`${label}: ${val}`); };
  push('Loại căn', c.apt_type);
  push('Dự án', Array.isArray(c.projects) && c.projects.length ? c.projects.join(', ') : '');
  push('Giá', c.apt_price ? formatPrice(c.apt_price) : '');
  push('Mã căn', c.apt_code);
  push('Mã toà', c.building_code);
  push('Giới tính', c.gender);
  push('Hôn nhân', c.marital_status);
  push('Mệnh', c.menh);
  push('Công việc', c.occupation);
  push('Thu nhập', c.income);
  push('Mức quan tâm', c.interest_level != null ? c.interest_level + '%' : '');
  push('Tiến độ', c.care_stage);
  push('Đánh giá', c.evaluation);
  const autoNote = autoNoteFromHistory(c.care_stage_history);
  const manual = Array.isArray(c.notes_manual) ? c.notes_manual.map((n) => n.text).filter(Boolean) : [];
  const notes = [autoNote, ...manual].filter(Boolean);
  if (notes.length) push('Ghi chú', notes.join(' | '));
  push('Nguồn', sourceLabel(c.source));
  return L.join('\n');
}

function buildVCard(c) {
  const fn = (c.full_name || '(chưa có tên)') + (c.apt_type ? ' - ' + c.apt_type : '');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:;' + vcardEsc(fn) + ';;;', 'FN:' + vcardEsc(fn)];
  if (c.phone) lines.push('TEL;TYPE=CELL:' + vcardEsc(c.phone));
  if (c.dob && /^\d{4}-\d{2}-\d{2}$/.test(c.dob)) lines.push('BDAY:' + c.dob);
  if (c.residence) lines.push('ADR;TYPE=HOME:;;;' + vcardEsc(c.residence) + ';;;'); // thường trú → phần "tỉnh/thành"
  const note = buildContactNote(c);
  if (note) lines.push('NOTE:' + vcardEsc(note));
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

async function saveContact(c) {
  if (!c) return;
  const vcf = buildVCard(c);
  const fnBase = ((c.full_name || 'khach') + (c.apt_type ? '-' + c.apt_type : '')).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
  const fileName = `${fnBase || 'khach'}.vcf`;
  // Điện thoại: Web Share API với file → bung màn hình "Thêm liên hệ" / share sheet.
  try {
    const file = new File([vcf], fileName, { type: 'text/vcard' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: c.full_name || 'Liên hệ' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user tự huỷ share
    console.warn('Web Share lỗi, chuyển sang tải .vcf:', e);
  }
  // Desktop / không hỗ trợ share file: tải .vcf (OS mở Danh bạ/Contacts để thêm).
  const url = URL.createObjectURL(new Blob([vcf], { type: 'text/vcard;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#detail-contact-btn')?.addEventListener('click', () => {
  const c = allCustomers.find((x) => x.id === detailId);
  if (c) saveContact(c);
});

// ------------------------------------------------- OCR: NHẬP TỪ ẢNH --------
// Gửi ảnh cho Worker (giữ key Gemini) → nhận JSON field → TỰ ĐIỀN form, KHÔNG lưu
// thẳng. Bắt buộc user rà lại (nhất là SĐT) rồi mới bấm Lưu.

// Thu nhỏ ảnh về tối đa maxDim px + nén JPEG. Trả cả base64 (gửi Gemini) lẫn blob
// (lưu vào Storage) — nhẹ payload, nhanh, đỡ quota, tối ưu dung lượng lưu trữ.
async function fileToScaled(file, maxDim = 1600, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return { base64: dataUrl.split(',')[1], blob, mime: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Điền các field OCR trả về vào form (chỉ field có giá trị; bỏ qua giá trị lạ).
function applyOcrToForm(d) {
  if (!d || typeof d !== 'object') return;
  const f = $('#customer-form');
  if (d.phone) f.phone.value = normalizeOcrPhone(d.phone);
  // Tên: viết hoa chữ ĐẦU mỗi từ ("ngo thi minh thu" / "NGO THI MINH THU" → "Ngo Thi Minh Thu").
  if (d.full_name) f.full_name.value = toTitleCaseName(d.full_name);
  if (['nam', 'nữ', 'khác'].includes(d.gender)) f.gender.value = d.gender;
  if (d.dob && /^\d{4}-\d{2}-\d{2}$/.test(d.dob)) { f.dob.value = d.dob; updateMenhPreview(); }
  if (['đã kết hôn', 'chưa kết hôn'].includes(d.marital_status)) f.marital_status.value = d.marital_status;
  if (OCCUPATIONS.includes(d.occupation)) f.occupation.value = d.occupation;
  if (d.income) f.income.value = String(d.income).trim();
  if (d.residence) f.residence.value = String(d.residence).trim();
  // Loại căn: khớp option có sẵn bất kể dấu cách/phẩy/gạch ("3N, 2WC" ↔ "3N-2WC");
  // khớp → chọn giá trị chuẩn, không khớp → "Khác" + giữ nguyên chữ OCR.
  if (d.apt_type) {
    const raw = String(d.apt_type).trim();
    // Giữ '+' (phân biệt "2N+" với "2N"); chỉ bỏ dấu cách/phẩy/gạch.
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9+]/g, '');
    const canon = APT_TYPES.find((t) => norm(t) === norm(raw));
    if (canon) { f.apt_type_select.value = canon; f.apt_type_other.value = ''; }
    else { f.apt_type_select.value = '__other'; f.apt_type_other.value = raw; }
    toggleAptOther();
  }
  if (d.apt_code) f.apt_code.value = String(d.apt_code).trim();
  if (d.building_code) f.building_code.value = String(d.building_code).trim();
  if (d.apt_price != null && !isNaN(Number(d.apt_price))) f.apt_price.value = Number(d.apt_price);
  if (d.interest_level != null && !isNaN(Number(d.interest_level))) {
    const lv = Math.max(0, Math.min(100, Math.round(Number(d.interest_level))));
    f.interest_level.value = lv;
    $('#interest-output').textContent = lv + '%';
  }
  // Dự án: chỉ chọn tên trùng danh sách có sẵn (tên lạ để user tự thêm).
  if (Array.isArray(d.projects)) {
    for (const name of d.projects) {
      if (projectOptions.some((o) => o.name === name) && !selectedProjects.includes(name)) selectedProjects.push(name);
    }
    renderProjSelect();
  }
  // Thời gian đăng ký từ GIỜ tin nhắn: dựng datetime = giờ đó + ngày. Nếu giờ đó
  // muộn hơn giờ hiện tại (không thể là hôm nay) → lấy ngày HÔM QUA; ngược lại HÔM NAY.
  if (d.message_time && /^\d{1,2}:\d{2}$/.test(String(d.message_time).trim())) {
    const [hh, mm] = String(d.message_time).trim().split(':').map(Number);
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      const now = new Date();
      const cand = new Date(now); cand.setHours(hh, mm, 0, 0);
      if (cand > now) cand.setDate(cand.getDate() - 1); // giờ tin nhắn > giờ hiện tại → hôm qua
      f.registered_at.value = toLocalDatetimeInput(cand);
    }
  }
  // Ghi chú OCR: giữ tạm, sẽ thêm thành 1 note sau khi tạo khách (xem handleFormSubmit).
  pendingOcrNote = (d.note && String(d.note).trim()) || null;
}

// Chuẩn hoá SĐT từ OCR: bỏ ký tự thừa; "+84..." → "0..."; nếu không bắt đầu bằng
// "0" và chưa đủ 10 chữ số thì thêm "0" đầu. (SĐT là master key nên chuẩn hoá bằng
// code cho chắc, không phó thác hẳn cho AI.)
function normalizeOcrPhone(raw) {
  let p = String(raw).replace(/[^\d+]/g, ''); // giữ chữ số và dấu +
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  p = p.replace(/\D/g, ''); // bỏ nốt dấu + còn sót
  // SĐT VN dạng mã quốc gia thiếu dấu "+": "84" + 9 số = 11 chữ số → đổi "84" thành "0".
  if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
  // Thiếu số 0 đầu (vd "912345678") → thêm vào. Số nước ngoài/khác không khớp → giữ nguyên.
  if (!p.startsWith('0') && p.length < 10) p = '0' + p;
  return p;
}

// Viết hoa chữ đầu mỗi từ trong tên (giữ dấu tiếng Việt), gộp khoảng trắng thừa.
function toTitleCaseName(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

async function handleOcrImage(file) {
  if (!file) return;
  const status = $('#ocr-status');
  const workerUrl = (window.APP_CONFIG.WORKER_URL || '').replace(/\/+$/, '');
  if (!workerUrl) { status.textContent = '⚠️ Chưa cấu hình WORKER_URL.'; return; }
  status.textContent = '⏳ Đang đọc ảnh...';
  try {
    const { base64, blob, mime } = await fileToScaled(file);
    pendingOcrImage = blob; // giữ ảnh nén để lưu thành tài liệu reg_image khi Lưu khách
    const { data: { session } } = await sb.auth.getSession();
    const token = session && session.access_token;
    if (!token) throw new Error('Chưa đăng nhập');
    const res = await fetch(`${workerUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: base64, mime }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) {
      const extra = out.detail ? ` — ${String(out.detail).slice(0, 200)}` : '';
      throw new Error((out.error || `Lỗi ${res.status}`) + extra);
    }
    applyOcrToForm(out.data || {});
    status.textContent = '✅ Đã điền — KIỂM TRA kỹ SĐT rồi mới Lưu.';
  } catch (e) {
    console.warn('OCR lỗi:', e);
    status.textContent = '⚠️ Đọc ảnh thất bại: ' + (e.message || 'lỗi không rõ');
  } finally {
    $('#ocr-file').value = ''; // cho phép chọn lại đúng ảnh đó lần nữa
  }
}

// ------------------------------------------------------------ DETAIL ------

let detailId = null; // khách đang xem ở trang chi tiết
let editingHistoryAt = null; // mốc lịch sử đang sửa note (theo 'at'), null = không sửa
let editingNoteAt = null; // ghi chú tự nhập đang sửa (theo 'at'), null = không sửa

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
  const zaloHref = zaloLink(c.phone);
  const zaloBtn = $('#detail-zalo-btn');
  zaloBtn.href = zaloHref;
  // Link web mở tab mới; link app native (zalo://) mở app tại chỗ (bỏ target để khỏi tab trắng).
  if (zaloHref.startsWith('http')) { zaloBtn.target = '_blank'; zaloBtn.rel = 'noopener'; }
  else { zaloBtn.removeAttribute('target'); zaloBtn.removeAttribute('rel'); }

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

  // Lịch gọi + badge đếm ngược (bấm badge để "đã gọi"/"hẹn lại").
  renderDetailCall(c);

  // Ghi chú (note tự động + note tự nhập, dạng bullet)
  editingNoteAt = null;
  renderDetailNotes(c);
  $('#detail-note-add-form').hidden = true;
  $('#detail-note-add-btn').hidden = false;
  $('#detail-note-add-input').value = '';

  // Căn hộ quan tâm
  const aptRows = [
    ['Dự án', (Array.isArray(c.projects) && c.projects.length) ? c.projects.join(', ') : DASH],
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
    ['Công việc', c.occupation || DASH],
    ['Thu nhập', c.income || DASH],
    ['Thường trú', c.residence || DASH],
    ['Nguồn khách', sourceLabel(c.source)],
  ];
  $('#detail-personal').innerHTML = personal
    .map(([k, v]) => `<span class="pi-item"><span class="pi-label">${k}:</span> ${escapeHtml(String(v))}</span>`)
    .join(' <span class="pi-sep">·</span> '); // có khoảng trắng để dòng tự ngắt khi hẹp

  renderCareHistory(c.care_stage_history, c.registered_at || c.created_at);

  // Nút "ghi thêm lần" chỉ hiện khi bậc hiện tại là bậc lặp được.
  const logAdd = $('#detail-log-add');
  if (logAdd) {
    logAdd.hidden = !isRepeatableStage(c.care_stage);
    $('#detail-log-add-btn').textContent = `＋ Ghi thêm lần "${c.care_stage}"`;
    $('#detail-log-add-btn').hidden = false;
    $('#detail-log-add-form').hidden = true;
    $('#detail-log-add-input').value = '';
  }

  // Tài liệu (online-only, CHỈ XEM) — nạp danh sách, mục thu gọn mặc định.
  loadDetailDocs(c.id);

  showDetailScreen();
  window.scrollTo(0, 0);
}

// Timeline lịch sử chăm sóc: mỗi mốc là 1 khối ô (tô màu theo bậc), giữa các
// mốc hiện khoảng thời gian; timestamp + note để mờ hơn. Cũ ở trên, mới ở dưới.
// LUÔN bắt đầu bằng mốc "Bắt đầu đăng ký" (kèm thời gian đăng ký). Note của mốc
// chăm sóc sửa được tại chỗ; riêng mốc "Bắt đầu đăng ký" không sửa note.
function renderCareHistory(history, registeredAt) {
  const section = $('#detail-history-section');
  const box = $('#detail-history');
  const list = [];
  if (registeredAt) list.push({ synthetic: true, stage: 'Bắt đầu đăng ký', at: registeredAt });
  if (Array.isArray(history)) list.push(...history);
  if (list.length === 0) { section.hidden = true; box.innerHTML = ''; return; }
  section.hidden = false;
  list.sort((a, b) => (a.at || '').localeCompare(b.at || '')); // theo thời gian tăng dần

  // Đánh số "lần N" khi HIỂN THỊ (không lưu xuống DB): bậc chỉ có 1 mốc → không
  // hiện số; từ 2 mốc trở lên → tự đánh lần 1, lần 2... theo thứ tự thời gian.
  // Tính lại mỗi lần render nên thêm/xoá mốc thì số luôn tự đúng.
  const stageCounts = {};
  list.forEach((e) => { if (!e.synthetic) stageCounts[e.stage] = (stageCounts[e.stage] || 0) + 1; });
  const stageSeen = {};

  let html = '';
  list.forEach((entry, i) => {
    if (i > 0) {
      const gap = new Date(entry.at) - new Date(list[i - 1].at);
      html += `<div class="cs-gap">${escapeHtml(formatDuration(gap))}</div>`;
    }
    const color = entry.synthetic ? '#1A2E29' : careColor(entry.stage);
    const at = escapeHtml(entry.at || '');
    const editing = !entry.synthetic && entry.at === editingHistoryAt;
    let noteHtml;
    if (entry.synthetic) {
      noteHtml = ''; // mốc đăng ký: không có note
    } else if (editing) {
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
    // Tên bậc + "lần N" (nếu bậc đó có từ 2 mốc trở lên).
    let stageInner = escapeHtml(entry.stage);
    if (!entry.synthetic) {
      stageSeen[entry.stage] = (stageSeen[entry.stage] || 0) + 1;
      if (stageCounts[entry.stage] > 1) {
        stageInner += ` <span class="cs-attempt">lần ${stageSeen[entry.stage]}</span>`;
      }
    }
    html += `
      <div class="cs-entry${entry.synthetic ? ' cs-start' : ''}" style="--ring:${color}">
        <span class="cs-stage">${stageInner}</span>
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
    const entry = list.find((e) => !e.synthetic && e.at === editingHistoryAt);
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
  renderCareHistory(c ? c.care_stage_history : [], c ? (c.registered_at || c.created_at) : null);
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

// ---- Ghi thêm 1 lần liên hệ cùng bậc (nút nhanh ở trang chi tiết) ----
function openLogAddForm() {
  $('#detail-log-add-form').hidden = false;
  $('#detail-log-add-btn').hidden = true;
  const inp = $('#detail-log-add-input');
  inp.value = '';
  inp.focus();
}
function closeLogAddForm() {
  $('#detail-log-add-form').hidden = true;
  $('#detail-log-add-btn').hidden = false;
}
async function saveNewCareLog(note) {
  if (!detailId) return;
  await CRM.addCareLog(detailId, note);
  await refreshList();     // cập nhật mốc "cập nhật cuối" trên card danh sách
  openDetail(detailId);    // vẽ lại chi tiết: timeline + đánh số "lần N"
}
$('#detail-log-add-btn')?.addEventListener('click', openLogAddForm);
$('#detail-log-add-cancel')?.addEventListener('click', closeLogAddForm);
$('#detail-log-add-save')?.addEventListener('click', () => {
  saveNewCareLog($('#detail-log-add-input').value.trim() || null);
});
$('#detail-log-add-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveNewCareLog(e.target.value.trim() || null); }
  else if (e.key === 'Escape') { e.preventDefault(); closeLogAddForm(); }
});

// ---- Ghi chú: note TỰ ĐỘNG (từ care stage) + note tự nhập (bullet, có ngày giờ) ----
function renderDetailNotes(c) {
  const box = $('#detail-notes');
  const autoNote = autoNoteFromHistory(c.care_stage_history);
  // Note tự nhập: sắp MỚI NHẤT LÊN TRÊN (tạo sau = cập nhật hơn), theo mốc 'at'.
  const manual = (Array.isArray(c.notes_manual) ? [...c.notes_manual] : [])
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  let html = '';
  // Note tự động lên đầu (mang tính cập nhật nhất), có nhãn "Tự động", không sửa được.
  if (autoNote) {
    html += `<div class="note-item note-auto">
        <span class="note-badge">Tự động</span>
        <span class="note-text">${escapeHtml(autoNote)}</span>
      </div>`;
  }
  // Note tự nhập xếp sau, mới nhất ở trên (db lưu unshift), có ngày giờ + sửa/xoá.
  for (const n of manual) {
    const at = escapeHtml(n.at || '');
    if (n.at === editingNoteAt) {
      html += `<div class="note-item note-editing">
          <input class="cs-note-input note-edit-input" type="text" placeholder="Nội dung ghi chú..." />
          <button class="btn-small" data-note-save="${at}">Lưu</button>
          <button class="btn-small" data-note-cancel="${at}">Huỷ</button>
        </div>`;
    } else {
      html += `<div class="note-item">
          <span class="note-bullet">•</span>
          <span class="note-text">${escapeHtml(n.text || '')}</span>
          <span class="note-meta">${escapeHtml(formatLogTime(n.at))}</span>
          <button class="note-act" data-note-edit="${at}" title="Sửa">✎</button>
          <button class="note-act" data-note-del="${at}" title="Xoá">✕</button>
        </div>`;
    }
  }
  box.classList.toggle('is-empty', !autoNote && manual.length === 0);
  box.innerHTML = (!autoNote && manual.length === 0) ? 'Chưa có ghi chú.' : html;

  // Đang sửa 1 ghi chú → nạp nội dung cũ vào input + focus.
  if (editingNoteAt) {
    const inp = box.querySelector('.note-edit-input');
    const entry = manual.find((n) => n.at === editingNoteAt);
    if (inp) { inp.value = entry ? (entry.text || '') : ''; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
}

// Vẽ lại card + phần ghi chú chi tiết sau mỗi thay đổi ghi chú.
async function afterNoteChange() {
  await refreshList(); // cập nhật allCustomers + card danh sách (note tự động/thủ công)
  const c = allCustomers.find((x) => x.id === detailId);
  if (c) renderDetailNotes(c);
}

function openNoteAddForm() {
  $('#detail-note-add-form').hidden = false;
  $('#detail-note-add-btn').hidden = true;
  const inp = $('#detail-note-add-input'); inp.value = ''; inp.focus();
}
function closeNoteAddForm() {
  $('#detail-note-add-form').hidden = true;
  $('#detail-note-add-btn').hidden = false;
}
async function saveNewNote(text) {
  const t = (text || '').trim();
  if (t && detailId) { await CRM.addNote(detailId, t); await afterNoteChange(); }
  closeNoteAddForm();
}
async function saveEditNote(at, text) {
  if (detailId) await CRM.updateNote(detailId, at, (text || '').trim() || null); // trống = xoá
  editingNoteAt = null;
  await afterNoteChange();
}
async function deleteNoteEntry(at) {
  if (!confirm('Xoá ghi chú này?')) return;
  if (detailId) { await CRM.deleteNote(detailId, at); await afterNoteChange(); }
}

$('#detail-note-add-btn')?.addEventListener('click', openNoteAddForm);
$('#detail-note-add-cancel')?.addEventListener('click', closeNoteAddForm);
$('#detail-note-add-save')?.addEventListener('click', () => saveNewNote($('#detail-note-add-input').value));
$('#detail-note-add-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveNewNote(e.target.value); }
  else if (e.key === 'Escape') { e.preventDefault(); closeNoteAddForm(); }
});

// Bấm trong danh sách ghi chú: ✎ sửa / ✕ xoá / Lưu / Huỷ.
$('#detail-notes')?.addEventListener('click', (e) => {
  const ed = e.target.closest('[data-note-edit]');
  if (ed) { editingNoteAt = ed.dataset.noteEdit; const c = allCustomers.find((x) => x.id === detailId); if (c) renderDetailNotes(c); return; }
  const sv = e.target.closest('[data-note-save]');
  if (sv) { const inp = $('#detail-notes .note-edit-input'); saveEditNote(sv.dataset.noteSave, inp ? inp.value : ''); return; }
  const cn = e.target.closest('[data-note-cancel]');
  if (cn) { editingNoteAt = null; const c = allCustomers.find((x) => x.id === detailId); if (c) renderDetailNotes(c); return; }
  const dl = e.target.closest('[data-note-del]');
  if (dl) { deleteNoteEntry(dl.dataset.noteDel); return; }
});
$('#detail-notes')?.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('note-edit-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveEditNote(editingNoteAt, e.target.value); }
  else if (e.key === 'Escape') { e.preventDefault(); editingNoteAt = null; const c = allCustomers.find((x) => x.id === detailId); if (c) renderDetailNotes(c); }
});

// ------------------------------------------------- TÀI LIỆU (ảnh/PDF) ------
// Online-only: nạp danh sách từ Supabase khi mở chi tiết; xem qua signed URL.
let detailDocs = []; // cache tài liệu của khách đang xem

async function loadDetailDocs(customerId) {
  const toggle = $('#detail-docs-toggle');
  $('#detail-docs-body').hidden = true;
  detailDocs = [];
  if (!CRM.isOnline()) { toggle.textContent = '📎 Tài liệu (cần mạng)'; toggle.disabled = true; return; }
  toggle.disabled = false;
  toggle.textContent = '📎 Đang tải tài liệu...';
  detailDocs = await CRM.listDocuments(customerId);
  toggle.textContent = `📎 Xem tài liệu (${detailDocs.length})`;
  renderDetailDocs();
}

// Trang chi tiết CHỈ XEM (thêm/sửa/xoá tài liệu chuyển sang trang Sửa khách).
function renderDetailDocs() {
  const box = $('#detail-docs');
  if (!detailDocs.length) { box.innerHTML = '<div class="docs-empty">Chưa có tài liệu.</div>'; return; }
  box.innerHTML = detailDocs.map((d) => docItemHtml(d, 'doc')).join('');
}

// HTML 1 dòng tài liệu. prefix='doc' (chi tiết, chỉ Xem) | 'fdoc' (form, Xem + Xoá).
function docItemHtml(d, prefix) {
  const isImg = (d.mime || '').startsWith('image/');
  const kindLabel = DOC_KIND_LABELS[d.kind] || d.kind;
  const sub = [d.label, formatLogTime(d.created_at)].filter(Boolean).join(' · ');
  const delBtn = prefix === 'fdoc' ? `<button type="button" class="doc-del" data-fdoc-del="${d.id}" title="Xoá">✕</button>` : '';
  return `<div class="doc-item">
      <span class="doc-icon">${isImg ? '🖼️' : '📄'}</span>
      <span class="doc-info"><span class="doc-kind">${escapeHtml(kindLabel)}</span>
        <span class="doc-meta">${escapeHtml(sub)}</span></span>
      <button type="button" class="btn-small" data-${prefix}-view="${d.id}">Xem</button>
      ${delBtn}
    </div>`;
}

// Mở 1 tài liệu: ẢNH/PDF → xem trong app (trình xem nhẹ); định dạng khác → mở tab.
async function openDocSigned(doc) {
  if (!doc) return;
  const mime = doc.mime || '';
  const isImg = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  if (isImg || isPdf) { openFileViewer(doc, isImg); return; }
  // Định dạng khác: mở tab trống trước (tránh chặn popup) rồi gán URL.
  const w = window.open('', '_blank');
  const url = await CRM.signedDocUrl(doc.storage_path, 300);
  if (url && w) w.location = url;
  else if (w) { w.close(); alert('Không lấy được link xem (cần mạng?).'); }
}

// Trình xem nhẹ trong app: <img> cho ảnh (kèm zoom tự làm), <iframe> cho PDF
// (trình duyệt tự render + tự có pinch/trackpad/thanh công cụ zoom của nó).
async function openFileViewer(doc, isImg) {
  const dlg = $('#file-viewer');
  const body = $('#file-viewer-body');
  $('#file-viewer-title').textContent = (DOC_KIND_LABELS[doc.kind] || doc.kind) + (doc.label ? ' · ' + doc.label : '');
  $('#file-viewer-open').onclick = null;
  fvImg = null; fvResetZoom();
  $('#fv-zoom').hidden = !isImg;                    // nút +/− chỉ cho ảnh
  body.classList.toggle('fv-zoomable', isImg);      // ảnh: app tự bắt cử chỉ; PDF: để native
  body.innerHTML = '<div class="fv-loading">Đang tải...</div>';
  if (!dlg.open) dlg.showModal();
  const url = await CRM.signedDocUrl(doc.storage_path, 300);
  if (!url) { body.innerHTML = '<div class="fv-loading">Không tải được (cần mạng?).</div>'; return; }
  body.innerHTML = '';
  const el = document.createElement(isImg ? 'img' : 'iframe');
  el.className = isImg ? 'fv-img' : 'fv-pdf';
  el.src = url; // gán qua thuộc tính, không nhúng vào HTML → an toàn
  body.appendChild(el);
  if (isImg) { fvImg = el; fvResetZoom(); }
  $('#file-viewer-open').onclick = () => window.open(url, '_blank');
}

// ---- Zoom cho ảnh trong trình xem ----
const FV_MIN = 1, FV_MAX = 6;
let fvImg = null, fvZoom = 1, fvTx = 0, fvTy = 0;
let fvPinchDist = 0, fvPinchZoom = 1, fvLastMid = null, fvDrag = null;

const fvClamp = (z) => Math.max(FV_MIN, Math.min(FV_MAX, z));
function fvApply() {
  if (fvImg) fvImg.style.transform = `translate(${fvTx}px, ${fvTy}px) scale(${fvZoom})`;
  $('#fv-zoom-pct').textContent = Math.round(fvZoom * 100) + '%';
  $('#file-viewer-body').classList.toggle('fv-pannable', fvZoom > 1);
}
function fvResetZoom() { fvZoom = 1; fvTx = 0; fvTy = 0; fvApply(); }
function fvSetZoom(z) { fvZoom = fvClamp(z); if (fvZoom === FV_MIN) { fvTx = 0; fvTy = 0; } fvApply(); }
function fvDist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
function fvMid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

$('#file-viewer-close')?.addEventListener('click', () => $('#file-viewer').close());
// Bấm nền tối (ngoài nội dung) → đóng
$('#file-viewer')?.addEventListener('click', (e) => { if (e.target.id === 'file-viewer') $('#file-viewer').close(); });
// Đóng → xoá nội dung + reset zoom (dừng tải, nhẹ bộ nhớ)
$('#file-viewer')?.addEventListener('close', () => { fvImg = null; $('#file-viewer-body').innerHTML = ''; });

$('#fv-zoom-in')?.addEventListener('click', () => fvSetZoom(fvZoom + 0.5));
$('#fv-zoom-out')?.addEventListener('click', () => fvSetZoom(fvZoom - 0.5));

const fvBody = $('#file-viewer-body');
// Bấm đúp (chuột) → phóng to nhanh / trả về 100%
fvBody?.addEventListener('dblclick', () => { if (fvImg) fvSetZoom(fvZoom > 1 ? 1 : 2.5); });
// Trackpad Mac/Windows: pinch = wheel + ctrlKey → zoom; cuộn 2 ngón khi đã zoom → di chuyển
fvBody?.addEventListener('wheel', (e) => {
  if (!fvImg) return; // PDF: để native lo
  if (e.ctrlKey) { e.preventDefault(); fvSetZoom(fvZoom * Math.exp(-e.deltaY * 0.01)); }
  else if (fvZoom > 1) { e.preventDefault(); fvTx -= e.deltaX; fvTy -= e.deltaY; fvApply(); }
}, { passive: false });
// Cảm ứng Android: 2 ngón tách/chụm = zoom; 1 ngón kéo (khi đã zoom) = di chuyển
fvBody?.addEventListener('touchstart', (e) => {
  if (!fvImg) return;
  if (e.touches.length === 2) { fvPinchDist = fvDist(e.touches); fvPinchZoom = fvZoom; fvLastMid = fvMid(e.touches); e.preventDefault(); }
  else if (e.touches.length === 1 && fvZoom > 1) { fvDrag = { x: e.touches[0].clientX - fvTx, y: e.touches[0].clientY - fvTy }; }
}, { passive: false });
fvBody?.addEventListener('touchmove', (e) => {
  if (!fvImg) return;
  if (e.touches.length === 2) {
    e.preventDefault();
    fvZoom = fvClamp(fvPinchZoom * (fvDist(e.touches) / (fvPinchDist || 1)));
    const m = fvMid(e.touches);
    if (fvLastMid) { fvTx += m.x - fvLastMid.x; fvTy += m.y - fvLastMid.y; }
    fvLastMid = m;
    if (fvZoom === FV_MIN) { fvTx = 0; fvTy = 0; }
    fvApply();
  } else if (e.touches.length === 1 && fvDrag) {
    e.preventDefault();
    fvTx = e.touches[0].clientX - fvDrag.x; fvTy = e.touches[0].clientY - fvDrag.y; fvApply();
  }
}, { passive: false });
fvBody?.addEventListener('touchend', (e) => { if (e.touches.length === 0) { fvDrag = null; fvLastMid = null; } });
// Chuột kéo (desktop) khi đã zoom = di chuyển (biến riêng, không đụng kéo cảm ứng)
let fvMouseDrag = null;
fvBody?.addEventListener('mousedown', (e) => { if (fvImg && fvZoom > 1) { fvMouseDrag = { x: e.clientX - fvTx, y: e.clientY - fvTy }; e.preventDefault(); } });
window.addEventListener('mousemove', (e) => { if (fvMouseDrag) { fvTx = e.clientX - fvMouseDrag.x; fvTy = e.clientY - fvMouseDrag.y; fvApply(); } });
window.addEventListener('mouseup', () => { fvMouseDrag = null; });

$('#detail-docs-toggle')?.addEventListener('click', () => {
  const body = $('#detail-docs-body');
  body.hidden = !body.hidden;
});
$('#detail-docs')?.addEventListener('click', (e) => {
  const v = e.target.closest('[data-doc-view]');
  if (v) openDocSigned(detailDocs.find((d) => d.id === v.dataset.docView));
});

// ---- Tài liệu trong trang SỬA khách: xem + thêm + xoá ----
let formDocs = [];

async function loadFormDocs(customerId) {
  formDocs = [];
  const box = $('#form-docs');
  if (!CRM.isOnline()) { box.innerHTML = '<div class="docs-empty">Cần mạng để xem/sửa tài liệu.</div>'; return; }
  box.innerHTML = '<div class="docs-empty">Đang tải...</div>';
  formDocs = await CRM.listDocuments(customerId);
  renderFormDocs();
}
function renderFormDocs() {
  const box = $('#form-docs');
  box.innerHTML = formDocs.length
    ? formDocs.map((d) => docItemHtml(d, 'fdoc')).join('')
    : '<div class="docs-empty">Chưa có tài liệu.</div>';
}
async function deleteFormDoc(id) {
  const doc = formDocs.find((d) => d.id === id);
  if (!doc) return;
  if (!confirm(`Xoá tài liệu "${DOC_KIND_LABELS[doc.kind] || doc.kind}"? Không thể hoàn tác.`)) return;
  try { await CRM.deleteDocument(doc); await loadFormDocs(editingId); }
  catch (e) { alert('Xoá tài liệu lỗi: ' + (e.message || e)); }
}
async function handleFormDocUpload(file) {
  if (!file || !editingId) return;
  const status = $('#form-doc-status');
  status.textContent = '⏳ Đang tải lên...';
  try {
    let toUpload = file; // ảnh nén trước cho nhẹ; PDF giữ nguyên
    if ((file.type || '').startsWith('image/')) toUpload = (await fileToScaled(file)).blob;
    await CRM.uploadDocument(editingId, toUpload, 'khac', file.name || null);
    status.textContent = '';
    await loadFormDocs(editingId);
  } catch (e) {
    status.textContent = '⚠️ Tải lên lỗi: ' + (e.message || e);
  } finally {
    $('#form-doc-file').value = '';
  }
}
$('#form-doc-add-btn')?.addEventListener('click', () => $('#form-doc-file').click());
$('#form-doc-file')?.addEventListener('change', (e) => handleFormDocUpload(e.target.files && e.target.files[0]));
$('#form-docs')?.addEventListener('click', (e) => {
  const v = e.target.closest('[data-fdoc-view]');
  if (v) { openDocSigned(formDocs.find((d) => d.id === v.dataset.fdocView)); return; }
  const d = e.target.closest('[data-fdoc-del]');
  if (d) { deleteFormDoc(d.dataset.fdocDel); return; }
});

// ------------------------------------------------- LỊCH GỌI / NHẮC GỌI ----

// Khung giờ preset: [giờ bắt đầu, phút, giờ kết thúc, phút]
const CALL_SLOTS = { '9-10h': [9, 0, 10, 0], '14-15h': [14, 0, 15, 0], '20-21h': [20, 0, 21, 0] };

function isoDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Date → "YYYY-MM-DDTHH:mm" (giờ địa phương) cho input datetime-local.
function toLocalDatetimeInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtClock(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// Thời lượng còn lại: "30p" (<1h) hoặc "2:00" (>=1h)
function fmtRemainMs(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return min + 'p';
  return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
}
function relDayLabel(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd - t) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  return `${dd.getDate()}/${dd.getMonth() + 1}`;
}
function callScheduleLabel(c) {
  if (!c.next_call_at) return '';
  const s = new Date(c.next_call_at);
  const e = c.next_call_end ? new Date(c.next_call_end) : s;
  const tt = fmtClock(s.getTime()) + (e.getTime() !== s.getTime() ? '–' + fmtClock(e.getTime()) : '');
  return relDayLabel(s) + ' ' + tt;
}

// Trạng thái tag nhắc gọi cho 1 khách. null = không hiện tag.
// Giờ gọi là 1 khung (duration): 'due' kéo dài suốt khung + 30 phút sau khi hết.
function callReminder(c) {
  if (!c.next_call_at) return null;
  const start = new Date(c.next_call_at).getTime();
  const end = c.next_call_end ? new Date(c.next_call_end).getTime() : start;
  const now = Date.now();
  const graceEnd = end + 30 * 60000;
  if (now < start) {
    const remain = start - now;
    if (remain > 24 * 3600 * 1000) return null; // >24h: chưa hiện tag
    return { state: 'soon', text: fmtRemainMs(remain) + ' nữa gọi', sort: start };
  }
  if (now <= graceEnd) return { state: 'due', text: 'đến giờ gọi', sort: start };
  return { state: 'missed', text: 'quên gọi ' + fmtClock(start), sort: start };
}

// Vẽ khu "lịch gọi" ở trang chi tiết: nhãn hẹn + nút đặt/đổi/xoá lịch + BADGE đếm
// ngược (giống card). Badge chỉ hiện khi có lịch trong tầm nhắc; bấm → mở hộp
// thoại "đã gọi / hẹn lại". Gọi lại định kỳ để đếm ngược tự cập nhật.
function renderDetailCall(c) {
  const callLabel = $('#detail-call-label');
  if (c.next_call_at) {
    callLabel.textContent = '🔔 Hẹn gọi: ' + callScheduleLabel(c);
    $('#detail-schedule-btn').textContent = 'Đổi lịch';
    $('#detail-callclear-btn').hidden = false;
  } else {
    callLabel.textContent = '';
    $('#detail-schedule-btn').textContent = '＋ Đặt lịch gọi';
    $('#detail-callclear-btn').hidden = true;
  }
  const badge = $('#detail-call-badge');
  const rem = callReminder(c);
  if (rem) { badge.hidden = false; badge.className = 'call-tag call-' + rem.state; badge.textContent = rem.text; }
  else { badge.hidden = true; }
}

// ---- Dialog đặt lịch gọi (dùng chung) ----
let schedulingId = null, schedTime = null, schedDate = null;
function openScheduler(id) {
  schedulingId = id; schedTime = null; schedDate = null;
  $$('#sched-time .sched-opt').forEach((b) => b.classList.remove('is-sel'));
  $$('#sched-date .sched-opt').forEach((b) => b.classList.remove('is-sel'));
  const tc = $('#sched-time-custom'), dc = $('#sched-date-custom');
  tc.hidden = true; tc.value = ''; dc.hidden = true; dc.value = '';
  const tm = new Date(); tm.setDate(tm.getDate() + 1); dc.min = isoDateLocal(tm); // custom phải sau hôm nay
  $('#sched-error').textContent = '';
  $('#schedule-modal').showModal();
}
async function saveSchedule() {
  const err = $('#sched-error'); err.textContent = '';
  if (!schedTime) { err.textContent = 'Chọn giờ gọi.'; return; }
  if (!schedDate) { err.textContent = 'Chọn ngày gọi.'; return; }
  let base = new Date(); base.setHours(0, 0, 0, 0);
  if (schedDate === 'tomorrow') base.setDate(base.getDate() + 1);
  else if (schedDate === 'custom') {
    const v = $('#sched-date-custom').value;
    if (!v) { err.textContent = 'Chọn ngày cụ thể.'; return; }
    const d = new Date(v + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d <= today) { err.textContent = 'Ngày phải sau hôm nay.'; return; }
    base = d;
  }
  let sh, sm, eh, em;
  if (schedTime === 'custom') {
    const v = $('#sched-time-custom').value;
    if (!v) { err.textContent = 'Nhập giờ cụ thể.'; return; }
    [sh, sm] = v.split(':').map(Number); eh = sh; em = sm; // 1 mốc
  } else { [sh, sm, eh, em] = CALL_SLOTS[schedTime]; }
  const start = new Date(base); start.setHours(sh, sm, 0, 0);
  const end = new Date(base); end.setHours(eh, em, 0, 0);
  await CRM.update(schedulingId, { next_call_at: start.toISOString(), next_call_end: end.toISOString() });
  await refreshList();
  $('#schedule-modal').close();
  if (detailId && !$('#detail-screen').hidden) openDetail(detailId);
}
$('#sched-time')?.addEventListener('click', (e) => {
  const b = e.target.closest('.sched-opt'); if (!b) return;
  schedTime = b.dataset.time;
  $$('#sched-time .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
  $('#sched-time-custom').hidden = schedTime !== 'custom';
  if (schedTime === 'custom') $('#sched-time-custom').focus();
});
$('#sched-date')?.addEventListener('click', (e) => {
  const b = e.target.closest('.sched-opt'); if (!b) return;
  schedDate = b.dataset.date;
  $$('#sched-date .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
  $('#sched-date-custom').hidden = schedDate !== 'custom';
  if (schedDate === 'custom') $('#sched-date-custom').focus();
});
$('#sched-save')?.addEventListener('click', saveSchedule);
$('#sched-cancel')?.addEventListener('click', () => $('#schedule-modal').close());

// ---- Dialog xác nhận gọi (bấm vào tag nhắc gọi) ----
let callActionId = null;
function openCallAction(id) {
  const c = allCustomers.find((x) => x.id === id); if (!c) return;
  callActionId = id;
  $('#callact-title').textContent = 'Gọi: ' + (c.full_name || '(chưa tên)');
  $('#callact-sub').textContent = c.next_call_at ? ('Lịch hẹn: ' + callScheduleLabel(c)) : '';
  $('#call-action-modal').showModal();
}
async function confirmCalled() {
  await CRM.update(callActionId, { next_call_at: null, next_call_end: null });
  await refreshList();
  $('#call-action-modal').close();
  if (detailId && !$('#detail-screen').hidden) openDetail(detailId);
}
$('#callact-done')?.addEventListener('click', confirmCalled);
$('#callact-resched')?.addEventListener('click', () => { $('#call-action-modal').close(); openScheduler(callActionId); });
$('#callact-close')?.addEventListener('click', () => $('#call-action-modal').close());
// Badge đếm ngược ở trang chi tiết → mở hộp thoại "đã gọi / hẹn lại".
$('#detail-call-badge')?.addEventListener('click', () => { if (detailId) openCallAction(detailId); });

// Cập nhật đếm ngược định kỳ: danh sách (card) + badge trang chi tiết.
setInterval(() => {
  if (!currentUser) return;
  if (!$('#app-screen').hidden && !$('#list-view').hidden) renderList();
  if (!$('#detail-screen').hidden && detailId) {
    const c = allCustomers.find((x) => x.id === detailId);
    if (c) renderDetailCall(c);
  }
}, 30000);

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
// hiện tại. Bậc trống coi như 0 (Chưa gọi được); 'Không chốt-kết thúc' dựa
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
  $('#detail-schedule-btn').addEventListener('click', () => { if (detailId) openScheduler(detailId); });
  $('#detail-callclear-btn').addEventListener('click', async () => {
    if (!detailId) return;
    await CRM.update(detailId, { next_call_at: null, next_call_end: null });
    await refreshList();
    openDetail(detailId);
  });
  $('#customer-form').addEventListener('submit', handleFormSubmit);
  $('#cancel-form-btn').addEventListener('click', closeForm);
  $('#delete-customer-btn').addEventListener('click', () => { if (editingId) confirmDelete(editingId); });
  $('#customer-form').dob.addEventListener('input', updateMenhPreview);
  $('#customer-form').evaluation.addEventListener('change', toggleEvalReason);
  $('#customer-form').care_stage.addEventListener('change', onCareStageChange);
  $('#customer-form').apt_type_select.addEventListener('change', toggleAptOther);

  // --- OCR: nhập từ ảnh (chỉ hiện nút nếu đã cấu hình WORKER_URL) ---
  if ((window.APP_CONFIG.WORKER_URL || '').trim()) $('#ocr-row').hidden = false;
  $('#ocr-btn').addEventListener('click', () => $('#ocr-file').click());
  $('#ocr-file').addEventListener('change', (e) => handleOcrImage(e.target.files && e.target.files[0]));

  // --- Dropdown dự án (chọn nhiều / thêm / xoá) ---
  $('#proj-dropdown-btn').addEventListener('click', () => {
    const p = $('#proj-dropdown-panel'); p.hidden = !p.hidden;
  });
  // Tích/bỏ tích 1 dự án (checkbox)
  $('#proj-options').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-projtoggle]');
    if (!cb) return;
    const name = cb.dataset.projtoggle;
    const i = selectedProjects.indexOf(name);
    if (cb.checked && i === -1) selectedProjects.push(name);
    else if (!cb.checked && i !== -1) selectedProjects.splice(i, 1);
    renderProjSelect();
  });
  // Xoá 1 dự án khỏi danh sách (chế độ Quản lý)
  $('#proj-options').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-projdel]');
    if (!del) return;
    const opt = projectOptions.find((o) => o.id === del.dataset.projdel);
    if (opt && confirm(`Xoá dự án "${opt.name}" khỏi danh sách? (không ảnh hưởng khách đã lưu)`)) {
      await removeProjectOption(opt.id);
      selectedProjects = selectedProjects.filter((n) => n !== opt.name);
      renderProjSelect();
    }
  });
  $('#proj-add-btn').addEventListener('click', () => {
    $('#proj-add-row').hidden = false;
    $('#proj-add-btn').hidden = true;
    $('#proj-add-input').value = '';
    $('#proj-add-input').focus();
  });
  // Đóng dropdown khi bấm ra ngoài
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.proj-dropdown')) $('#proj-dropdown-panel').hidden = true;
  });
  $('#proj-manage-btn').addEventListener('click', () => {
    projManageMode = !projManageMode;
    $('#proj-dropdown-panel').hidden = false; // mở panel để thấy nút xoá
    renderProjSelect();
  });
  $('#proj-add-ok').addEventListener('click', async () => {
    const name = $('#proj-add-input').value.trim();
    if (!name) return;
    if (await addProjectOption(name)) {
      if (!selectedProjects.includes(name)) selectedProjects.push(name);
      $('#proj-add-row').hidden = true;
      $('#proj-add-btn').hidden = false;
      renderProjSelect();
    }
  });
  $('#proj-add-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#proj-add-ok').click(); } });
  $('#proj-add-cancel').addEventListener('click', () => { $('#proj-add-row').hidden = true; $('#proj-add-btn').hidden = false; });
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

// ------------------------------------------------- KÉO ĐỂ TẢI LẠI ----------
// Ở ĐẦU trang (scrollY<=0), kéo XUỐNG quá ngưỡng → reload TOÀN BỘ trang.
// location.reload() + sw.js network-first ⇒ lấy HTML/JS/CSS mới nhất từ Cloudflare.
// Hỗ trợ 2 kiểu nhập:
//  - Cảm ứng (điện thoại/tablet): touchstart/move/end.
//  - Trackpad/chuột (Mac/Windows): wheel — overscroll LÊN khi đã ở đỉnh trang.
(function setupPullToRefresh() {
  const ind = document.getElementById('ptr-indicator');
  if (!ind) return;
  const txt = ind.querySelector('.ptr-text');
  const HIDDEN = -48;      // vị trí ẩn (khớp translateY(-48px) trong CSS)
  const THRESHOLD = 64;    // "độ kéo" (đã giảm tốc) tối thiểu để kích hoạt
  const MAX_VISIBLE = 72;  // px tối đa thanh trượt xuống (cảm giác căng)
  let pulling = false, startY = 0, dist = 0, triggered = false;

  const anyDialogOpen = () => !!document.querySelector('dialog[open]');

  function reset() {
    ind.classList.remove('ready', 'loading');
    ind.style.transition = '';
    ind.style.transform = '';
    txt.textContent = 'Kéo để tải lại';
    dist = 0;
  }
  // Vẽ thanh theo độ kéo d (đã giảm tốc); trả về true nếu đủ ngưỡng.
  function showProgress(d) {
    ind.style.transition = 'none';
    ind.style.transform = `translateY(${Math.min(MAX_VISIBLE, d) + HIDDEN}px)`;
    const ready = d >= THRESHOLD;
    ind.classList.toggle('ready', ready);
    txt.textContent = ready ? 'Thả để tải lại' : 'Kéo để tải lại';
    return ready;
  }
  function triggerReload() {
    if (triggered) return;
    triggered = true;
    ind.classList.remove('ready');
    ind.classList.add('loading');
    ind.style.transition = '';
    txt.textContent = 'Đang tải lại...';
    ind.style.transform = 'translateY(0)';
    setTimeout(() => location.reload(), 300);
  }

  // --- Cảm ứng (điện thoại/tablet) ---
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || e.touches.length !== 1 || anyDialogOpen()) { pulling = false; return; }
    startY = e.touches[0].clientY; pulling = true; dist = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    if (window.scrollY > 0) { reset(); pulling = false; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { reset(); pulling = false; return; }
    dist = Math.min(MAX_VISIBLE, dy * 0.5);
    e.preventDefault(); // chặn nảy mặc định để thanh bám theo ngón tay
    showProgress(dist);
  }, { passive: false });
  window.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    ind.style.transition = '';
    if (dist >= THRESHOLD) triggerReload(); else reset();
  });

  // --- Trackpad/chuột (Mac/Windows): overscroll LÊN ở đỉnh trang ---
  // Kéo 2 ngón xuống (natural scroll) khi đã ở đỉnh → deltaY < 0 → tích luỹ.
  // Bỏ QUÁN TÍNH (momentum/trớn của trackpad-chuột), chỉ tính đoạn kéo CHỦ ĐỘNG:
  //  - START_FLOOR: 1 lần kéo hợp lệ phải BẮT ĐẦU chậm (event đầu < ngưỡng này). Flick
  //    cuộn lên rồi trớn qua đỉnh → khi chạm đỉnh vận tốc đã lớn → event đầu > ngưỡng
  //    → coi là trớn, BỎ QUA cả phiên. (Cũng giống cảm ứng: phải bắt đầu ngay tại đỉnh.)
  //  - Sau khi qua đỉnh của lần kéo, nếu delta tụt < 40% đỉnh → phần còn lại là trớn, ngừng cộng.
  //  - WHEEL_K: quy đổi độ kéo chủ động → tương đương cảm ứng (~128px mới đủ ngưỡng).
  const WHEEL_K = 0.29, START_FLOOR = 24;
  let wheelAccum = 0, wheelPeak = 0, wheelMomentum = false, wheelValid = false, wheelLastT = 0, wheelTimer = null;

  function wheelResetSession() { wheelAccum = 0; wheelPeak = 0; wheelMomentum = false; wheelValid = false; }
  function wheelRetractSoon() {
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelResetSession(); ind.style.transition = ''; reset(); }, 200);
  }

  window.addEventListener('wheel', (e) => {
    if (triggered || anyDialogOpen()) return;
    const now = performance.now();
    const isNew = now - wheelLastT > 120; // ngắt quãng >120ms → lần kéo MỚI
    wheelLastT = now;

    // Rời đỉnh hoặc đang cuộn xuống → huỷ phiên (nên nếu sau đó chạm đỉnh vẫn cùng
    // dòng event thì bị coi là không hợp lệ = trớn của flick).
    if (window.scrollY > 0 || e.deltaY >= 0) { wheelResetSession(); reset(); return; }

    const abs = -e.deltaY;
    if (isNew) { wheelResetSession(); wheelValid = abs < START_FLOOR; } // chốt hợp lệ ngay từ event đầu
    if (!wheelValid) { wheelRetractSoon(); return; }                    // phiên bắt đầu nhanh = trớn → bỏ

    wheelPeak = Math.max(wheelPeak, abs);
    if (!wheelMomentum && abs < wheelPeak * 0.4) wheelMomentum = true;  // đã qua đỉnh, đang decay = trớn

    if (!wheelMomentum) {
      wheelAccum += abs;
      if (showProgress(wheelAccum * WHEEL_K)) { ind.style.transition = ''; triggerReload(); return; }
    }
    wheelRetractSoon();
  }, { passive: true });
})();
