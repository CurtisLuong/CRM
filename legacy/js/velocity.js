/**
 * velocity.js — TỐC ĐỘ PHỄU (SLA từng giai đoạn) — D-008. NGUỒN DUY NHẤT cho mục tiêu / hạn mức
 * của từng giai đoạn, quy tắc tự xử lý quá hạn và mini-checklist bậc "Booking & Làm hồ sơ".
 *
 * ✏️ Đổi SLA = sửa VELOCITY_CONFIG bên dưới → nhãn SLA trên thẻ / hồ sơ / hộp Khách mới, nhóm
 *    "Quá SLA" ở Tổng quan, phễu ở Phân tích và tự chuyển quá hạn đều đổi theo.
 *    Mô tả cho người dùng: docs/funnel-velocity.md.
 *
 * Mỗi giai đoạn có 2 mốc:
 *   target = mục tiêu lý tưởng (quá mốc này → nhãn VÀNG "quá mục tiêu")
 *   max    = hạn mức tối đa (quá mốc này → nhãn ĐỎ ĐẬM "quá hạn", có thể kèm tự xử lý)
 *
 * Đồng hồ mỗi giai đoạn:
 *   Đăng kí mới   — khách mới chưa gọi lần nào: từ lúc đăng ký (giờ đêm dời sang sáng, xem workHours)
 *                   → dừng khi có cuộc gọi đầu tiên.
 *   Đang tiếp cận — khách mới đã gọi ≥1 lần, chưa Đạt: từ cuộc gọi đầu tiên → dừng khi Đạt / Loại.
 *   Các bậc lớp 2 — từ lúc vào bậc hiện tại (care_stage_history).
 *   sla_anchor_at (nếu có, muộn hơn) = đặt lại đồng hồ (vd mở lại khách mới bị tự loại).
 *   'Nuôi dài hạn' / 'Kí HĐMB' / 'Loại' → ngoài phễu, không tính SLA.
 */
