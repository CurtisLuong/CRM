/*!
 * loan-engine.js — Bộ não tính toán: phiếu giá, tiến độ thanh toán, khoản vay NOXH.
 * Không phụ thuộc giao diện, chạy được trên trình duyệt và Node (để test).
 * Tất cả số tiền tính bằng đồng (VND), làm tròn tới đồng.
 */
(function (root) {
  'use strict';

  var DAY = 86400000;

  // ---------- Ngày tháng (dùng UTC để tránh lệch múi giờ) ----------
  function parseDate(s) {
    if (typeof s === 'number') return s;
    var p = String(s).split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function toISO(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(t, n) { return t + n * DAY; }
  function addMonths(t, n) {
    var d = new Date(t);
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(day, last));
  }
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }
  function round(x) { return Math.round(x); }

  // ---------- Mặc định ----------
  // Tiến độ thanh toán mẫu CĐT Happy Home Tràng Cát.
  // role: 'handover' = đợt bàn giao, nhận phần còn lại + KPBT (gánh luôn VAT của đợt nhận sổ)
  //       'title'    = đợt nhận sổ, tính trên giá thuần (không VAT)
  var DEFAULT_SCHEDULE = [
    { label: 'Ký Hợp đồng mua bán (T)', pct: 30, due: { type: 'offsetDays', value: 0 } },
    { label: 'T+60', pct: 10, due: { type: 'offsetDays', value: 60 } },
    { label: 'T+120', pct: 10, due: { type: 'offsetDays', value: 120 } },
    { label: 'T+180', pct: 10, due: { type: 'offsetDays', value: 180 } },
    { label: 'T+240', pct: 10, due: { type: 'offsetDays', value: 240 } },
    { label: 'Thông báo bàn giao + KPBT', pct: 25, due: { type: 'handover' }, role: 'handover' },
    { label: 'Nhận sổ (bìa)', pct: 5, due: { type: 'afterHandoverMonths', value: 12 }, role: 'title' }
  ];

  // Preset gói vay. Lãi suất NQ33 / người trẻ do NHNN công bố lại 6 tháng/lần → chỉ là giả định.
  // Chỉ giữ 3 gói khác biệt thật + "Khác" (custom). Danh sách & tên hiển thị QUYẾT ĐỊNH Ở ĐÂY;
  // bảng bank_presets trên Supabase chỉ cập nhật số liệu (lãi suất, phí...) cho đúng key.
  var BANK_PRESETS = [
    { key: 'young35', name: 'Dưới 35 tuổi', ltv: 70, termYears: 25,
      rateTiers: [{ months: 60, rate: 6.5 }, { months: 120, rate: 7.5 }], floatingRate: 10,
      maxGraceMonths: 24, prepayFees: [3, 3, 2, 1, 1] },
    { key: 'nq33', name: 'NQ33', ltv: 70, termYears: 25,
      rateTiers: [{ months: 60, rate: 6.5 }], floatingRate: 10,
      maxGraceMonths: 24, prepayFees: [3, 3, 2, 1, 1] },
    { key: 'vbsp', name: 'NHCSXH', ltv: 80, termYears: 25,
      rateTiers: [{ months: 300, rate: 5.4 }], floatingRate: 5.4,
      maxGraceMonths: 12, prepayFees: [0] },
    { key: 'custom', name: 'Khác', ltv: 70, termYears: 25,
      rateTiers: [{ months: 60, rate: 6.5 }], floatingRate: 10,
      maxGraceMonths: 60, prepayFees: [3, 3, 2, 1, 1] }
  ];

  var DEFAULT_LOAN = {
    presetKey: 'nq33',
    ltv: 70,
    loanOverride: null,          // số tiền vay nhập tay (null = tự tính)
    termYears: 25,
    rateTiers: [{ months: 60, rate: 6.5 }],
    floatingRate: 10,
    principalStart: 'first',     // 'first' | 'last' — mốc bắt đầu trả gốc / ân hạn
    graceEnabled: false,
    graceMonths: 12,
    dayCount: 'actual365',       // 'actual365' (ngân hàng VN) | 'monthly' (lãi năm / 12)
    firstBankMilestone: 1,       // ngân hàng giải ngân từ đợt 2 (index 1)
    prepayFees: [3, 3, 2, 1, 1], // % phí tất toán theo năm vay thứ 1, 2, 3...; hết mảng = 0%
    payoffMonth: 60              // tất toán sau bao nhiêu tháng
  };

  // ---------- 1. Phiếu giá ----------
  function calcPrice(p) {
    var area = +p.area || 0;
    var vatRate = p.vatRate == null ? 5 : +p.vatRate;
    var kpbtRate = p.kpbtRate == null ? 2 : +p.kpbtRate;
    var net = p.netPriceOverride ? round(+p.netPriceOverride) : round(area * (+p.pricePerM2 || 0));
    var vat = round(net * vatRate / 100);
    var kpbt = round(net * kpbtRate / 100);
    var gross = net + vat;
    return {
      area: area, vatRate: vatRate, kpbtRate: kpbtRate,
      pricePerM2: area ? round(net / area) : 0,
      net: net, vat: vat, kpbt: kpbt, gross: gross, full: gross + kpbt
    };
  }

  // ---------- 2. Tiến độ thanh toán CĐT ----------
  function dueDate(m, dates) {
    var T = parseDate(dates.contractDate);
    var H = parseDate(dates.handoverDate);
    var d = m.due || {};
    if (d.type === 'handover') return H;
    if (d.type === 'afterHandoverMonths') {
      // Hỗ trợ số tháng lẻ (VD 1,5 tháng = 1 tháng + 15 ngày; phần lẻ quy đổi 30 ngày/tháng)
      var v = +d.value || 0, whole = Math.floor(v);
      return addDays(addMonths(H, whole), Math.round((v - whole) * 30));
    }
    if (d.type === 'date') return parseDate(d.value);
    return addDays(T, +d.value || 0);
  }

  // Quy tắc chia tiền từng đợt (áp cho MỌI tiến độ, không riêng 7 đợt):
  //  - Đợt thường: X% giá trị căn hộ (giá thuần) + X% tổng VAT.
  //  - Đợt nhận sổ (role 'title', là đợt cuối): chỉ X% giá thuần, KHÔNG VAT.
  //  - VAT phải thu đủ TRƯỚC đợt nhận sổ: phần VAT của đợt nhận sổ (+ phần lẻ làm tròn) dồn vào
  //    đợt KẾ CUỐI (đợt ngay trước đợt nhận sổ — thường chính là đợt bàn giao).
  //  - Kinh phí bảo trì (KPBT) thu ở đợt bàn giao (role 'handover').
  //  VD 10 đợt: Đ1 30% (+30% VAT) · Đ2–8 mỗi đợt 5% (+5% VAT) · Đ9 bàn giao 30% (+35% VAT) + KPBT
  //  · Đ10 nhận sổ 5% (không VAT).
  function calcMilestones(price, schedule, dates) {
    schedule = schedule && schedule.length ? schedule : DEFAULT_SCHEDULE;
    var warnings = [];
    var pctSum = schedule.reduce(function (s, m) { return s + (+m.pct || 0); }, 0);
    if (Math.abs(pctSum - 100) > 0.001) warnings.push('Tổng tỷ lệ các đợt = ' + pctSum + '% (khác 100%)');

    var rows = schedule.map(function (m, i) {
      return { index: i, label: m.label, pct: +m.pct || 0, role: m.role || null,
               date: toISO(dueDate(m, dates)), amount: 0, vat: 0, kpbt: 0 };
    });
    // Đợt "gánh" phần VAT còn lại: đợt ngay trước đợt nhận sổ đầu tiên; không có đợt nhận sổ
    // → đợt bàn giao; không có cả hai → đợt cuối.
    var firstTitle = -1;
    rows.forEach(function (r, i) { if (firstTitle < 0 && r.role === 'title') firstTitle = i; });
    var hIdx = -1;
    rows.forEach(function (r, i) { if (hIdx < 0 && r.role === 'handover') hIdx = i; });
    var absorb = firstTitle > 0 ? firstTitle - 1 : (hIdx >= 0 ? hIdx : rows.length - 1);
    if (firstTitle === 0) warnings.push('Đợt nhận sổ không thể là đợt đầu tiên');
    rows.slice(firstTitle + 1).forEach(function (r) {
      if (firstTitle >= 0 && r.role !== 'title') warnings.push('Có đợt sau đợt nhận sổ ("' + r.label + '") — VAT vẫn dồn vào đợt trước nhận sổ');
    });

    rows.forEach(function (r, i) {
      if (i === absorb) return;
      if (r.role === 'title') { r.amount = round(price.net * r.pct / 100); r.vat = 0; }
      else { r.amount = round(price.gross * r.pct / 100); r.vat = round(price.vat * r.pct / 100); }
    });
    // KPBT: đợt bàn giao; không có đợt bàn giao → đợt gánh VAT (để tổng vẫn = giá FULL)
    var kIdx = hIdx >= 0 ? hIdx : absorb;
    if (hIdx < 0) warnings.push('Không có đợt bàn giao — KPBT tính vào đợt ' + (absorb + 1));
    rows[kIdx].kpbt = price.kpbt;
    if (kIdx !== absorb) rows[kIdx].amount += price.kpbt;
    // Đợt gánh = phần còn lại để tổng các đợt đúng bằng giá FULL (gồm VAT dư + làm tròn)
    var A = rows[absorb];
    A.amount = price.full - rows.reduce(function (s, r, i) { return i === absorb ? s : s + r.amount; }, 0);
    A.vat = price.vat - rows.reduce(function (s, r, i) { return i === absorb ? s : s + r.vat; }, 0);
    return { rows: rows, warnings: warnings, absorbIndex: absorb };
  }

  // Kiểm tra 1 tiến độ (dùng ở màn cấu hình): trả về danh sách lỗi/cảnh báo, rỗng = hợp lệ
  function validateSchedule(schedule) {
    var out = [];
    if (!schedule || !schedule.length) return ['Chưa có đợt nào'];
    var sum = schedule.reduce(function (s, m) { return s + (+m.pct || 0); }, 0);
    if (Math.abs(sum - 100) > 0.001) out.push('Tổng tỷ lệ = ' + (Math.round(sum * 100) / 100) + '% (phải đúng 100%)');
    var nH = schedule.filter(function (m) { return m.role === 'handover'; }).length;
    var nT = schedule.filter(function (m) { return m.role === 'title'; }).length;
    if (nH !== 1) out.push(nH ? 'Chỉ được 1 đợt bàn giao' : 'Cần 1 đợt "Bàn giao" (thu KPBT)');
    if (nT > 1) out.push('Chỉ được 1 đợt nhận sổ');
    if (nT === 1 && schedule[schedule.length - 1].role !== 'title') out.push('Đợt nhận sổ phải là đợt cuối');
    if (nT === 1 && schedule.length < 2) out.push('Cần ít nhất 1 đợt trước đợt nhận sổ');
    schedule.forEach(function (m, i) { if (!(+m.pct > 0)) out.push('Đợt ' + (i + 1) + ': tỷ lệ phải > 0'); });
    return out;
  }

  // % VAT của từng đợt theo quy tắc trên (để hiển thị khi cấu hình tiến độ)
  function vatPercents(schedule) {
    var ms = calcMilestones({ net: 1e12, vat: 1e12, gross: 2e12, kpbt: 0, full: 2e12 }, schedule,
      { contractDate: '2026-01-01', handoverDate: '2027-01-01' });
    return ms.rows.map(function (r) { return Math.round(r.vat / 1e12 * 10000) / 100; });
  }

  // ---------- 3. Phân bổ khách trả / ngân hàng giải ngân ----------
  function allocateLoan(price, ms, loan) {
    var first = loan.firstBankMilestone == null ? 1 : +loan.firstBankMilestone;
    var eligibleSum = 0;
    ms.rows.forEach(function (r) { if (r.index >= first) eligibleSum += r.amount - r.kpbt; });
    var maxByLtv = round(price.gross * (+loan.ltv || 0) / 100);
    var amount = loan.loanOverride ? round(+loan.loanOverride) : maxByLtv;
    var notes = [];
    if (amount > eligibleSum) {
      notes.push('Khoản vay vượt phần ngân hàng được giải ngân (từ đợt ' + (first + 1) + '), đã giới hạn còn ' + eligibleSum.toLocaleString('vi-VN') + 'đ');
      amount = eligibleSum;
    }
    // Khách trả phần vốn tự có trước, ngân hàng giải ngân phần sau
    var ownInEligible = eligibleSum - amount;
    var rows = ms.rows.map(function (r) {
      var o = Object.assign({}, r, { bank: 0, customer: r.amount });
      if (r.index >= first) {
        var base = r.amount - r.kpbt;
        var own = Math.min(base, ownInEligible);
        ownInEligible -= own;
        o.bank = base - own;
        o.customer = r.amount - o.bank;
      }
      return o;
    });
    var customerTotal = rows.reduce(function (s, r) { return s + r.customer; }, 0);
    return {
      rows: rows, loanAmount: amount, maxByLtv: maxByLtv, eligibleSum: eligibleSum,
      customerTotal: customerTotal, notes: notes,
      disbursements: rows.filter(function (r) { return r.bank > 0; })
                         .map(function (r) { return { date: r.date, amount: r.bank, label: r.label }; })
    };
  }

  // ---------- 4. Mô phỏng trả nợ từng tháng ----------
  function rateForMonth(k, tiers, floating) {
    var acc = 0;
    for (var i = 0; i < tiers.length; i++) {
      acc += +tiers[i].months || 0;
      if (k <= acc) return +tiers[i].rate;
    }
    return +floating;
  }

  function simulate(disbursements, loan) {
    if (!disbursements.length) return null;
    var N = Math.max(1, round((+loan.termYears || 25) * 12));
    var disb = disbursements.map(function (d) { return { t: parseDate(d.date), amount: d.amount, label: d.label }; })
                            .sort(function (a, b) { return a.t - b.t; });
    var start = disb[0].t;
    var lastDisb = disb[disb.length - 1].t;
    var anchor = loan.principalStart === 'last' ? lastDisb : start;
    var anchorMonths = 0;
    while (addMonths(start, anchorMonths + 1) <= anchor) anchorMonths++;
    var p0 = anchorMonths + 1 + (loan.graceEnabled ? (+loan.graceMonths || 0) : 0);

    var rows = [], balance = 0, di = 0;
    var totalInterest = 0, totalPrincipal = 0;
    for (var k = 1; k <= N; k++) {
      var ps = addMonths(start, k - 1), pe = addMonths(start, k);
      var rate = rateForMonth(k, loan.rateTiers || [], loan.floatingRate);
      var periodDays = daysBetween(ps, pe);
      var interest = 0, disbursed = 0, cursor = ps;
      // giải ngân trong kỳ → dư nợ tăng từ ngày giải ngân
      while (di < disb.length && disb[di].t < pe) {
        var dt = Math.max(disb[di].t, ps);
        interest += segInterest(balance, rate, daysBetween(cursor, dt), periodDays, loan.dayCount);
        cursor = dt;
        balance += disb[di].amount; disbursed += disb[di].amount; di++;
      }
      interest += segInterest(balance, rate, daysBetween(cursor, pe), periodDays, loan.dayCount);
      interest = round(interest);
      var principal = 0;
      if (k >= p0) principal = k === N ? balance : round(balance / (N - k + 1));
      if (k === N && di < disb.length) principal = balance; // an toàn
      balance -= principal;
      totalInterest += interest; totalPrincipal += principal;
      rows.push({ k: k, date: toISO(pe), rate: rate, disbursed: disbursed,
                  interest: interest, principal: principal, payment: interest + principal, balance: balance });
    }
    return {
      rows: rows, months: N, startDate: toISO(start), lastDisbDate: toISO(lastDisb),
      principalStartMonth: p0, totalInterest: totalInterest, totalPrincipal: totalPrincipal,
      totalPaid: totalInterest + totalPrincipal,
      lastDisbMonth: rows.filter(function (r) { return r.disbursed > 0; }).slice(-1)[0].k,
      phases: buildPhases(rows), years: buildYears(rows)
    };
  }

  function segInterest(balance, rate, days, periodDays, dayCount) {
    if (days <= 0 || balance <= 0) return 0;
    if (dayCount === 'monthly') return balance * rate / 100 / 12 * days / periodDays;
    return balance * rate / 100 * days / 365;
  }

  function buildPhases(rows) {
    var phases = [], cur = null;
    rows.forEach(function (r) {
      var type = r.principal > 0 ? 'amortize' : 'interestOnly';
      var key = type + '|' + r.rate;
      if (!cur || cur.key !== key) {
        cur = { key: key, type: type, rate: r.rate, fromMonth: r.k, toMonth: r.k,
                fromDate: r.date, toDate: r.date, firstPayment: r.payment, lastPayment: r.payment,
                minPayment: r.payment, maxPayment: r.payment };
        phases.push(cur);
      }
      cur.toMonth = r.k; cur.toDate = r.date; cur.lastPayment = r.payment;
      cur.minPayment = Math.min(cur.minPayment, r.payment);
      cur.maxPayment = Math.max(cur.maxPayment, r.payment);
    });
    phases.forEach(function (p) { delete p.key; });
    return phases;
  }

  function buildYears(rows) {
    var years = [];
    rows.forEach(function (r) {
      var y = Math.ceil(r.k / 12);
      var o = years[y - 1] || (years[y - 1] = { year: y, interest: 0, principal: 0, payment: 0, balance: 0, avgPayment: 0, months: 0 });
      o.interest += r.interest; o.principal += r.principal; o.payment += r.payment;
      o.balance = r.balance; o.months++;
    });
    years.forEach(function (y) { y.avgPayment = round(y.payment / y.months); });
    return years;
  }

  // ---------- 5. Tất toán sớm ----------
  function feePctForMonth(k, fees) {
    var yearIdx = Math.floor(k / 12); // đã vay đủ 12 tháng → sang năm thứ 2
    return yearIdx < fees.length ? +fees[yearIdx] : 0;
  }

  function payoff(sim, month, fees) {
    if (!sim) return null;
    var k = Math.max(1, Math.min(round(month), sim.months - 1));
    var warn = null;
    if (k < sim.lastDisbMonth) {
      warn = 'Ngân hàng chưa giải ngân hết ở tháng ' + k + '; đã tính tại tháng ' + sim.lastDisbMonth;
      k = sim.lastDisbMonth;
    }
    var r = sim.rows[k - 1];
    var feePct = feePctForMonth(k, fees || []);
    var fee = round(r.balance * feePct / 100);
    var interestPaid = sim.rows.slice(0, k).reduce(function (s, x) { return s + x.interest; }, 0);
    var interestRemaining = sim.totalInterest - interestPaid;
    return {
      month: k, date: r.date, loanYear: Math.floor(k / 12) + 1, balance: r.balance,
      feePct: feePct, fee: fee, totalToPay: r.balance + fee,
      interestPaid: interestPaid, interestSaved: interestRemaining, netSaving: interestRemaining - fee,
      warning: warn
    };
  }

  // ---------- Tổng hợp ----------
  function compute(input) {
    var loan = Object.assign({}, DEFAULT_LOAN, input.loan || {});
    var price = calcPrice(input.unit || {});
    var ms = calcMilestones(price, input.schedule, input.dates);
    var alloc = allocateLoan(price, ms, loan);
    var sim = simulate(alloc.disbursements, loan);
    var po = sim ? payoff(sim, loan.payoffMonth, loan.prepayFees) : null;
    var firstAmort = sim ? sim.rows[sim.principalStartMonth - 1] : null;
    return {
      price: price, milestones: alloc.rows, warnings: ms.warnings.concat(alloc.notes),
      loan: { amount: alloc.loanAmount, maxByLtv: alloc.maxByLtv, customerTotal: alloc.customerTotal,
              disbursements: alloc.disbursements, params: loan },
      schedule: sim, firstAmortRow: firstAmort || null,
      maxPayment: sim ? Math.max.apply(null, sim.rows.map(function (r) { return r.payment; })) : 0,
      payoff: po
    };
  }

  var api = {
    DEFAULT_SCHEDULE: DEFAULT_SCHEDULE, BANK_PRESETS: BANK_PRESETS, DEFAULT_LOAN: DEFAULT_LOAN,
    calcPrice: calcPrice, calcMilestones: calcMilestones, allocateLoan: allocateLoan,
    validateSchedule: validateSchedule, vatPercents: vatPercents,
    simulate: simulate, payoff: payoff, compute: compute,
    util: { parseDate: parseDate, toISO: toISO, addMonths: addMonths, addDays: addDays }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoanEngine = api;
})(typeof window !== 'undefined' ? window : this);
