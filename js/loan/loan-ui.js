/*!
 * loan-ui.js — Giao diện module "Tính khoản vay NOXH".
 * Cần: loan-engine.js, loan-store.js, loan-pdf.js, loan.css
 *
 *   const ui = LoanModule.mount(document.getElementById('loan'), {
 *     supabase,                                   // client Supabase của CRM (tùy chọn)
 *     customer: { id, name, phone },              // khách đang xem (tùy chọn)
 *     consultant: { name: 'Curtis', phone: '09xx' },
 *     unit: { projectName, aptType, code, building, area },  // điền sẵn (tùy chọn)
 *     projectOptions: ['Vin Tràng Cát', ...],     // danh sách dự án (CRM: bảng project_options)
 *     aptTypes: ['1N-1WC', '2N-2WC', ...],        // loại căn (CRM: APT_TYPES)
 *     suggestions: { codes: [...], buildings: [...] }, // gợi ý mã căn / mã toà
 *     onSaved: (quoteId) => {}
 *   });
 *
 * Bảng `projects` trên Supabase (nếu có dòng TRÙNG TÊN dự án) chỉ dùng làm cấu hình
 * nâng cao: VAT, KPBT, tiến độ CĐT, ngày bàn giao gợi ý. Không có → VAT 5%, KPBT 2%,
 * tiến độ mẫu trong loan-engine.js.
 */
