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

// Nhận sổ sau bàn giao 1,5 tháng: 15/11/2027 + 1 tháng + 15 ngày = 30/12/2027
const h = E.calcMilestones(E.calcPrice({ area: 50, pricePerM2: 20000000 }),
  E.DEFAULT_SCHEDULE.map((x) => x.role === 'title' ? Object.assign({}, x, { due: { type: 'afterHandoverMonths', value: 1.5 } }) : x),
  { contractDate: '2026-10-05', handoverDate: '2027-11-15' });
eq('Ngày nhận sổ (1,5 tháng)', h.rows[6].date, '2027-12-30');

// Tiến độ 10 đợt (VD của chủ dự án): Đ1 30% · Đ2–8 mỗi đợt 5% · Đ9 bàn giao 30% · Đ10 nhận sổ 5%
const S10 = [{ label: 'Ký HĐ', pct: 30, due: { type: 'offsetDays', value: 0 } }];
for (let i = 2; i <= 8; i++) S10.push({ label: 'Đợt ' + i, pct: 5, due: { type: 'offsetDays', value: (i - 1) * 60 } });
S10.push({ label: 'Bàn giao', pct: 30, due: { type: 'handover' }, role: 'handover' });
S10.push({ label: 'Nhận sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 1.5 }, role: 'title' });
const p10 = E.calcPrice({ area: 50, pricePerM2: 20000000 }); // thuần 1 tỷ, VAT 50tr, KPBT 20tr
const m10 = E.calcMilestones(p10, S10, { contractDate: '2026-10-05', handoverDate: '2027-11-15' });
eq('10 đợt: không cảnh báo', m10.warnings.length, 0);
eq('10 đợt: Đ1 = 30% × giá gồm VAT', m10.rows[0].amount, 315000000);
eq('10 đợt: Đ1 VAT = 30% VAT', m10.rows[0].vat, 15000000);
eq('10 đợt: Đ5 VAT = 5% VAT', m10.rows[4].vat, 2500000);
eq('10 đợt: Đ9 VAT = 35% VAT', m10.rows[8].vat, 17500000);
eq('10 đợt: Đ9 KPBT', m10.rows[8].kpbt, 20000000);
eq('10 đợt: Đ9 = 30% thuần + 35% VAT + KPBT', m10.rows[8].amount, 300000000 + 17500000 + 20000000);
eq('10 đợt: Đ10 = 5% thuần, không VAT', m10.rows[9].amount, 50000000);
eq('10 đợt: Đ10 VAT', m10.rows[9].vat, 0);
eq('10 đợt: tổng = giá FULL', m10.rows.reduce((s, r) => s + r.amount, 0), p10.full);
eq('10 đợt: % VAT từng đợt', E.vatPercents(S10).join(','), '30,5,5,5,5,5,5,5,35,0');
eq('10 đợt: hợp lệ', E.validateSchedule(S10).length, 0);
// Bàn giao KHÔNG phải đợt kế cuối: VAT dư vào đợt kế cuối, KPBT vẫn ở đợt bàn giao
const S4 = [{ label: 'A', pct: 50, due: { type: 'offsetDays', value: 0 } }, { label: 'BG', pct: 30, due: { type: 'handover' }, role: 'handover' },
            { label: 'C', pct: 15, due: { type: 'afterHandoverMonths', value: 3 } }, { label: 'Sổ', pct: 5, due: { type: 'afterHandoverMonths', value: 6 }, role: 'title' }];
const m4 = E.calcMilestones(p10, S4, { contractDate: '2026-10-05', handoverDate: '2027-11-15' });
eq('BG giữa: % VAT', E.vatPercents(S4).join(','), '50,30,20,0');
eq('BG giữa: KPBT ở đợt bàn giao', m4.rows[1].kpbt, 20000000);
eq('BG giữa: tổng = giá FULL', m4.rows.reduce((s, r) => s + r.amount, 0), p10.full);
eq('Kiểm tra: thiếu bàn giao + sổ không cuối', E.validateSchedule([S4[3], S4[0]]).length, 3);

console.log(fail ? `\n${fail} lỗi` : '\nTất cả khớp ✅');
process.exit(fail ? 1 : 0);
