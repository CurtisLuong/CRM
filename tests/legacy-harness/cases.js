// Các ca golden: mỗi ca chạy code v1 thật trên fixture tổng hợp và trả về 1 object JSON.
// run.js ghi object đó vào tests/golden/<name>.json. v2 port phải cho ra cùng kết quả.
// Mỗi ca nhận một context v1 MỚI (không dùng chung trạng thái giữa các ca).
'use strict';
const assert = require('node:assert/strict');

const MIN = 60000, H = 3600000, DAY = 86400000;
const clone = (v) => JSON.parse(JSON.stringify(v));
const strip = (o) => { const { _case, ...rest } = o; return rest; };
// Chữ thuần từ HTML (bỏ thẻ, gộp khoảng trắng, giải mã vài entity thường gặp).
const text = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const grab = (html, cls) => [...String(html).matchAll(new RegExp(`<[^>]*class="${cls}"[^>]*>([\\s\\S]*?)</(?:div|span)>`, 'g'))].map((m) => text(m[1]));
const tryRun = (fn) => { try { return fn(); } catch (e) { return { $error: e.message }; } };

// Nạp khách như app v1 (refreshList): bậc cũ 'Hỗ trợ hồ sơ'/'Booking' đổi sang bậc mới chỉ trong bộ nhớ.
function setupCustomers(h, fx, { normalize = true } = {}) {
  h.ctx.__in = clone(fx.customers.map(strip));
  h.ctx.__me = fx.users.me;
  h.run(`currentUser = { id: __me, email: 'sale@example.test' };
    allCustomers = __in;
    ${normalize ? 'for (const c of allCustomers) if (CARE_STAGE_LEGACY[c.care_stage]) c.care_stage = normStage(c.care_stage);' : ''}
    delete globalThis.__in;`);
  return h.run('allCustomers');
}
const byId = (list) => Object.fromEntries(list.map((c) => [c.id, c]));
const label = (fx) => Object.fromEntries(fx.customers.map((c) => [c.id, c._case]));

const cases = [];
const add = (name, desc, build) => cases.push({ name, desc, build });

// ─── 1. Hạn / đến hạn / quá hạn (D-010) ──────────────────────────────────────
add('deadlines', 'countdownTag / taskDueInfo / callReminder (D-010) ở 2 thời điểm', (h, fx) => {
  const out = { clocks: {} };
  for (const nowIso of [fx.now, '2026-12-01T23:50:00+07:00']) {
    h.setNow(nowIso);
    const now = h.now();
    const offsets = [-2 * DAY, -DAY, -61 * MIN, -31 * MIN, -30 * MIN, -MIN, 0, MIN, 59 * MIN, 23 * H, 25 * H, 3 * DAY];
    const matrix = [];
    for (const off of offsets) for (const endPlus of [0, 60 * MIN]) for (const allDay of [false, true]) {
      if (allDay && endPlus) continue;
      matrix.push({ startOffsetMin: off / MIN, endPlusMin: endPlus / MIN, allDay, tag: h.ctx.countdownTag(now + off, now + off + endPlus, allDay) });
    }
    matrix.push({ case: 'NaN start', tag: h.ctx.countdownTag(NaN, NaN, false) });
    const customers = setupCustomers(h, fx);
    const perCustomer = {};
    for (const c of customers) {
      const tasks = (Array.isArray(c.next_tasks) ? c.next_tasks : []).map((t) => ({ text: t.text, info: h.ctx.taskDueInfo(t) }));
      perCustomer[c.id] = { callReminder: h.ctx.callReminder(c), openTasks: h.ctx.openTasksOf(c).length, tasks };
    }
    out.clocks[nowIso] = { matrix, perCustomer, invalid: {
      taskDueInfoInvalid: h.ctx.taskDueInfo({ due: 'invalid' }), taskDueInfoEmpty: h.ctx.taskDueInfo({}),
      callReminderInvalid: h.ctx.callReminder({ next_call_at: 'invalid' }),
    } };
  }
  return out;
});

