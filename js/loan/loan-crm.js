/*!
 * loan-crm.js — "Keo dán" module Tính khoản vay (js/loan/*) vào CRM.
 * Tải SAU app.js: dùng lại các biến/hàm toàn cục của app.js (sb, allCustomers,
 * escapeHtml, showToast). KHÔNG đặt tên biến `supabase` (xem CLAUDE.md mục 5.1).
 *
 * 2 điểm gắn:
 *   A. Màn "Tính vay" (#loan-view, mở từ bảng Tiện ích) — bảng tính độc lập, hoặc chọn khách ở ô "Khách hàng"
 *      để điền sẵn số liệu của khách và lưu phương án vào hồ sơ khách đó.
 *   B. Trang chi tiết khách (#detail-loan-section) — điền sẵn mã căn / diện tích,
 *      lưu phương án gắn với khách, liệt kê + mở lại phương án đã lưu.
 *
 * Lưu ý: phương án vay lưu thẳng lên Supabase (bảng loan_quotes), KHÔNG qua hàng
 * đợi offline của db.js → mất mạng thì phần tính + xuất PDF vẫn chạy, chỉ nút
 * "Lưu phương án" báo lỗi.
 */
(function () {
  'use strict';
  if (!window.LoanModule) { console.error('[loan] Chưa tải loan-ui.js'); return; }
  var fmt = LoanModule.format;
  var LS_CONSULTANT = 'crm_loan_consultant';

  // ---------- Tư vấn viên in trên PDF (lưu theo từng máy) ----------
  // Dùng chung 1 object cho mọi bảng tính → sửa tên là PDF sau đó dùng tên mới ngay.
  var CONSULTANT_DEFAULT = { name: 'Duy', phone: '0389783840' }; // mặc định khi máy chưa nhập
  var consultant = Object.assign({}, CONSULTANT_DEFAULT);
  try {
    var savedC = JSON.parse(localStorage.getItem(LS_CONSULTANT)) || {};
    if (savedC.name) consultant.name = savedC.name;   // ô để trống → giữ mặc định
    if (savedC.phone) consultant.phone = savedC.phone;
  } catch (e) { /* bỏ qua */ }
  function saveConsultant() {
    try { localStorage.setItem(LS_CONSULTANT, JSON.stringify(consultant)); } catch (e) { /* bỏ qua */ }
  }
  var nameInp = document.getElementById('loan-consultant-name');
  var phoneInp = document.getElementById('loan-consultant-phone');
  if (nameInp && phoneInp) {
    nameInp.value = consultant.name || '';
    phoneInp.value = consultant.phone || '';
    nameInp.addEventListener('input', function () { consultant.name = nameInp.value.trim() || CONSULTANT_DEFAULT.name; saveConsultant(); });
    phoneInp.addEventListener('input', function () { consultant.phone = phoneInp.value.trim() || CONSULTANT_DEFAULT.phone; saveConsultant(); });
  }

  // ---------- Dữ liệu dùng chung từ CRM ----------
  // Dự án → Toà → Căn = GIỎ HÀNG (js/catalog.js); loại căn = APT_TYPES của app.js.
  function crmOptions() {
    return { supabase: sb, consultant: consultant, theme: 'light', catalog: Catalog, aptTypes: APT_TYPES.slice() };
  }
  // Giỏ hàng đổi (sửa ở màn Giỏ hàng / nhập Excel) → bảng tính đang mở cập nhật danh sách chọn
  Catalog.onChange(function () {
    if (tabUI) tabUI.refresh();
    if (detailUI) detailUI.refresh();
  });

  // Khách → giá trị điền sẵn cho bảng tính (dự án / toà / mã căn / loại căn / diện tích). Chỉ field có giá trị —
  // truyền undefined sẽ đè mất mặc định của module. Chính sách trả (VAT, KPBT, tiến độ CĐT, bàn giao…) module
  // tự lấy theo dự án trong giỏ hàng.
  function unitOf(c) {
    var unit = {};
    if (Array.isArray(c.projects) && c.projects[0]) unit.projectName = c.projects[0];
    if (c.apt_type) unit.aptType = canonicalAptType(c.apt_type);
    if (c.apt_code) unit.code = String(c.apt_code).trim();
    if (c.building_code) unit.building = String(c.building_code).trim();
    if (Number(c.apt_area) > 0) unit.area = Number(c.apt_area);
    return unit;
  }

  // ---------- A. Tab "Tính vay" ----------
  // Có ô "Khách hàng": chọn khách → dựng lại bảng tính với số liệu của khách, "Lưu phương án" gắn vào khách đó.
  var tabUI = null;
  var tabCid = null; // khách đang gắn ở màn Tính vay (null = bảng tính độc lập)
  function mountTab(force) {
    if (tabUI && !force) return; // đã mount → giữ nguyên số đang nhập khi qua lại giữa các tab
    if (tabUI) { tabUI.destroy(); tabUI = null; }
    var c = tabCid ? customerOf(tabCid) : null;
    tabUI = LoanModule.mount(document.getElementById('loan-app'), c
      ? Object.assign(crmOptions(), {
          customer: { id: c.id, name: c.full_name, phone: c.phone }, unit: unitOf(c),
          onSaved: function () { if (currentCid === c.id) loadQuotes(c.id); showToast('Đã lưu phương án vào hồ sơ ' + (c.full_name || 'khách')); }
        })
      : crmOptions());
    renderPickerLabel();
  }

  // ---- Ô chọn khách (màn Tính vay): khách đang active = Tiềm năng mình phụ trách, chưa Đã mua / Loại.
  // Tìm dùng chung bộ tìm của ô tìm tổng (CRMSearch + matchesSearch: tên, SĐT, bỏ dấu…).
  var pickBtn = document.getElementById('loan-cust-btn');
  var pickClear = document.getElementById('loan-cust-clear');
  var pickPop = document.getElementById('loan-cust-pop');
  var pickSearch = document.getElementById('loan-cust-search');
  var pickList = document.getElementById('loan-cust-list');
  var PICK_LIMIT = 30;
  function activeCustomers() {
    return allCustomers.filter(function (c) { return isQualified(c) && isMine(c) && !isCareDone(c.care_stage); });
  }
  function renderPickerLabel() {
    if (!pickBtn) return;
    var c = tabCid ? customerOf(tabCid) : null;
    document.getElementById('loan-cust-text').textContent = c ? (c.full_name || '(chưa tên)') + (c.phone ? ' · ' + c.phone : '') : 'Chọn khách (không bắt buộc)';
    pickBtn.classList.toggle('is-set', !!c);
    pickClear.hidden = !c;
  }
  function renderPickList() {
    var q = pickSearch.value.trim();
    var ctx = q ? window.CRMSearch.compile(q, 'all') : null;
    if (ctx && !ctx.active) ctx = null;
    if (ctx) Object.assign(ctx, { qNorm: ctx.text, isPhone: ctx.phoneOnly, qPhone: ctx.digits, results: new WeakMap() });
    var list = activeCustomers().filter(function (c) { return !ctx || matchesSearch(c, ctx); })
      .sort(function (a, b) { return (a.full_name || '').localeCompare(b.full_name || '', 'vi'); });
    var shown = list.slice(0, PICK_LIMIT);
    pickList.innerHTML = shown.length ? shown.map(function (c) {
      var meta = [c.phone, Array.isArray(c.projects) && c.projects[0], c.apt_type && canonicalAptType(c.apt_type)].filter(Boolean).join(' · ');
      return '<button type="button" class="loan-cust-row' + (c.id === tabCid ? ' is-sel' : '') + '" role="option" data-cid="' + c.id + '">' +
        '<span class="loan-cust-name">' + escapeHtml(c.full_name || '(chưa tên)') + '</span>' +
        '<span class="loan-cust-meta">' + escapeHtml(meta) + '</span></button>';
    }).join('') + (list.length > PICK_LIMIT ? '<div class="loan-cust-more">+' + (list.length - PICK_LIMIT) + ' khách — gõ để tìm</div>' : '')
      : '<div class="loan-cust-empty">' + (q ? 'Không có khách khớp' : 'Chưa có khách Tiềm năng đang chăm sóc') + '</div>';
  }
  function openPicker(open) {
    pickPop.hidden = !open;
    pickBtn.setAttribute('aria-expanded', String(open));
    if (open) { pickSearch.value = ''; renderPickList(); setTimeout(function () { pickSearch.focus(); }, 0); }
  }
  if (pickBtn) {
    pickBtn.addEventListener('click', function (e) { e.stopPropagation(); openPicker(pickPop.hidden); });
    pickSearch.addEventListener('input', renderPickList);
    pickSearch.addEventListener('keydown', function (e) { if (e.key === 'Escape') openPicker(false); });
    pickList.addEventListener('click', function (e) {
      var r = e.target.closest('[data-cid]'); if (!r) return;
      tabCid = r.getAttribute('data-cid');
      openPicker(false);
      mountTab(true);
    });
    pickClear.addEventListener('click', function () { tabCid = null; mountTab(true); });
    document.addEventListener('click', function (e) { if (!pickPop.hidden && !e.target.closest('.loan-cust-wrap')) openPicker(false); });
  }

  // ---------- B. Trang chi tiết khách ----------
  var section = document.getElementById('detail-loan-section');
  var btn = document.getElementById('detail-loan-btn');
  var panel = document.getElementById('detail-loan-panel');
  var quotesEl = document.getElementById('detail-loan-quotes');
  var closeBtn = document.getElementById('detail-loan-close');
  var detailUI = null;
  var currentCid = null;
  var quotes = [];

  function customerOf(cid) { return allCustomers.find(function (x) { return x.id === cid; }); }

  function closePanel() {
    if (detailUI) { detailUI.destroy(); detailUI = null; }
    panel.hidden = true;
    btn.hidden = false;
    if (closeBtn) closeBtn.hidden = true;
    if (section) section.classList.remove('is-loan-open');
  }

  // Tiêu đề thẻ dính ngay DƯỚI thanh mini (#detail-stickybar, fixed) → đo chiều cao thật của thanh
  // (gồm vùng thanh trạng thái --sat) gán vào biến CSS, tránh đoán số cứng.
  function syncStickyTop() {
    var bar = document.getElementById('detail-stickybar');
    var screen = document.getElementById('detail-screen');
    if (bar && screen && bar.offsetHeight) screen.style.setProperty('--detail-bar-h', bar.offsetHeight + 'px');
  }
  window.addEventListener('resize', function () { if (detailUI) syncStickyTop(); });

  function openPanel(initialState) {
    var c = customerOf(currentCid);
    if (!c) return;
    if (detailUI) detailUI.destroy();
    var unit = unitOf(c);
    panel.hidden = false;
    detailUI = LoanModule.mount(panel, Object.assign(crmOptions(), {
      customer: { id: c.id, name: c.full_name, phone: c.phone },
      unit: unit,
      initialState: initialState || null,
      onSaved: function () { loadQuotes(c.id); }
    }));
    panel.classList.add('lm-embedded');
    // Đang mở: nút mở ẩn đi, nút Đóng nằm ở tiêu đề dính đỉnh (CSS: #detail-loan-section.is-loan-open).
    btn.hidden = true;
    if (closeBtn) closeBtn.hidden = false;
    section.classList.add('is-loan-open');
    syncStickyTop();
  }

  async function loadQuotes(cid) {
    quotes = [];
    renderQuotes();
    if (!sb) return;
    try {
      var list = await LoanStore.createStore(sb).listQuotes(cid);
      if (cid !== currentCid) return; // đã chuyển sang khách khác trong lúc chờ mạng
      quotes = list || [];
    } catch (e) {
      console.warn('[loan] listQuotes', e); // offline / chưa chạy SQL → chỉ ẩn danh sách
    }
    renderQuotes();
  }

  function renderQuotes() {
    quotesEl.hidden = !quotes.length;
    quotesEl.innerHTML = quotes.map(function (q, i) {
      var s = q.summary || {};
      var when = q.created_at ? new Date(q.created_at).toLocaleDateString('vi-VN') : '';
      return '<div class="loan-quote"><div class="lq-main">' +
        '<div><b>' + escapeHtml(q.unit_code || 'Phương án') + '</b> · vay ' + fmt.moneyShort(s.loan) +
        ' · <b>' + fmt.money(s.steadyPayment) + 'đ</b>/tháng</div>' +
        '<div class="lq-sub">Giá full ' + fmt.moneyShort(s.full) + ' · khách tự chuẩn bị ' + fmt.moneyShort(s.customerTotal) + ' · lưu ' + when + '</div>' +
        '</div><button type="button" class="btn-small" data-loan-quote="' + i + '">Mở</button></div>';
    }).join('');
  }

  // Gọi từ openDetail() trong app.js mỗi lần vẽ trang chi tiết.
  function onOpenDetail(c) {
    if (!section) return;
    if (c.id === currentCid) return; // vẽ lại cùng khách (vd vừa thêm ghi chú) → giữ bảng tính đang mở
    currentCid = c.id;
    closePanel();
    loadQuotes(c.id);
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (detailUI) closePanel(); else openPanel(null);
    });
    if (closeBtn) closeBtn.addEventListener('click', function () {
      // Đóng khi đang cuộn sâu trong bảng tính → bảng co lại, đưa thẻ về tầm mắt (khỏi bị "lạc" xuống thẻ khác).
      var wasStuck = section.getBoundingClientRect().top < 0;
      closePanel();
      if (wasStuck) {
        var barH = parseFloat(getComputedStyle(document.getElementById('detail-screen')).getPropertyValue('--detail-bar-h')) || 0;
        window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top - barH - 8);
      }
    });
    quotesEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-loan-quote]');
      if (!b) return;
      var q = quotes[+b.getAttribute('data-loan-quote')];
      if (!q) return;
      openPanel(q.inputs);
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  window.LoanCRM = { mountTab: mountTab, onOpenDetail: onOpenDetail };
})();