(function () {
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  const VELOCITY_CONFIG = {
    // Tên bậc (care_stage) — khớp CARE_STAGES trong js/app.js + ràng buộc DB (SQL/add_funnel_velocity.sql).
    stageBooking: 'Booking & Làm hồ sơ',
    stageNurture: 'Nuôi dài hạn',
    stageWon: 'Kí HĐMB',
    // Bậc cũ đã gộp (khách cũ / lịch sử cũ) → bậc mới.
    legacyStages: { 'Hỗ trợ hồ sơ': 'Booking & Làm hồ sơ', 'Booking': 'Booking & Làm hồ sơ' },

    phases: {
      new_lead: { label: 'Đăng kí mới',   target: 30 * MIN, max: 4 * HOUR, targetText: '< 30 phút', maxText: '4 giờ',
        rule: 'Cảnh báo. Khách đăng ký sau 22h → tính từ 7h sáng hôm sau.' },
      approach: { label: 'Đang tiếp cận', target: 2 * DAY,  max: 7 * DAY,  targetText: '1–2 ngày',  maxText: '7 ngày',
        auto: 'drop', rule: 'Tối đa gọi 5 lần; quá 7 ngày chưa liên lạc được → tự chuyển Loại "Không liên lạc được".' },
      care:     { stage: 'Đang chăm sóc', label: 'Đang chăm sóc', target: 10 * DAY, max: 20 * DAY, targetText: '7–10 ngày', maxText: '20 ngày',
        auto: 'nurture', goal: 'Chốt lịch xem sa bàn / nhà mẫu / dự án / văn phòng bán hàng',
        rule: 'Quá 20 ngày → tự chuyển Nuôi dài hạn, rút khỏi phễu chính.' },
      visit:    { stage: 'Xem dự án', label: 'Xem dự án', target: 7 * DAY, max: 14 * DAY, targetText: '7 ngày', maxText: '14 ngày',
        goal: 'Chốt Booking', rule: 'Cảnh báo.' },
      booking:  { stage: 'Booking & Làm hồ sơ', label: 'Booking & Làm hồ sơ', target: 45 * DAY, max: 75 * DAY, targetText: '45 ngày', maxText: '2,5 tháng',
        goal: 'Hoàn tất hồ sơ → Ký HĐMB', rule: 'Theo dõi 4 bước hồ sơ bên dưới.' },
    },
    // Thứ tự phễu (5 giai đoạn) — milestone Ký HĐMB đứng sau, không tính giờ.
    order: ['new_lead', 'approach', 'care', 'visit', 'booking'],

    // Giờ tính SLA khách mới: đăng ký trong [start, end) tính ngay; ngoài khung → dời tới resumeAt
    // (sau 22h → 7h sáng hôm sau; 0h–6h → 7h sáng cùng ngày).
    workHours: { start: 6, end: 22, resumeAt: 7 },

    // Mini-checklist bậc Booking & Làm hồ sơ. days = [mục tiêu, hạn] tính từ bước trước xong
    // (bước 1 tính từ lúc vào bậc). Không có days = không tính hạn riêng.
    bookingSteps: [
      { key: 'cu_tru',    label: 'Xác nhận cư trú',             days: [3, 5],   text: '3–5 ngày' },
      { key: 'dk_nha_o',  label: 'Xác nhận điều kiện nhà ở',    days: [12, 15], text: '~15 ngày sau bước 1' },
      { key: 'tham_dinh', label: 'CĐT/Sở thẩm định đạt',        days: [5, 7],   text: '5–7 ngày' },
      { key: 'tb_ky',     label: 'Thông báo ký HĐMB' },
    ],

    // Tự xử lý quá hạn (auto) chỉ tính đồng hồ từ mốc này trở đi → khách cũ đã quá hạn từ trước khi
    // có tính năng được thêm trọn 1 hạn mức tính từ ngày này (không bị chuyển hàng loạt ngay khi cập nhật).
    autoSince: '2026-10-10T00:00:00+07:00',
    autoUndoDays: 3,            // số ngày còn hiện nút "Hoàn tác" sau khi app tự chuyển
    nurtureRecallMonths: 3,     // vào Nuôi dài hạn → hẹn gọi lại sau N tháng (3–6)
    dropReason: 'khong_lien_lac_duoc',
  };
  const C = VELOCITY_CONFIG;

  const ms = (v) => { const t = v ? Date.parse(v) : NaN; return isNaN(t) ? NaN : t; };
  const normStage = (s) => C.legacyStages[s] || s;

  // Mốc bắt đầu SLA khách mới theo giờ đăng ký.
  function newLeadStart(t) {
    if (isNaN(t)) return NaN;
    const d = new Date(t), h = d.getHours(), w = C.workHours;
    if (h >= w.start && h < w.end) return t;
    const r = new Date(d); r.setHours(w.resumeAt, 0, 0, 0);
    if (h >= w.end) r.setDate(r.getDate() + 1);
    return r.getTime();
  }

  // Thời điểm vào bậc hiện tại: lùi trong lịch sử khi còn cùng bậc (bậc cũ đã gộp tính là 1).
  function stageEnteredAt(c) {
    const st = normStage(c.care_stage);
    const h = Array.isArray(c.care_stage_history) ? c.care_stage_history : [];
    let at = NaN;
    for (let i = h.length - 1; i >= 0; i--) {
      const e = h[i]; if (!e) continue;
      if (normStage(e.stage) !== st) break;
      const t = ms(e.at); if (!isNaN(t)) at = t;
    }
    if (isNaN(at)) at = ms(c.care_stage_updated_at) || ms(c.qualified_at) || ms(c.created_at);
    return at;
  }

  function attemptsOf(c) {
    return (Array.isArray(c.call_attempts) ? c.call_attempts : []).filter((a) => a && a.at).sort((a, b) => a.at.localeCompare(b.at));
  }

  // Giai đoạn SLA hiện tại → { key, start } hoặc null (ngoài phễu).
  function phaseOf(c) {
    if (!c) return null;
    const anchor = ms(c.sla_anchor_at);
    const withAnchor = (t) => (isNaN(anchor) || anchor < t ? t : anchor);
    if (!c.qualified_at) {
      if (c.disqualified_at) return null;
      const calls = attemptsOf(c);
      if (!calls.length) return { key: 'new_lead', start: withAnchor(newLeadStart(ms(c.registered_at) || ms(c.created_at))) };
      return { key: 'approach', start: withAnchor(ms(calls[0].at)) };
    }
    const st = normStage(c.care_stage);
    const key = C.order.find((k) => C.phases[k].stage === st);
    if (!key) return null;
    return { key, start: withAnchor(stageEnteredAt(c)) };
  }

  function fmt(d) {
    d = Math.max(0, d);
    if (d < HOUR) return Math.max(1, Math.round(d / MIN)) + ' phút';
    if (d < DAY) return Math.round(d / HOUR) + ' giờ';
    const n = Math.round(d / DAY);
    return n >= 60 ? (Math.round(n / 3) / 10).toString().replace('.', ',') + ' tháng' : n + ' ngày';
  }

  /**
   * Trạng thái SLA của 1 khách → null (ngoài phễu) hoặc
   * { key, label, start, elapsed, target, max, state: 'ok'|'warn'|'over', text, cls }
   *   cls = class màu nhãn đếm ngược dùng chung: ok → call-far, warn → call-soon, over → call-missed.
   */
  function status(c, now) {
    const p = phaseOf(c); if (!p || isNaN(p.start)) return null;
    const cfg = C.phases[p.key];
    now = now || Date.now();
    const elapsed = now - p.start;
    let state = 'ok', text;
    if (elapsed < 0) text = 'SLA tính từ ' + new Date(p.start).getHours() + 'h';
    else if (elapsed < cfg.target) text = 'mục tiêu còn ' + fmt(cfg.target - elapsed);
    else if (elapsed < cfg.max) { state = 'warn'; text = 'quá mục tiêu · còn ' + fmt(cfg.max - elapsed); }
    else { state = 'over'; text = 'quá hạn ' + fmt(elapsed - cfg.max); }
    return { key: p.key, label: cfg.label, start: p.start, elapsed, target: cfg.target, max: cfg.max, state, text,
      cls: state === 'over' ? 'call-missed' : state === 'warn' ? 'call-soon' : 'call-far' };
  }

  // Mini-checklist Booking → [{ key, label, text, doneAt, due, state }] (state: 'done'|'ok'|'warn'|'over'|'wait').
  function bookingSteps(c, now) {
    now = now || Date.now();
    const done = (c && c.booking_steps && typeof c.booking_steps === 'object') ? c.booking_steps : {};
    let prev = stageEnteredAt(c);
    let blocked = false;
    return C.bookingSteps.map((s) => {
      const doneAt = ms(done[s.key]);
      const row = { key: s.key, label: s.label, text: s.text || '', doneAt: isNaN(doneAt) ? null : doneAt, due: null, state: 'wait' };
      if (!isNaN(doneAt)) { row.state = 'done'; prev = doneAt; return row; }
      if (blocked || !s.days || isNaN(prev)) { blocked = true; return row; }
      blocked = true; // các bước sau chờ bước này
      const warnAt = prev + s.days[0] * DAY, due = prev + s.days[1] * DAY;
      row.due = due;
      row.state = now >= due ? 'over' : now >= warnAt ? 'warn' : 'ok';
      return row;
    });
  }

  // Có cần tự xử lý không → { type: 'drop' | 'nurture', phase } | null.
  // Đồng hồ auto = muộn hơn giữa (bắt đầu giai đoạn, autoSince).
  function autoAction(c, now) {
    const p = phaseOf(c); if (!p) return null;
    const cfg = C.phases[p.key]; if (!cfg.auto) return null;
    now = now || Date.now();
    const since = ms(C.autoSince);
    const start = isNaN(since) ? p.start : Math.max(p.start, since);
    if (now - start < cfg.max) return null;
    if (cfg.auto === 'drop' && attemptsOf(c).some((a) => a.result === 'talked')) return null; // đã nói chuyện được → không tự loại
    return { type: cfg.auto, phase: p.key };
  }

  window.VELOCITY = { config: C, phaseOf, status, bookingSteps, autoAction, stageEnteredAt, newLeadStart, normStage, fmt, DAY, HOUR };
})();