// ─── 2. Nhịp follow-up + mẫu Zalo (D-005) ────────────────────────────────────
add('followup', 'FOLLOWUP.firstCall / afterCall / forStage / suggestTemplates trên fixture + chuỗi cuộc gọi tổng hợp', (h, fx) => {
  const customers = setupCustomers(h, fx);
  const F = h.ctx.FOLLOWUP;
  const stages = h.run('CARE_STAGE_OPTIONS');
  const perCustomer = {};
  for (const c of customers) {
    const attempts = h.ctx.callAttemptsOf(c);
    perCustomer[c.id] = {
      firstCall: !c.qualified_at && !attempts.length ? F.firstCall(c) : undefined,
      afterCall: F.afterCall(c, attempts),
      forStage: Object.fromEntries(stages.map((s) => [s, F.forStage(c, s)])),
      suggestTemplates: F.suggestTemplates(c),
    };
  }
  // Chuỗi tổng hợp: khách mới / khách tiềm năng sau n cuộc hỏng, các kết quả đặc biệt.
  const seq = {};
  const base = Date.parse('2026-11-25T02:00:00.000Z');
  const results = ['no_answer', 'line_busy', 'hung_up', 'unreachable', 'no_answer', 'no_answer', 'no_answer'];
  for (const kind of ['lead', 'qualified']) {
    for (let n = 1; n <= results.length; n++) {
      const attempts = results.slice(0, n).map((r, i) => ({ at: new Date(base + i * 26 * H).toISOString(), result: r, note: null }));
      const c = { id: `seq-${kind}-${n}`, owner_id: fx.users.me, full_name: 'Chuỗi', phone: '0900009999',
        registered_at: '2026-11-25T01:00:00.000Z', care_stage: kind === 'lead' ? 'Đang tiếp cận' : 'Đang chăm sóc',
        qualified_at: kind === 'lead' ? null : '2026-11-20T03:00:00.000Z', call_attempts: attempts };
      seq[`${kind}-${n}-misses`] = { afterCall: F.afterCall(c, attempts), suggestTemplates: F.suggestTemplates(c) };
    }
    for (const r of ['busy', 'wrong_number', 'talked', 'hung_up', null]) {
      const attempts = [{ at: '2026-12-01T02:00:00.000Z', result: r, note: null }];
      const c = { id: `one-${kind}-${r}`, owner_id: fx.users.me, full_name: 'Một cuộc', phone: '0900009998',
        registered_at: '2026-12-01T01:00:00.000Z', care_stage: kind === 'lead' ? 'Đang tiếp cận' : 'Xem dự án',
        qualified_at: kind === 'lead' ? null : '2026-11-20T03:00:00.000Z', call_attempts: attempts };
      seq[`${kind}-one-${r}`] = F.afterCall(c, attempts);
    }
  }
  return { cases: label(fx), callSlots: F.callSlots(), perCustomer, sequences: seq,
    slotOfTime: Object.fromEntries([0, 6, 7, 8, 9, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22, 23]
      .map((hh) => [hh, F.slotOfTime(Date.parse(`2026-12-01T${String(hh).padStart(2, '0')}:30:00+07:00`))])) };
});

// ─── 3. Tốc độ phễu / SLA (D-008) — dữ liệu THÔ (chưa đổi bậc cũ) ────────────
add('velocity', 'VELOCITY.phaseOf / status / autoAction / bookingSteps / stageEnteredAt trên dữ liệu thô', (h, fx) => {
  const V = h.ctx.VELOCITY;
  const now = h.now();
  const perCustomer = {};
  for (const raw of fx.customers) {
    const c = strip(clone(raw));
    perCustomer[c.id] = {
      normStage: V.normStage(c.care_stage), phaseOf: V.phaseOf(c), status: V.status(c, now),
      autoAction: V.autoAction(c, now), stageEnteredAt: V.stageEnteredAt(c), bookingSteps: V.bookingSteps(c, now),
    };
  }
  const day = '2026-12-01';
  const newLeadStart = Object.fromEntries(Array.from({ length: 24 }, (_, hh) => {
    const t = Date.parse(`${day}T${String(hh).padStart(2, '0')}:15:00+07:00`);
    return [hh, new Date(V.newLeadStart(t)).toISOString()];
  }));
  const fmt = Object.fromEntries([0, 30 * 1000, 29 * MIN, 61 * MIN, 5 * H, 23 * H, 2 * DAY, 59 * DAY, 60 * DAY, 75 * DAY, 400 * DAY].map((d) => [d, V.fmt(d)]));
  return { cases: label(fx), config: V.config, perCustomer, newLeadStart, fmt };
});

