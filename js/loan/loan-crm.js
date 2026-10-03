/*!
 * loan-crm.js — "Keo dán" module Tính khoản vay (js/loan/*) vào CRM.
 * Tải SAU app.js: dùng lại các biến/hàm toàn cục của app.js (sb, allCustomers,
 * escapeHtml, showToast). KHÔNG đặt tên biến `supabase` (xem CLAUDE.md mục 5.1).
 *
 * 2 điểm gắn:
 *   A. Tab "Tính vay" (#loan-view) — bảng tính độc lập, không gắn khách.
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
  // Dự án = bảng project_options (biến projectOptions của app.js); loại căn = APT_TYPES;
  // gợi ý mã căn / mã toà = các giá trị đã có trong danh sách khách.
  function distinct(field) {
    var seen = {};
    allCustomers.forEach(function (c) { var v = c[field] && String(c[field]).trim(); if (v) seen[v] = 1; });
    return Object.keys(seen).sort();
  }
  function crmOptions() {
    return {
      supabase: sb, consultant: consultant, theme: 'light',
      projectOptions: projectOptions.map(function (o) { return o.name; }),
      aptTypes: APT_TYPES.slice(),
      suggestions: { codes: distinct('apt_code'), buildings: distinct('building_code') }
    };
  }

  // ---------- A. Tab "Tính vay" ----------
  var tabUI = null;
  function mountTab() {
    if (tabUI) return; // đã mount → giữ nguyên số đang nhập khi qua lại giữa các tab
    tabUI = LoanModule.mount(document.getElementById('loan-app'), crmOptions());
  }

  // ---------- B. Trang chi tiết khách ----------
  var section = document.getElementById('detail-loan-section');
  var btn = document.getElementById('detail-loan-btn');
  var panel = document.getElementById('detail-loan-panel');
  var quotesEl = document.getElementById('detail-loan-quotes');
  var detailUI = null;
  var currentCid = null;
  var quotes = [];

  function customerOf(cid) { return allCustomers.find(function (x) { return x.id === cid; }); }

  function closePanel() {
    if (detailUI) { detailUI.destroy(); detailUI = null; }
    panel.hidden = true;
    btn.textContent = '💰 Tính khoản vay';
  }

  function openPanel(initialState) {
    var c = customerOf(currentCid);
    if (!c) return;
    if (detailUI) detailUI.destroy();
    // Chỉ điền sẵn field có giá trị — truyền undefined sẽ đè mất mặc định của module.
    var unit = {};
    if (Array.isArray(c.projects) && c.projects[0]) unit.projectName = c.projects[0];
    if (c.apt_type) unit.aptType = canonicalAptType(c.apt_type);
    if (c.apt_code) unit.code = String(c.apt_code).trim();
    if (c.building_code) unit.building = String(c.building_code).trim();
    if (Number(c.apt_area) > 0) unit.area = Number(c.apt_area);
    panel.hidden = false;
    detailUI = LoanModule.mount(panel, Object.assign(crmOptions(), {
      customer: { id: c.id, name: c.full_name, phone: c.phone },
      unit: unit,
      initialState: initialState || null,
      onSaved: function () { loadQuotes(c.id); }
    }));
    panel.classList.add('lm-embedded');
    btn.textContent = '✕ Đóng bảng tính';
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
