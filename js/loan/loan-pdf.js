/*!
 * loan-pdf.js — Xuất phiếu tính giá + phương án vay ra PDF (A4).
 * Dùng html2pdf.js (tải từ CDN khi cần). Không tải được → mở hộp thoại In (Lưu thành PDF).
 */
(function (root) {
  'use strict';
  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  var loading = null;

  function loadLib() {
    if (root.html2pdf) return Promise.resolve(root.html2pdf);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CDN; s.async = true;
      s.onload = function () { resolve(root.html2pdf); };
      s.onerror = function () { loading = null; reject(new Error('Không tải được thư viện PDF')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function money(n) { return (Math.round(n) || 0).toLocaleString('vi-VN'); }
  function dateVN(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function monthYear(iso) { var p = iso.split('-'); return p[1] + '/' + p[0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function buildHTML(r, ctx) {
    var P = r.price, S = r.schedule, L = r.loan.params, po = r.payoff;
    var steady = S.rows[Math.min(Math.max(S.lastDisbMonth, S.principalStartMonth), S.rows.length - 1)];
    var tiers = (L.rateTiers || []).map(function (t) { return t.rate + '% trong ' + t.months + ' tháng'; }).join(', sau đó ');
    var today = new Date().toLocaleDateString('vi-VN');

    var h = '<div class="lm-print">' +
      '<h1>PHIẾU TÍNH GIÁ TẠM TÍNH ' + esc((ctx.projectName || '').toUpperCase()) + '</h1>' +
      '<div class="sub">(PTG tạm tính để tham khảo · lập ngày ' + today + ')</div>' +

      '<div class="two"><table>' +
        (ctx.customer && ctx.customer.name ? '<tr><th>Khách hàng</th><td>' + esc(ctx.customer.name) + '</td></tr>' : '') +
        '<tr><th>Phân khu / loại căn</th><td>' + esc(ctx.unitTypeName) + '</td></tr>' +
        '<tr><th>Mã căn</th><td><b>' + esc(ctx.unitCode || '—') + '</b></td></tr>' +
        '<tr><th>Diện tích thông thủy</th><td>' + P.area + ' m²</td></tr>' +
        '<tr><th>Đơn giá</th><td>' + money(P.pricePerM2) + ' đ/m²</td></tr>' +
      '</table><table>' +
        '<tr><th>Giá bán thuần</th><td class="n">' + money(P.net) + '</td></tr>' +
        '<tr><th>VAT (' + P.vatRate + '%)</th><td class="n">' + money(P.vat) + '</td></tr>' +
        '<tr><th>Giá gồm VAT</th><td class="n">' + money(P.gross) + '</td></tr>' +
        '<tr><th>Kinh phí bảo trì (' + P.kpbtRate + '%)</th><td class="n">' + money(P.kpbt) + '</td></tr>' +
        '<tr><th>Giá FULL</th><td class="n big">' + money(P.full) + '</td></tr>' +
      '</table></div>' +

      '<h2>Phương án thanh toán theo tiến độ</h2><table><thead><tr>' +
        '<th>Đợt</th><th>Tiến độ</th><th>Ngày dự kiến</th><th class="n">Tỷ lệ</th><th class="n">Số tiền</th><th class="n">Khách trả</th><th class="n">NH giải ngân</th></tr></thead><tbody>' +
        r.milestones.map(function (m, i) {
          return '<tr><td>Đợt ' + (i + 1) + '</td><td>' + esc(m.label) + '</td><td>' + dateVN(m.date) + '</td><td class="n">' + m.pct + '%</td>' +
            '<td class="n">' + money(m.amount) + '</td><td class="n">' + (m.customer ? money(m.customer) : '—') + '</td><td class="n">' + (m.bank ? money(m.bank) : '—') + '</td></tr>';
        }).join('') +
        '<tr><th colspan="4">Tổng</th><th class="n">' + money(P.full) + '</th><th class="n">' + money(r.loan.customerTotal) + '</th><th class="n">' + money(r.loan.amount) + '</th></tr>' +
      '</tbody></table>' +

      '<h2>Phương án vay ngân hàng</h2><div class="two"><table>' +
        '<tr><th>Số tiền vay</th><td class="n big">' + money(r.loan.amount) + '</td></tr>' +
        '<tr><th>Tỷ lệ vay</th><td class="n">' + L.ltv + '% giá gồm VAT</td></tr>' +
        '<tr><th>Thời hạn</th><td class="n">' + L.termYears + ' năm</td></tr>' +
        '<tr><th>Lãi suất</th><td class="n">' + tiers + ', thả nổi ~' + L.floatingRate + '%</td></tr>' +
        '<tr><th>Ân hạn gốc</th><td class="n">' + (L.graceEnabled ? L.graceMonths + ' tháng từ lần giải ngân ' + (L.principalStart === 'last' ? 'cuối' : 'đầu') : 'Không') + '</td></tr>' +
      '</table><table>' +
        '<tr><th>Trả/tháng khi trả gốc đủ</th><td class="n big">' + money(steady.payment) + '</td></tr>' +
        '<tr><th>Tiền trả cao nhất 1 tháng</th><td class="n">' + money(r.maxPayment) + '</td></tr>' +
        '<tr><th>Tổng lãi cả kỳ hạn</th><td class="n">' + money(S.totalInterest) + '</td></tr>' +
        '<tr><th>Tổng trả ngân hàng</th><td class="n">' + money(S.totalPaid) + '</td></tr>' +
      '</table></div>' +

      '<h2>Các giai đoạn trả nợ</h2><table><thead><tr><th>Giai đoạn</th><th>Thời gian</th><th class="n">Lãi suất</th><th class="n">Tiền trả/tháng</th></tr></thead><tbody>' +
        S.phases.map(function (ph) {
          var t = ph.type === 'interestOnly' ? (ph.fromMonth <= S.lastDisbMonth ? 'Chỉ trả lãi (đang giải ngân)' : 'Chỉ trả lãi (ân hạn gốc)') : 'Gốc + lãi (gốc giảm dần)';
          var amt = ph.minPayment === ph.maxPayment ? money(ph.firstPayment) : money(ph.firstPayment) + ' → ' + money(ph.lastPayment);
          return '<tr><td>' + t + '</td><td>Tháng ' + ph.fromMonth + '–' + ph.toMonth + ' (' + monthYear(ph.fromDate) + ' → ' + monthYear(ph.toDate) + ')</td><td class="n">' + ph.rate + '%</td><td class="n">' + amt + '</td></tr>';
        }).join('') +
      '</tbody></table>' +

      '<h2 class="page-break">Lịch trả nợ theo năm</h2><table><thead><tr><th>Năm vay</th><th class="n">TB/tháng</th><th class="n">Gốc trong năm</th><th class="n">Lãi trong năm</th><th class="n">Tổng trả trong năm</th><th class="n">Dư nợ cuối năm</th></tr></thead><tbody>' +
        S.years.map(function (y) {
          return '<tr><td>' + y.year + '</td><td class="n">' + money(y.avgPayment) + '</td><td class="n">' + money(y.principal) + '</td><td class="n">' + money(y.interest) + '</td><td class="n">' + money(y.payment) + '</td><td class="n">' + money(y.balance) + '</td></tr>';
        }).join('') +
      '</tbody></table>';

    if (po) {
      h += '<h2>Phương án tất toán sớm (sau ' + po.month + ' tháng)</h2><table>' +
        '<tr><th>Thời điểm</th><td class="n">' + dateVN(po.date) + ' (năm vay thứ ' + po.loanYear + ')</td></tr>' +
        '<tr><th>Dư nợ gốc còn lại</th><td class="n">' + money(po.balance) + '</td></tr>' +
        '<tr><th>Phí trả nợ trước hạn (' + po.feePct + '%)</th><td class="n">' + money(po.fee) + '</td></tr>' +
        '<tr><th>Cần chuẩn bị để tất toán</th><td class="n big">' + money(po.totalToPay) + '</td></tr>' +
        '<tr><th>Lãi tránh được (đã trừ phí)</th><td class="n">' + money(po.netSaving) + '</td></tr>' +
      '</table>';
    }

    h += '<div class="foot">' +
      '<p><b>Cách tính lãi:</b> lãi mỗi kỳ = dư nợ thực tế × lãi suất năm × số ngày thực tế ÷ 365. Ngân hàng giải ngân đợt nào thì khách chỉ trả lãi trên số đã giải ngân. Gốc trả giảm dần: gốc mỗi kỳ = dư nợ ÷ số kỳ còn lại.</p>' +
      '<p><b>Lưu ý:</b> Số liệu mang tính tham khảo. Lãi suất ưu đãi gói NOXH do Ngân hàng Nhà nước công bố định kỳ 6 tháng/lần; lãi suất thả nổi là giả định. Ngày giải ngân phụ thuộc tiến độ thực tế của dự án. Điều kiện vay và phí trả nợ trước hạn theo hợp đồng tín dụng của ngân hàng.</p>' +
      (ctx.consultant && ctx.consultant.name ? '<p><b>Tư vấn viên:</b> ' + esc(ctx.consultant.name) + (ctx.consultant.phone ? ' · ' + esc(ctx.consultant.phone) : '') + '</p>' : '') +
      '</div></div>';
    return h;
  }

  function fileName(ctx) {
    var d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
    var code = (ctx.unitCode || 'can-ho').replace(/[^\w-]+/g, '');
    return 'PTG_' + code + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.pdf';
  }

  function printFallback(html) {
    var css = Array.prototype.map.call(document.querySelectorAll('link[rel=stylesheet],style'), function (n) { return n.outerHTML; }).join('');
    var w = window.open('', '_blank');
    if (!w) throw new Error('Trình duyệt chặn cửa sổ in');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>PTG</title>' + css +
      '<style>@page{size:A4;margin:10mm}body{margin:0;background:#fff}.lm-print{width:auto;padding:0}</style></head><body>' + html + '</body></html>');
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 400);
  }

  async function exportPdf(result, ctx) {
    var html = buildHTML(result, ctx || {});
    var lib;
    try { lib = await loadLib(); } catch (e) { printFallback(html); return; }
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1';
    holder.innerHTML = html;
    document.body.appendChild(holder);
    try {
      await lib().set({
        margin: [8, 6, 10, 6],
        filename: fileName(ctx || {}),
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
      }).from(holder.firstChild).save();
    } finally { holder.remove(); }
  }

  root.LoanPDF = { exportPdf: exportPdf, buildHTML: buildHTML };
})(window);