// ─── 4. Tự chuyển theo SLA (runSlaAutomation) ────────────────────────────────
add('sla-automation', 'runSlaAutomation: payload gửi CRM.update, chỉ khách mình phụ trách, chạy lại lần 2 không làm gì', (h, fx) => {
  setupCustomers(h, fx);
  h.run(`globalThis.__calls = []; globalThis.__toasts = [];
    CRM.update = async (id, payload, opts) => { __calls.push({ id, payload, opts: opts || null });
      const c = allCustomers.find((x) => x.id === id); if (c) Object.assign(c, payload); return c; };
    showToast = (msg) => { __toasts.push(String(msg)); };`);
  return h.run('runSlaAutomation()').then(async (changed) => {
    const first = { changed, calls: clone(h.run('__calls')), toasts: clone(h.run('__toasts')) };
    h.run('__calls.length = 0; __toasts.length = 0;');
    const changed2 = await h.run('runSlaAutomation()');
    return { first, secondRun: { changed: changed2, calls: clone(h.run('__calls')) } };
  });
});

// ─── 5. Việc cần làm / tín hiệu / chỉ số Tổng quan & Phân tích ───────────────
add('dashboard', 'dashActionGroups + NOTIF.compute + chỉ số relationshipHealthHtml/analyticsInsightsHtml (khách mình phụ trách)', (h, fx) => {
  setupCustomers(h, fx);
  const owned = h.run('ownedCustomers()');
  const groups = h.ctx.dashActionGroups(owned).map((g) => ({
    key: g.key, title: g.title, tone: g.tone, contact: !!g.contact,
    items: g.items.map((it) => ({ id: it.c.id, sub: it.sub, deadlineState: it.deadlineState, tone: it.tone })),
  }));
  const notifications = h.ctx.NOTIF.compute(owned, h.now()).map((n) => ({ ...n }));
  const healthHtml = h.ctx.relationshipHealthHtml(owned);
  const insightsHtml = h.ctx.analyticsInsightsHtml(owned);
  return {
    ownedIds: owned.map((c) => c.id),
    groups, notifications,
    relationshipHealth: { values: grab(healthHtml, 'health-value'), labels: grab(healthHtml, 'health-label'), sources: grab(healthHtml, 'health-source') },
    analyticsInsights: { titles: grab(insightsHtml, 'ins-title'), why: grab(insightsHtml, 'ins-why'), pending: grab(insightsHtml, 'ins-pending') },
  };
});

