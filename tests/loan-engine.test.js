// Chạy: node tests/loan-engine.test.js — so sánh với phiếu CĐT căn R30413 (The Rise 3)
const E = require('../js/loan/loan-engine.js');
let fail = 0;
function eq(name, got, exp) {
  const ok = got === exp;
  if (!ok) fail++;
  console.log((ok ? '✔' : '✘') + ' ' + name + ': ' + got + (ok ? '' : '  (mong đợi ' + exp + ')'));
}

const r = E.compute({
  unit: { area: 53.6, pricePerM2: 19911530, netPriceOverride: 1067258010 },
  dates: { contractDate: '2026-10-05', handoverDate: '2027-11-15' },
  loan: { ltv: 70 }
});
const p = r.price;
eq('Giá thuần', p.net, 1067258010);
eq('VAT', p.vat, 53362901);
eq('KPBT', p.kpbt, 21345160);
eq('Giá gồm VAT', p.gross, 1120620911);
eq('Giá FULL', p.full, 1141966071);
eq('Giá m2', p.pricePerM2, 19911530);
const exp = [336186273, 112062091, 112062091, 112062091, 112062091, 304168533, 53362901];
r.milestones.forEach((m, i) => eq('Đợt ' + (i + 1), m.amount, exp[i]));
eq('Tổng VAT các đợt', r.milestones.reduce((s, m) => s + m.vat, 0), 53362901);
eq('VAT đợt 7', r.milestones[6].vat, 0);
eq('Khoản vay', r.loan.amount, 784434638);
eq('Khách tự trả (đợt 1 + KPBT)', r.loan.customerTotal, 336186273 + 21345160);
eq('Đợt 6 ngân hàng', r.milestones[5].bank, 282823373);
eq('Tổng gốc trả = khoản vay', r.schedule.totalPrincipal, 784434638);
eq('Dư nợ cuối', r.schedule.rows.at(-1).balance, 0);

// Lãi tháng đầu: 112.062.091 × 6,5% × số ngày / 365
const d1 = r.schedule.rows[0];
console.log('Tháng 1:', d1.date, 'lãi', d1.interest, 'gốc', d1.principal, 'trả', d1.payment);
console.log('Kỳ đầu trả gốc:', r.firstAmortRow.k, r.firstAmortRow.payment);
console.log('Phases:', r.schedule.phases.length, 'Tổng lãi:', r.schedule.totalInterest);
console.log('Tất toán:', r.payoff);

// Ân hạn 24 tháng từ lần giải ngân cuối
const g = E.compute({
  unit: { area: 53.6, netPriceOverride: 1067258010 },
  dates: { contractDate: '2026-10-05', handoverDate: '2027-11-15' },
  loan: { graceEnabled: true, graceMonths: 24, principalStart: 'last' }
});
eq('Gốc ân hạn: tổng gốc', g.schedule.totalPrincipal, 784434638);
console.log('Ân hạn → bắt đầu trả gốc tháng', g.schedule.principalStartMonth);

// Nhập theo đơn giá m2 (không override)
const m = E.calcPrice({ area: 53.6, pricePerM2: 19911530 });
console.log('Theo đơn giá m2 → giá thuần', m.net, '(lệch', m.net - 1067258010, 'đ so với CĐT)');

console.log(fail ? `\n${fail} lỗi` : '\nTất cả khớp ✅');
process.exit(fail ? 1 : 0);
