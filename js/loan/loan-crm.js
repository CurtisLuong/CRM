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
  var consultant = { name: '', phone: '' };
  try { Object.assign(consultant, JSON.parse(localStorage.getItem(LS_CONSULTANT)) || {}); } catch (e) { /* bỏ qua */ }
  function saveConsultant() {
    try { localStorage.setItem(LS_CONSULTANT, JSON.stringify(consultant)); } catch (e) { /* bỏ qua */ }
  }
  var nameInp = document.getElementById('loan-consultant-name');
  var phoneInp = document.getElementById('loan-consultant-phone');
  if (nameInp && phoneInp) {
    nameInp.value = consultant.name || '';
    phoneInp.value = consultant.phone || '';
    nameInp.addEventListener('input', function () { consultant.name = nameInp.value.trim(); saveConsultant(); });
    phoneInp.addEventListener('input', function () { consultant.phone = phoneInp.value.trim(); saveConsultant(); });
  }

  // ---------- A. Tab "Tính vay" ----------
  var tabUI = null;
  function mountTab() {
    if (tabUI) return; // đã mount → giữ nguyên số đang nhập khi qua lại giữa các tab
    tabUI = LoanModule.mount(document.getElementById('loan-app'), {
      supabase: sb, consultant: consultant, theme: 'light'
    });
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
    if (c.apt_code) unit.code = String(c.apt_code).trim();
    if (Number(c.apt_area) > 0) unit.area = Number(c.apt_area);
    panel.hidden = false;
    detailUI = LoanModule.mount(panel, {
      supabase: sb,
      customer: { id: c.id, name: c.full_name, phone: c.phone },
      consultant: consultant,
      unit: unit,
      initialState: initialState || null,
      theme: 'light',
      onSaved: function () { loadQuotes(c.id); }
    });
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