(function (root) {
  'use strict';
  var E = root.LoanEngine;

  var DEFAULT_PRICE = 19911530;     // đơn giá mặc định ban đầu (đ/m²) khi dự án chưa có giá nhớ
  var DEFAULT_TITLE_MONTHS = 1.5;    // nhận sổ sau bàn giao (tháng)

  // ---------- Định dạng ----------
  function money(n) { return (Math.round(n) || 0).toLocaleString('vi-VN'); }
  function moneyShort(n) {
    n = Math.round(n) || 0;
    if (Math.abs(n) >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
    return money(n);
  }
  function dateVN(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function monthYear(iso) { var p = iso.split('-'); return p[1] + '/' + p[0]; }
  function parseMoney(s) { var d = String(s || '').replace(/[^\d]/g, ''); return d ? +d : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function todayISO() { var d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function monthsLabel(m) { var y = Math.floor(m / 12), r = m % 12; return (y ? y + ' năm' : '') + (y && r ? ' ' : '') + (r ? r + ' tháng' : '') || '0 tháng'; }

  // ---------- Mount ----------
  function mount(el, opts) {
    opts = opts || {};
    var store = root.LoanStore.createStore(opts.supabase);
    var projectNames = (opts.projectOptions || []).filter(Boolean);
    var aptTypes = opts.aptTypes || [];
    var sugg = opts.suggestions || {};
    var cfgs = [];        // cấu hình dự án từ bảng `projects` (khớp theo tên)
    var perProject = {};  // giá trị "lần cuối" theo từng dự án: bàn giao, nhận sổ, đơn giá
    var presets = clone(E.BANK_PRESETS);
    var showMonthly = false;
    var result = null, resultMsg = '';

    var state = {
      unit: {
        projectName: projectNames[0] || '', aptType: '', code: '', building: '',
        area: 53.6, pricePerM2: DEFAULT_PRICE, netOverride: null
      },
      dates: { contractDate: todayISO(), handoverDate: '', titleAfterMonths: DEFAULT_TITLE_MONTHS },
      loan: clone(E.DEFAULT_LOAN)
    };
    // Chỉ nhận field có giá trị — undefined/rỗng sẽ đè mất mặc định
    if (opts.unit) Object.keys(opts.unit).forEach(function (k) {
      if (opts.unit[k] != null && opts.unit[k] !== '') state.unit[k] = opts.unit[k];
    });
    var ui = {}; // projectOther / aptOther: đang ở chế độ "Khác…" (nhập tự do)
    function syncUiFlags() {
      ui.projectOther = !projectNames.length || (!!state.unit.projectName && projectNames.indexOf(state.unit.projectName) < 0);
      ui.aptOther = !!state.unit.aptType && aptTypes.indexOf(state.unit.aptType) < 0;
    }
    syncUiFlags();

    el.classList.add('lm-root');
    if (opts.theme) el.setAttribute('data-theme', opts.theme);
    el.innerHTML = '<div class="lm-form"></div><div class="lm-results"></div>' +
      '<div class="lm-actions">' +
      (store.hasRemote ? '<button class="lm-btn" data-act="save">💾 Lưu phương án</button>' : '') +
      '<button class="lm-btn primary" data-act="pdf">📄 Xuất PDF</button></div>';
    var formEl = el.querySelector('.lm-form');
    var resEl = el.querySelector('.lm-results');

    function norm(x) { return String(x || '').trim().toLowerCase(); }
    function projectCfg() {
      var n = norm(state.unit.projectName);
      return (n && cfgs.filter(function (p) { return norm(p.name) === n; })[0]) || null;
    }
    function autoNet() { return Math.round((+state.unit.area || 0) * (+state.unit.pricePerM2 || 0)); }

    // Đổi dự án → nạp giá trị "lần cuối" của dự án đó (không có → gợi ý từ bảng projects / mặc định)
    function applyProjectMemory() {
      var m = perProject[state.unit.projectName.trim()] || {}, cfg = projectCfg();
      state.dates.handoverDate = m.handoverDate || (cfg && cfg.handover_date) || '';
      state.dates.titleAfterMonths = m.titleAfterMonths != null ? m.titleAfterMonths : DEFAULT_TITLE_MONTHS;
      if (m.pricePerM2) state.unit.pricePerM2 = m.pricePerM2;
      else if (cfg && cfg.unit_types && cfg.unit_types[0]) state.unit.pricePerM2 = +cfg.unit_types[0].price_per_m2;
      state.unit.netOverride = null;
    }
    function rememberProject() {
      var name = state.unit.projectName.trim();
      if (!name) return;
      perProject[name] = { handoverDate: state.dates.handoverDate || null,
                           titleAfterMonths: state.dates.titleAfterMonths, pricePerM2: state.unit.pricePerM2 };
      persist();
    }

    // ---------- Tính ----------
    function buildInput() {
      var p = projectCfg() || {};
      var schedule = clone(p.payment_schedule || E.DEFAULT_SCHEDULE).map(function (m) {
        if (m.role === 'title' && m.due && m.due.type === 'afterHandoverMonths') m.due.value = +state.dates.titleAfterMonths || 0;
        return m;
      });
      return {
        unit: { area: +state.unit.area, pricePerM2: +state.unit.pricePerM2, netPriceOverride: state.unit.netOverride,
                vatRate: p.vat_rate == null ? 5 : +p.vat_rate, kpbtRate: p.kpbt_rate == null ? 2 : +p.kpbt_rate },
        dates: { contractDate: state.dates.contractDate, handoverDate: state.dates.handoverDate },
        schedule: schedule,
        loan: state.loan
      };
    }
    function recalc() {
      resultMsg = '';
      if (!state.dates.handoverDate) { result = null; resultMsg = 'Nhập ngày bàn giao dự kiến để tính tiến độ thanh toán.'; }
      else {
        try { result = E.compute(buildInput()); }
        catch (e) { console.error(e); result = null; }
      }
      renderResults();
    }

    // ---------- Form ----------
    function field(label, bind, value, type, extra) {
      extra = extra || {};
      var t = type === 'money' ? 'text" inputmode="numeric' : type;
      var v = type === 'money' ? (value == null ? '' : money(value)) : (value == null ? '' : value);
      return '<div class="lm-field ' + (extra.cls || '') + '"><label>' + label + '</label>' +
        '<input type="' + t + '" data-bind="' + bind + '" data-type="' + type + '" value="' + esc(v) + '"' +
        (extra.step ? ' step="' + extra.step + '"' : '') + (extra.placeholder ? ' placeholder="' + esc(extra.placeholder) + '"' : '') +
        (extra.inputCls ? ' class="' + extra.inputCls + '"' : '') + (extra.list ? ' list="' + extra.list + '"' : '') + '>' +
        (extra.hint ? '<div class="lm-hint">' + extra.hint + '</div>' : '') + '</div>';
    }

    // Dropdown + lựa chọn "Khác…" → hiện ô nhập tự do (giống form khách của CRM)
    function selectOther(label, bind, options, value, isOther, ph, blank) {
      return '<div class="lm-field"><label>' + label + '</label><select data-bind="' + bind + '" data-type="select-other">' +
        (blank ? '<option value=""' + (!isOther && !value ? ' selected' : '') + '>— Chọn —</option>' : '') +
        options.map(function (o) { return '<option value="' + esc(o) + '"' + (!isOther && o === value ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
        '<option value="__other"' + (isOther ? ' selected' : '') + '>Khác…</option></select>' +
        (isOther ? '<input type="text" class="lm-other" data-bind="' + bind + '" data-type="text" data-other="1" value="' + esc(value) + '" placeholder="' + esc(ph) + '">' : '') +
        '</div>';
    }
    function datalist(id, items) {
      return '<datalist id="' + id + '">' + (items || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
    }
    function netHint() {
      return state.unit.netOverride
        ? 'Đã nhập tay (tự tính: ' + money(autoNet()) + ') · <a href="#" data-act="resetNet">tính lại</a>'
        : 'Tự tính = diện tích × đơn giá · sửa được để khớp phiếu CĐT';
    }

    function renderForm() {
      var u = state.unit, d = state.dates, L = state.loan;
      var t1 = L.rateTiers[0] || { months: 60, rate: 6.5 };
      var t2 = L.rateTiers[1] || null;
      var preset = presets.filter(function (x) { return x.key === L.presetKey; })[0];
      var maxGrace = preset ? preset.maxGraceMonths : 60;

      formEl.innerHTML =
        '<div class="lm-head"><h2>Tính khoản vay NOXH</h2>' +
        (opts.customer && opts.customer.name ? '<small>Khách: ' + esc(opts.customer.name) + '</small>' : '') + '</div>' +

        // Căn hộ
        '<section class="lm-card"><h3>Căn hộ</h3><div class="lm-grid lm-collapse">' +
          selectOther('Dự án', 'unit.projectName', projectNames, u.projectName, ui.projectOther, 'Nhập tên dự án', false) +
          selectOther('Loại căn', 'unit.aptType', aptTypes, u.aptType, ui.aptOther, 'VD: 2N+1, Studio', true) +
          field('Mã căn', 'unit.code', u.code, 'text', { placeholder: 'VD: R30413', list: 'lm-dl-code' }) +
          field('Mã toà', 'unit.building', u.building, 'text', { placeholder: 'VD: THE RISE 3', list: 'lm-dl-building' }) +
          field('Diện tích thông thủy (m²)', 'unit.area', u.area, 'number', { step: 'any' }) +
          field('Đơn giá (đ/m²)', 'unit.pricePerM2', u.pricePerM2, 'money', { hint: 'Nhớ theo từng dự án' }) +
          field('Giá bán thuần', 'unit.netOverride', u.netOverride || autoNet(), 'money', {
            cls: 'lm-full', inputCls: u.netOverride ? 'lm-edited' : '', hint: netHint()
          }) +
        '</div>' + datalist('lm-dl-code', sugg.codes) + datalist('lm-dl-building', sugg.buildings) + '</section>' +

        // Mốc thời gian
        '<section class="lm-card"><h3>Mốc thời gian</h3><div class="lm-grid">' +
          field('Ngày ký HĐMB (T)', 'dates.contractDate', d.contractDate, 'date') +
          field('Bàn giao dự kiến', 'dates.handoverDate', d.handoverDate, 'date', { hint: 'Nhớ theo từng dự án' }) +
          field('Nhận sổ sau bàn giao (tháng)', 'dates.titleAfterMonths', d.titleAfterMonths, 'number', { cls: 'lm-full', step: 'any', hint: 'Mặc định 1,5 tháng · nhớ theo từng dự án. Dùng tính ngày giải ngân đợt nhận sổ' }) +
        '</div></section>' +

        // Gói vay
        '<section class="lm-card"><h3>Gói vay</h3>' +
          '<div class="lm-chips" style="margin-bottom:12px">' +
            presets.map(function (x) { return '<button type="button" class="lm-chip" data-preset="' + x.key + '" aria-pressed="' + (x.key === L.presetKey) + '">' + esc(x.name) + '</button>'; }).join('') +
          '</div><div class="lm-grid">' +
          field('Tỷ lệ vay (% giá gồm VAT)', 'loan.ltv', L.ltv, 'number', { step: 'any' }) +
          field('Số tiền vay', 'loan.loanOverride', L.loanOverride, 'money', { placeholder: result ? money(result.loan.maxByLtv) : 'Tự tính', hint: 'Để trống = tự tính theo tỷ lệ' }) +
          field('Thời hạn vay (năm)', 'loan.termYears', L.termYears, 'number', { step: 'any' }) +
          field('Lãi thả nổi sau ưu đãi (%/năm)', 'loan.floatingRate', L.floatingRate, 'number', { step: 'any', hint: 'Giả định' }) +
          field('Lãi ưu đãi (%/năm)', 'tier.0.rate', t1.rate, 'number', { step: 'any' }) +
          field('Thời gian ưu đãi (tháng)', 'tier.0.months', t1.months, 'number', { hint: monthsLabel(+t1.months || 0) }) +
          field('Lãi giai đoạn 2 (%/năm)', 'tier.1.rate', t2 ? t2.rate : '', 'number', { step: 'any', placeholder: 'Không có' }) +
          field('Giai đoạn 2 kéo dài (tháng)', 'tier.1.months', t2 ? t2.months : '', 'number', { placeholder: '—' }) +
          '<div class="lm-field lm-full"><label>Bắt đầu tính gốc / ân hạn từ</label><div class="lm-seg">' +
            '<button type="button" data-seg="loan.principalStart" data-val="first" aria-pressed="' + (L.principalStart !== 'last') + '">Lần giải ngân đầu</button>' +
            '<button type="button" data-seg="loan.principalStart" data-val="last" aria-pressed="' + (L.principalStart === 'last') + '">Lần giải ngân cuối</button>' +
          '</div></div>' +
          '<div class="lm-field lm-full"><div class="lm-inline">' +
            '<label class="lm-check" style="margin:0"><input type="checkbox" data-bind="loan.graceEnabled" data-type="bool"' + (L.graceEnabled ? ' checked' : '') + '> Ân hạn gốc</label>' +
            (L.graceEnabled ? '<input type="number" data-bind="loan.graceMonths" data-type="number" value="' + esc(L.graceMonths) + '" style="width:90px"> <span class="lm-note">tháng (tối đa ' + maxGrace + ')</span>' : '') +
          '</div></div>' +
          '<div class="lm-field lm-full"><label>Cách tính lãi</label><div class="lm-seg">' +
            '<button type="button" data-seg="loan.dayCount" data-val="actual365" aria-pressed="' + (L.dayCount !== 'monthly') + '">Theo ngày thực tế /365</button>' +
            '<button type="button" data-seg="loan.dayCount" data-val="monthly" aria-pressed="' + (L.dayCount === 'monthly') + '">Lãi năm ÷ 12</button>' +
          '</div></div>' +
        '</div></section>' +

        // Tất toán
        '<section class="lm-card"><h3>Tất toán sớm</h3><div class="lm-grid">' +
          field('Tất toán sau (tháng vay)', 'loan.payoffMonth', L.payoffMonth, 'number', { hint: monthsLabel(+L.payoffMonth || 0) }) +
          field('Phí theo năm vay (%)', 'loan.prepayFees', (L.prepayFees || []).join(', '), 'text', { hint: 'Năm 1, 2, 3… cách nhau dấu phẩy. Hết danh sách = miễn phí' }) +
        '</div></section>';
    }

    // ---------- Kết quả ----------
    function renderResults() {
      if (!result || !result.schedule) {
        resEl.innerHTML = '<div class="lm-card"><div class="lm-alert">' + esc(resultMsg || 'Chưa đủ dữ liệu để tính. Kiểm tra diện tích, đơn giá và tỷ lệ vay.') + '</div></div>';
        return;
      }
      var r = result, P = r.price, S = r.schedule;
      // Tiền trả/tháng khi đã giải ngân đủ và đang trả gốc
      var idx = Math.max(S.lastDisbMonth, S.principalStartMonth) ; // kỳ tiếp theo sau mốc
      var steady = S.rows[Math.min(idx, S.rows.length - 1)];

      var html = '';
      if (r.warnings.length) html += '<div class="lm-alert">' + r.warnings.map(esc).join('<br>') + '</div>';

      html += '<section class="lm-card"><div class="lm-hero">' +
        '<div class="lm-stat lm-accent"><div class="k">Trả/tháng khi trả gốc đủ (' + monthYear(steady.date) + ')</div><div class="v">' + money(steady.payment) + 'đ</div></div>' +
        '<div class="lm-stat"><div class="k">Khách tự chuẩn bị</div><div class="v">' + moneyShort(r.loan.customerTotal) + '</div></div>' +
        '<div class="lm-stat"><div class="k">Ngân hàng cho vay</div><div class="v">' + moneyShort(r.loan.amount) + '</div></div>' +
      '</div></section>';

      // Giá
      html += '<section class="lm-card"><h3>Phiếu giá</h3><div class="lm-kv">' +
        '<span class="k">Diện tích × đơn giá</span><span class="v">' + P.area + ' m² × ' + money(P.pricePerM2) + '</span>' +
        '<span class="k">Giá bán thuần</span><span class="v">' + money(P.net) + '</span>' +
        '<span class="k">VAT (' + P.vatRate + '%)</span><span class="v">' + money(P.vat) + '</span>' +
        '<span class="k">Giá gồm VAT (giá HĐMB)</span><span class="v">' + money(P.gross) + '</span>' +
        '<span class="k">Kinh phí bảo trì (' + P.kpbtRate + '%)</span><span class="v">' + money(P.kpbt) + '</span><hr>' +
        '<span class="k">Giá FULL</span><span class="v lm-strong">' + money(P.full) + 'đ</span>' +
      '</div></section>';

      // Tiến độ
      html += '<section class="lm-card"><h3>Tiến độ thanh toán</h3><div class="lm-table-wrap"><table class="lm-table">' +
        '<thead><tr><th>Đợt</th><th class="n">Số tiền</th><th class="n">Ai trả</th></tr></thead><tbody>' +
        r.milestones.map(function (m, i) {
          var who = [];
          if (m.customer > 0) who.push('<span class="lm-pill own">Khách ' + money(m.customer) + '</span>');
          if (m.bank > 0) who.push('<span class="lm-pill bank">NH ' + money(m.bank) + '</span>');
          return '<tr><td><b>Đợt ' + (i + 1) + '</b> · ' + m.pct + '%<span class="lm-sub">' + esc(m.label) + '</span><span class="lm-sub">' + dateVN(m.date) + '</span></td>' +
            '<td class="n">' + money(m.amount) + (m.kpbt ? '<span class="lm-sub">gồm KPBT ' + money(m.kpbt) + '</span>' : '') + '</td>' +
            '<td class="n">' + who.join('<br>') + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr><td>Tổng</td><td class="n">' + money(P.full) + '</td><td class="n"><span class="lm-pill own">Khách ' + money(r.loan.customerTotal) + '</span><br><span class="lm-pill bank">NH ' + money(r.loan.amount) + '</span></td></tr></tfoot>' +
        '</table></div></section>';

      // Các giai đoạn trả nợ
      html += '<section class="lm-card"><h3>Trả ngân hàng hàng tháng</h3><div class="lm-phases">' +
        S.phases.map(function (ph) {
          var title = ph.type === 'interestOnly' ? 'Chỉ trả lãi' + (ph.fromMonth <= S.lastDisbMonth ? ' (đang giải ngân)' : ' (ân hạn gốc)') : 'Gốc + lãi';
          var amt = ph.minPayment === ph.maxPayment ? money(ph.firstPayment) + 'đ'
            : money(ph.firstPayment) + ' → ' + money(ph.lastPayment) + 'đ';
          return '<div class="lm-phase' + (ph.type === 'interestOnly' ? ' io' : '') + '">' +
            '<div class="t">' + title + ' · lãi ' + ph.rate + '%</div>' +
            '<div class="d">Tháng ' + ph.fromMonth + '–' + ph.toMonth + ' (' + monthYear(ph.fromDate) + ' → ' + monthYear(ph.toDate) + ')</div>' +
            '<div class="p">' + amt + '</div></div>';
        }).join('') + '</div>' +
        chartSVG(S) +
        '<div class="lm-kv" style="margin-top:10px">' +
          '<span class="k">Tiền trả cao nhất 1 tháng</span><span class="v">' + money(r.maxPayment) + 'đ</span>' +
          '<span class="k">Tổng lãi cả kỳ hạn</span><span class="v">' + money(S.totalInterest) + 'đ</span>' +
          '<span class="k">Tổng trả ngân hàng</span><span class="v">' + money(S.totalPaid) + 'đ</span>' +
        '</div><p class="lm-note">Lãi = dư nợ thực tế × lãi suất năm × số ngày ÷ 365. Gốc giảm dần: gốc mỗi kỳ = dư nợ ÷ số kỳ còn lại.</p></section>';

      // Lịch theo năm / tháng
      html += '<section class="lm-card"><h3>Lịch trả nợ ' + (showMonthly ? 'theo tháng' : 'theo năm') + '</h3>' +
        '<div class="lm-seg" style="margin-bottom:8px"><button type="button" data-act="yearly" aria-pressed="' + !showMonthly + '">Theo năm</button><button type="button" data-act="monthly" aria-pressed="' + showMonthly + '">Theo tháng</button></div>' +
        '<div class="lm-table-wrap"><table class="lm-table">' +
        (showMonthly
          ? '<thead><tr><th>Kỳ</th><th class="n">Gốc</th><th class="n">Lãi</th><th class="n">Tổng trả</th><th class="n">Dư nợ</th></tr></thead><tbody>' +
            S.rows.map(function (x) {
              return '<tr><td>' + x.k + '<span class="lm-sub">' + dateVN(x.date) + (x.disbursed ? ' · +GN ' + moneyShort(x.disbursed) : '') + '</span></td><td class="n">' + money(x.principal) + '</td><td class="n">' + money(x.interest) + '</td><td class="n"><b>' + money(x.payment) + '</b></td><td class="n">' + moneyShort(x.balance) + '</td></tr>';
            }).join('')
          : '<thead><tr><th>Năm</th><th class="n">TB/tháng</th><th class="n">Gốc</th><th class="n">Lãi</th><th class="n">Dư nợ cuối</th></tr></thead><tbody>' +
            S.years.map(function (y) {
              return '<tr><td>' + y.year + '</td><td class="n"><b>' + money(y.avgPayment) + '</b></td><td class="n">' + moneyShort(y.principal) + '</td><td class="n">' + moneyShort(y.interest) + '</td><td class="n">' + moneyShort(y.balance) + '</td></tr>';
            }).join('')) +
        '</tbody></table></div></section>';

      // Tất toán
      var po = r.payoff;
      if (po) {
        html += '<section class="lm-card"><h3>Tất toán sau ' + monthsLabel(po.month) + '</h3>' +
          (po.warning ? '<div class="lm-alert">' + esc(po.warning) + '</div>' : '') +
          '<div class="lm-kv">' +
            '<span class="k">Thời điểm</span><span class="v">' + dateVN(po.date) + ' (năm vay thứ ' + po.loanYear + ')</span>' +
            '<span class="k">Dư nợ gốc còn lại</span><span class="v">' + money(po.balance) + '</span>' +
            '<span class="k">Phí trả trước (' + po.feePct + '%)</span><span class="v">' + money(po.fee) + '</span><hr>' +
            '<span class="k">Cần chuẩn bị để tất toán</span><span class="v lm-strong">' + money(po.totalToPay) + 'đ</span>' +
            '<span class="k">Lãi đã trả đến lúc đó</span><span class="v">' + money(po.interestPaid) + '</span>' +
            '<span class="k">Lãi tránh được (trừ phí)</span><span class="v">' + money(po.netSaving) + '</span>' +
          '</div></section>';
      }

      html += '<p class="lm-note">PTG tạm tính để tham khảo. Lãi suất ưu đãi gói NQ33/người trẻ do NHNN công bố lại 6 tháng/lần; lãi thả nổi là giả định. Phí trả trước theo hợp đồng tín dụng thực tế của từng ngân hàng.</p>';
      resEl.innerHTML = html;

      // cập nhật placeholder số tiền vay
      var loanInput = formEl.querySelector('[data-bind="loan.loanOverride"]');
      if (loanInput) loanInput.placeholder = money(r.loan.maxByLtv);
    }

    function chartSVG(S) {
      var W = 600, H = 170, pl = 44, pr = 8, pt = 10, pb = 22;
      var rows = S.rows, n = rows.length;
      var max = Math.max.apply(null, rows.map(function (r) { return r.payment; })) || 1;
      var x = function (k) { return pl + (k - 1) / Math.max(1, n - 1) * (W - pl - pr); };
      var y = function (v) { return pt + (1 - v / max) * (H - pt - pb); };
      var line = rows.map(function (r, i) { return (i ? 'L' : 'M') + x(r.k).toFixed(1) + ' ' + y(r.payment).toFixed(1); }).join(' ');
      var area = line + ' L' + x(n).toFixed(1) + ' ' + y(0) + ' L' + x(1) + ' ' + y(0) + ' Z';
      var ticks = '';
      for (var yr = 0; yr <= n / 12; yr += 5) {
        var k = Math.max(1, yr * 12);
        ticks += '<text class="lbl" x="' + x(k).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + (yr ? 'Năm ' + yr : 'Bắt đầu') + '</text>';
      }
      return '<svg class="lm-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Biểu đồ tiền trả hàng tháng">' +
        '<line class="ax" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>' +
        '<line class="ax" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(max) + '" y2="' + y(max) + '" stroke-dasharray="3 3"/>' +
        '<text class="lbl" x="' + (pl - 4) + '" y="' + (y(max) + 3) + '" text-anchor="end">' + moneyShort(max) + '</text>' +
        '<text class="lbl" x="' + (pl - 4) + '" y="' + (y(0) + 3) + '" text-anchor="end">0</text>' +
        '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/>' + ticks + '</svg>';
    }

    // ---------- Lưu cài đặt "lần cuối" ----------
    var persist = debounce(function () {
      var s = clone(state.loan); delete s.loanOverride;
      store.saveSettings({ loan: s, perProject: perProject });
    }, 1200);

    // ---------- Sự kiện ----------
    function setPath(path, val) {
      var parts = path.split('.'), o = state;
      for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = val;
    }
    function readInput(inp) {
      var t = inp.getAttribute('data-type');
      if (t === 'money') return parseMoney(inp.value);
      if (t === 'number') return inp.value === '' ? null : +inp.value;
      if (t === 'bool') return inp.checked;
      return inp.value;
    }

    // Cập nhật giá trị các ô phụ thuộc dự án mà KHÔNG vẽ lại form (giữ con trỏ đang gõ)
    function setInputValue(bind, v) {
      var inp = formEl.querySelector('input[data-bind="' + bind + '"]');
      if (inp && inp !== document.activeElement) inp.value = v == null ? '' : v;
    }
    function syncNetField() {
      var inp = formEl.querySelector('input[data-bind="unit.netOverride"]');
      if (!inp) return;
      if (inp !== document.activeElement) inp.value = money(state.unit.netOverride || autoNet());
      inp.classList.toggle('lm-edited', !!state.unit.netOverride);
      var h = inp.parentNode.querySelector('.lm-hint');
      if (h) h.innerHTML = netHint();
    }
    function syncProjectFields() {
      setInputValue('dates.handoverDate', state.dates.handoverDate);
      setInputValue('dates.titleAfterMonths', state.dates.titleAfterMonths);
      setInputValue('unit.pricePerM2', money(state.unit.pricePerM2));
      syncNetField();
    }

    function onInput(e) {
      var inp = e.target, bind = inp.getAttribute('data-bind');
      if (!bind) return;
      // Dropdown có lựa chọn "Khác…" (dự án / loại căn)
      if (inp.getAttribute('data-type') === 'select-other') {
        if (e.type !== 'change') return;
        var flag = bind === 'unit.projectName' ? 'projectOther' : 'aptOther';
        ui[flag] = inp.value === '__other';
        setPath(bind, ui[flag] ? '' : inp.value);
        if (bind === 'unit.projectName') applyProjectMemory();
        renderForm(); recalc();
        if (ui[flag]) { var o = formEl.querySelector('input[data-other][data-bind="' + bind + '"]'); if (o) o.focus(); }
        return;
      }
      // Gõ xong tên dự án tự do (rời ô) → nạp giá trị "lần cuối" của dự án đó
      if (e.type === 'change' && bind === 'unit.projectName') { applyProjectMemory(); syncProjectFields(); recalc(); return; }
      // Rời ô giá bán thuần mà để trống → hiện lại giá tự tính
      if (e.type === 'change' && bind === 'unit.netOverride') { syncNetField(); return; }
      // Ô văn bản/số đã xử lý ở sự kiện 'input' → bỏ qua 'change' để không vẽ lại 2 lần
      if (e.type === 'change' && inp.tagName === 'INPUT' && /^(text|number)$/.test(inp.type)) return;
      var val = readInput(inp);
      if (inp.getAttribute('data-type') === 'money' && e.type === 'input') {
        inp.value = val == null ? '' : money(val);
      }
      if (bind.indexOf('tier.') === 0) {
        var bits = bind.split('.'), i = +bits[1], key = bits[2];
        var tiers = state.loan.rateTiers;
        if (i === 1 && !tiers[1]) tiers[1] = { months: 120, rate: null };
        if (tiers[i]) tiers[i][key] = val;
        if (tiers[1] && (tiers[1].rate == null || tiers[1].rate === '')) tiers.splice(1, 1);
      } else if (bind === 'loan.prepayFees') {
        state.loan.prepayFees = String(val).split(/[,;\s]+/).filter(Boolean).map(Number).filter(function (x) { return !isNaN(x); });
      } else {
        setPath(bind, val);
      }

      // Sửa 1 thông số định nghĩa gói (tỷ lệ vay, thời hạn, lãi, phí trả trước) → không còn
      // đúng gói đang chọn nữa → tự chuyển sang "Khác" (giữ nguyên các số đang nhập).
      if (/^(loan\.(ltv|termYears|floatingRate|prepayFees)$|tier\.)/.test(bind)) markCustom();

      var structural = false;
      if (bind === 'loan.graceEnabled') structural = true;
      if (bind === 'loan.graceEnabled' || bind === 'loan.graceMonths') {
        var pr = presets.filter(function (x) { return x.key === state.loan.presetKey; })[0];
        if (pr && state.loan.graceMonths > pr.maxGraceMonths) state.loan.graceMonths = pr.maxGraceMonths;
      }
      // Diện tích / đơn giá đổi → giá bán thuần tự tính lại theo thời gian thực
      if (bind === 'unit.area' || bind === 'unit.pricePerM2') { state.unit.netOverride = null; syncNetField(); }
      if (bind === 'unit.netOverride') syncNetField();
      if (bind === 'unit.pricePerM2' || bind === 'dates.handoverDate' || bind === 'dates.titleAfterMonths') rememberProject();
      if (/months$|payoffMonth/.test(bind) && inp.type === 'number') {
        var h = inp.parentNode.querySelector('.lm-hint');
        if (h && val != null) h.textContent = monthsLabel(+val);
      }
      if (bind.indexOf('loan.') === 0 || bind.indexOf('tier.') === 0) persist();
      if (structural && e.type === 'change') renderForm();
      recalc();
    }

    // Gói cũ đã bỏ (HDBank, TPBank...) trong cài đặt / phương án đã lưu → coi là "Khác"
    function fixPresetKey() {
      if (!presets.some(function (p) { return p.key === state.loan.presetKey; })) state.loan.presetKey = 'custom';
    }
    function markCustom() {
      if (state.loan.presetKey === 'custom') return;
      state.loan.presetKey = 'custom';
      // Cập nhật nút gói vay tại chỗ, KHÔNG vẽ lại form (đang gõ dở trong ô)
      formEl.querySelectorAll('[data-preset]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === 'custom'));
      });
      var c = presets.filter(function (p) { return p.key === 'custom'; })[0];
      var note = formEl.querySelector('[data-bind="loan.graceMonths"] ~ .lm-note');
      if (c && note) note.textContent = 'tháng (tối đa ' + c.maxGraceMonths + ')';
    }

    function onClick(e) {
      var b = e.target.closest('[data-preset],[data-seg],[data-act]');
      if (!b || !el.contains(b)) return;
      if (b.hasAttribute('data-preset')) {
        var pr = presets.filter(function (x) { return x.key === b.getAttribute('data-preset'); })[0];
        // Bấm "Khác" → giữ nguyên số đang có, chỉ mở khoá để tự chỉnh
        if (pr.key === 'custom') { state.loan.presetKey = 'custom'; persist(); renderForm(); recalc(); return; }
        Object.assign(state.loan, {
          presetKey: pr.key, ltv: pr.ltv, termYears: pr.termYears, rateTiers: clone(pr.rateTiers),
          floatingRate: pr.floatingRate, prepayFees: clone(pr.prepayFees), loanOverride: null
        });
        if (state.loan.graceMonths > pr.maxGraceMonths) state.loan.graceMonths = pr.maxGraceMonths;
        persist(); renderForm(); recalc(); return;
      }
      if (b.hasAttribute('data-seg')) {
        setPath(b.getAttribute('data-seg'), b.getAttribute('data-val'));
        persist(); renderForm(); recalc(); return;
      }
      var act = b.getAttribute('data-act');
      if (act === 'resetNet') { e.preventDefault(); state.unit.netOverride = null; syncNetField(); recalc(); }
      if (act === 'yearly' || act === 'monthly') { showMonthly = act === 'monthly'; renderResults(); }
      if (act === 'pdf') exportPdf(b);
      if (act === 'save') saveQuote(b);
    }

    function toast(msg) {
      var t = document.createElement('div'); t.className = 'lm-toast'; t.textContent = msg;
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2500);
    }

    function context() {
      var u = state.unit;
      return { projectName: u.projectName, aptType: u.aptType, unitCode: u.code, building: u.building,
               customer: opts.customer || null, consultant: opts.consultant || null };
    }

    async function exportPdf(btn) {
      if (!result || !result.schedule) return;
      btn.disabled = true; var old = btn.textContent; btn.textContent = 'Đang tạo PDF…';
      try { await root.LoanPDF.exportPdf(result, context()); }
      catch (err) { console.error(err); toast('Không tạo được PDF: ' + err.message); }
      btn.disabled = false; btn.textContent = old;
    }

    async function saveQuote(btn) {
      if (!result || !result.schedule) return;
      btn.disabled = true;
      try {
        var steadyIdx = Math.min(Math.max(result.schedule.lastDisbMonth, result.schedule.principalStartMonth), result.schedule.rows.length - 1);
        var id = await store.saveQuote({
          customerId: opts.customer && opts.customer.id, projectId: projectCfg() ? projectCfg().id : null,
          unitCode: state.unit.code, inputs: clone(state),
          summary: {
            full: result.price.full, loan: result.loan.amount, customerTotal: result.loan.customerTotal,
            steadyPayment: result.schedule.rows[steadyIdx].payment, maxPayment: result.maxPayment,
            totalInterest: result.schedule.totalInterest, presetKey: state.loan.presetKey
          }
        });
        toast('Đã lưu phương án');
        if (opts.onSaved) opts.onSaved(id);
      } catch (err) { console.error(err); toast('Lỗi lưu: ' + err.message); }
      btn.disabled = false;
    }

    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    el.addEventListener('click', onClick);

    // ---------- Khởi động ----------
    renderForm(); recalc();
    (async function init() {
      var ps = await Promise.all([store.loadSettings(), store.loadProjects(), store.loadBankPresets()]);
      var saved = ps[0], remotePresets = ps[2];
      cfgs = ps[1] || [];
      // Supabase chỉ cập nhật SỐ LIỆU cho các gói có trong code (cùng key); tên + danh sách giữ theo code
      if (remotePresets && remotePresets.length) presets = presets.map(function (p) {
        var r = remotePresets.filter(function (x) { return x.key === p.key; })[0];
        return r ? Object.assign({}, r, { key: p.key, name: p.name }) : p;
      });
      if (saved && saved.perProject) perProject = saved.perProject;
      if (saved && saved.loan) Object.assign(state.loan, saved.loan, { loanOverride: null });
      fixPresetKey();
      applyProjectMemory();
      if (opts.initialState) { // mở lại phương án đã lưu → dùng đúng số đã lưu
        Object.assign(state.unit, opts.initialState.unit || {});
        Object.assign(state.dates, opts.initialState.dates || {});
        Object.assign(state.loan, opts.initialState.loan || {});
        if (state.unit.projectName == null) state.unit.projectName = ''; // phương án lưu từ bản cũ
        fixPresetKey();
        syncUiFlags();
      }
      renderForm(); recalc();
    })();

    return {
      getState: function () { return clone(state); },
      getResult: function () { return result; },
      destroy: function () {
        el.removeEventListener('input', onInput); el.removeEventListener('change', onInput);
        el.removeEventListener('click', onClick); el.innerHTML = ''; el.classList.remove('lm-root');
      }
    };
  }

  root.LoanModule = { mount: mount, format: { money: money, moneyShort: moneyShort, dateVN: dateVN } };
})(window);