// ─── 6. Tìm kiếm khách (CRMSearch + searchFields của app.js) ─────────────────
add('search', 'CRMSearch.compile/match trên tài liệu tìm kiếm của từng khách (customerSearchDoc)', (h, fx) => {
  const customers = setupCustomers(h, fx);
  const S = h.ctx.CRMSearch;
  const queries = [
    ['thu', 'all'], ['thử', 'all'], ['nguyen', 'all'], ['nguyễn thị', 'all'], ['thu bay', 'all'], ['"thử bẩn"', 'all'],
    ['khách thử bẩn', 'name'], ['muoi', 'name'], ['muoj', 'name'], ['thuw', 'all'],
    ['0900000003', 'all'], ['+84 900 000 017', 'all'], ['84900000017', 'all'], ['000017', 'all'], ['0900', 'phone'], ['12', 'all'],
    ['marquee', 'all'], ['marquee', 'property'], ['2PN', 'all'], ['2n', 'all'], ['2 phòng ngủ', 'all'], ['đông nam', 'all'],
    ['bảng giá', 'all'], ['bảng giá', 'notes'], ['nhà mẫu', 'all'], ['sổ hồng', 'all'], ['đã có nhà', 'all'], ['tầng cao', 'all'],
    ['1990', 'year'], ['noxh-t12', 'all'], ['website', 'all'], ['không chốt', 'all'], ['nuôi dài hạn', 'all'], ['', 'all'],
  ];
  const results = queries.map(([q, scope]) => {
    const ctx = S.compile(q, scope);
    const hits = customers.map((c) => ({ id: c.id, m: S.match(h.ctx.customerSearchDoc(c), ctx) }))
      .filter((x) => x.m.match).map((x) => ({ id: x.id, score: x.m.score, fuzzy: x.m.fuzzy, highlights: x.m.highlights }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return { q, scope, phoneOnly: ctx.phoneOnly, numeric: ctx.numeric, terms: ctx.terms, hits };
  });
  const fields = Object.fromEntries(customers.map((c) => [c.id, h.ctx.searchFields(c)]));
  return { fields, results };
});

// ─── 7. Ghép căn (CRMPropertySearch + engine vay) ────────────────────────────
add('property-match', 'CRMPropertySearch.typeCompatible / price / match (finance = vốn sẵn có, không phải giá tối đa)', (h, fx) => {
  const customers = setupCustomers(h, fx);
  const P = h.ctx.CRMPropertySearch, E = h.ctx.LoanEngine, S = h.ctx.CRMSearch;
  const projects = Object.fromEntries(fx.catalog.projects.map((p) => [p.id, p]));
  const catalog = { project: (id) => projects[id] || null, unitArea: (u) => u.area_m2 ?? null, unitPrice: (u) => fx.catalog.unitPricePerM2[u.project_id] ?? null };
  const types = ['Studio', '1N-1WC', '1N+, 1WC', '2N-2WC', '2N+, 2WC', '2N-2WC-G', '3N-2WC', '2PN', '2N', '2N+', '3BR', 'Loft', '', null];
  const typeCompatible = {}, apartmentGroup = {};
  for (const a of types) { apartmentGroup[String(a)] = S.apartmentGroup(a); for (const b of types) typeCompatible[`${a} | ${b}`] = P.typeCompatible(a, b); }
  const prices = Object.fromEntries(fx.catalog.units.map((u) => [u.id, P.price(u, catalog, E)]));
  const matches = {};
  for (const c of customers.filter((x) => Array.isArray(x.projects) && x.projects.length)) {
    matches[c.id] = Object.fromEntries(fx.catalog.units.map((u) => [u.id, {
      noMax: P.match(c, u, catalog, E), max1_2ty: P.match(c, u, catalog, E, 1200000000), max2ty: P.match(c, u, catalog, E, 2000000000),
    }]));
  }
  return { apartmentGroup, typeCompatible, prices, matches };
});

// ─── 8. Âm lịch / mệnh / cung / cầm tinh ─────────────────────────────────────
add('lunar', 'LunarUtil: parseDob / mệnh / cung / cầm tinh / đổi âm lịch (gồm dob thiếu năm --MM-DD)', (h) => {
  const L = h.ctx.LunarUtil;
  const dobs = ['1990-12-03', '--05-12', '--02-29', '1985-02-29', '2000-01-01', '1975-02-10', '1975-02-11', '1984-02-02', '1984-02-01',
    '1999-12-31', '2024-02-10', '1990-13-01', '12/05/1990', '', null, 'abc'];
  const perDob = Object.fromEntries(dobs.map((d) => [String(d), {
    parseDob: tryRun(() => L.parseDob(d)), menh: tryRun(() => L.calcMenhFromSolarDOB(d)), cung: tryRun(() => L.calcCungFromDOB(d)),
    camTinh: tryRun(() => L.calcCamTinhFromDOB(d)),
  }]));
  const solar = [[1, 1, 2000], [10, 2, 2024], [9, 2, 2024], [29, 1, 2025], [21, 6, 2026], [17, 2, 2026], [16, 2, 2026], [31, 12, 1999]];
  const lunar = Object.fromEntries(solar.map(([d, m, y]) => [`${d}/${m}/${y}`, tryRun(() => L.convertSolar2Lunar(d, m, y, 7))]));
  const canChi = Object.fromEntries([1975, 1984, 1990, 2000, 2024, 2026].map((y) => [y, tryRun(() => L.getCanChi(y))]));
  return { perDob, lunar, canChi };
});

// ─── 9. Chuẩn hoá số điện thoại ──────────────────────────────────────────────
add('phone', 'normalizePhone (tel:) / normalizePhoneVN (lưu khách, OCR) / phoneDigits / CRMSearch.phone', (h) => {
  const inputs = ['0900000001', '0900 000 001', '090.000.0001', '+84 900 000 017', '+84900000017', '84900000017', '0084900000017',
    '900000001', '84 90 000 0017', '(+84) 90-000-0017', '02253 123 456', '+1 415 555 0100', '123', '', null, ' 0 9 0 0 0 0 0 0 0 1 '];
  return Object.fromEntries(inputs.map((p) => [String(p), {
    normalizePhone: h.ctx.normalizePhone(p), normalizePhoneVN: h.ctx.normalizePhoneVN(p), phoneDigits: h.ctx.phoneDigits(p),
    searchPhone: h.ctx.CRMSearch.phone(p),
  }]));
});

// ─── 10. Bảo toàn thuộc tính lạ khi v1 ghi lại mảng JSONB (D-012 §3.1.3) ─────
add('preservation', 'db.js ghi lại next_tasks / notes_manual / care_stage_history / call_attempts KHÔNG làm rơi thuộc tính lạ (x_*)', async (h, fx) => {
  setupCustomers(h, fx, { normalize: false });
  h.run(`globalThis.__store = new Map(allCustomers.map((c) => [c.id, JSON.parse(JSON.stringify(c))]));
    globalThis.__queue = [];
    localGetAll = async () => [...__store.values()].map((r) => JSON.parse(JSON.stringify(r)));
    localPut = async (r) => { __store.set(r.id, JSON.parse(JSON.stringify(r))); return r; };
    queueAdd = async (op) => { __queue.push(JSON.parse(JSON.stringify(op))); return __queue.length; };
    CRM.flushQueue = async () => {};
    _currentUserId = currentUser.id;
    refreshList = async () => { allCustomers = await CRM.list(); };
    showToast = () => {};`);
  const get = (id) => clone(h.run(`__store.get(${JSON.stringify(id)})`));
  // Mọi đường dẫn tới thuộc tính x_* (thuộc tính "lạ") trong 1 bản ghi.
  const unknownPaths = (rec) => {
    const out = [];
    const walk = (v, p) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { const q = p ? `${p}.${k}` : k; if (k.startsWith('x_')) out.push(`${q}=${JSON.stringify(x)}`); walk(x, q); }
    };
    walk(rec, '');
    return out;
  };
  // So theo GIÁ TRỊ của từng thuộc tính lạ (bỏ chỉ số mảng vì thao tác có thể chèn/xoá phần tử).
  const keyOf = (p) => p.replace(/\[\d+\]/g, '[]');
  const steps = [];
  const A = 'f0000000-0000-4000-8000-000000000017', B = 'f0000000-0000-4000-8000-000000000008';
  async function step(name, id, code, { expectLoss = [] } = {}) {
    const before = get(id);
    const q0 = h.run('__queue.length');
    h.setNow(h.now() + MIN);
    await h.run(code);
    const after = get(id);
    const ops = clone(h.run(`__queue.slice(${q0})`));
    const lost = unknownPaths(before).map(keyOf).filter((p) => !unknownPaths(after).map(keyOf).includes(p));
    const unexpected = lost.filter((p) => !expectLoss.some((e) => p.startsWith(e)));
    assert.deepEqual(unexpected, [], `${name}: v1 làm rơi thuộc tính lạ`);
    const rootUnknownKept = Object.keys(before).filter((k) => k.startsWith('x_')).every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
    assert.ok(rootUnknownKept, `${name}: mất thuộc tính lạ ở gốc bản ghi`);
    steps.push({ name, id, queuedOps: ops.map((o) => ({ type: o.type, payloadKeys: Object.keys(o.payload || {}).sort() })), lostUnknown: lost,
      arrays: { next_tasks: (after.next_tasks || []).length, notes_manual: (after.notes_manual || []).length,
        care_stage_history: (after.care_stage_history || []).length, call_attempts: (after.call_attempts || []).length } });
  }
  const t17 = '2026-11-25T06:00:00.000Z', n17 = '2026-11-25T04:00:00.000Z', h17 = '2026-11-25T03:00:00.000Z';
  await step('addTask', A, `CRM.addTask('${A}', 'Gọi lại chốt lịch', { due: '2026-12-02T02:00:00.000Z' }, 'call')`);
  await step('updateTask (việc có x_side, x_due_original)', A, `CRM.updateTask('${A}', '${t17}', 'Gửi mẫu hợp đồng bản mới', { due: '2026-12-04T16:59:00.000Z', due_allday: true }, 'docs')`);
  await step('completeTask', A, `CRM.completeTask('${A}', '${t17}')`);
  await step('reopenTask', A, `CRM.reopenTask('${A}', '${t17}')`);
  await step('addNote', A, `CRM.addNote('${A}', 'Ghi chú mới')`);
  await step('updateNote (ghi chú có x_by)', A, `CRM.updateNote('${A}', '${n17}', 'Thích tầng cao, view hồ')`);
  await step('updateCareHistoryNote (mốc có x_source)', A, `CRM.updateCareHistoryNote('${A}', '${h17}', 'Đạt — sửa ghi chú')`);
  await step('update đổi bậc (đẩy mốc lịch sử)', A, `CRM.update('${A}', { care_stage: 'Xem dự án', interest_level: 75 }, { careStageNote: 'Đi nhà mẫu' })`);
  await step('update trường thường (patch)', A, `CRM.update('${A}', { apt_floor: 15 })`);
  await step('CRMCalls.ingest (nhật ký máy, ghi lại call_attempts)', A,
    `CRMCalls.ingest([{ id: 'dev-17-1', number: '0900000017', startedAt: Date.parse('2026-12-01T02:45:00.000Z'), durationSec: 37, direction: 'out' }])`,
    { expectLoss: [] });
  await step('updateTask trên khách #8 (việc có x_v2_key)', B, `CRM.updateTask('${B}', '2026-11-28T03:01:00.000Z', 'Hẹn cafe tư vấn vay', null, 'cafe')`);
  await step('deleteTask (xoá việc khác, giữ việc có x_*)', B, `CRM.deleteTask('${B}', '2026-11-27T03:00:00.000Z')`);
  // Hành vi v1 đã biết (không phải thuộc tính lạ): callAttemptsOf() lọc phần tử thiếu 'at' / null,
  // nên đường ghi lại call_attempts từ nhật ký máy (ingest) bỏ các phần tử hỏng đó.
  const final17 = get(A);
  const original17 = fx.customers.find((c) => c.id === A);
  const knownV1Behavior = {
    callAttemptsMalformedDroppedOnRewrite: {
      before: original17.call_attempts.length,
      after: final17.call_attempts.length,
      afterHasEntryWithoutAt: final17.call_attempts.some((a) => !a || !a.at),
      note: 'Ingest ghi lại call_attempts = callAttemptsOf(c).concat(mới) → phần tử null / thiếu at bị bỏ. Thuộc tính lạ của phần tử hợp lệ vẫn giữ.',
    },
  };
  return { steps, finalUnknownPaths: { [A]: unknownPaths(final17), [B]: unknownPaths(get(B)) }, knownV1Behavior };
});

module.exports = { cases };
