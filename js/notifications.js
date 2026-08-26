/**
 * notifications.js — "CỔNG THÔNG BÁO" (notification engine) cho CRM.
 *
 * Vai trò: nơi DUY NHẤT định nghĩa "khi nào cần nhắc sale điều gì". app.js chỉ
 * gọi NOTIF.compute(danhSáchKhách) để lấy danh sách thông báo rồi vẽ chuông +
 * đặt badge trên icon app — KHÔNG chứa logic rule nào.
 *
 * ➕ THÊM RULE MỚI (vd sinh nhật, quá hạn booking, chờ Zalo quá X ngày...):
 *    chỉ cần thêm 1 lệnh registerRule({...}) ở khối "CÁC RULE" bên dưới.
 *    Không phải sửa app.js hay chỗ nào khác. Mỗi rule là 1 HÀM THUẦN:
 *    nhận (khách, now) → trả về 1 object thông báo, hoặc null nếu khách này
 *    hiện KHÔNG dính rule đó.
 *
 * Vì sao tách riêng file (không nhét vào app.js): giữ phần "luật nhắc việc" gọn
 * 1 chỗ, dễ đọc/dễ thêm cho người không chuyên; và sau này Tầng 2 (push thật qua
 * Cloudflare Worker) có thể DÙNG LẠI đúng các rule này ở server → không lệch nhau.
 *
 * File này KHÔNG phụ thuộc app.js: mọi hằng số/helper nó cần đều nằm trong đây.
 */

// ─── Cấu hình rule (chỉnh ngưỡng ở 1 chỗ) ──────────────────────────────────
const NOTIF_CONFIG = {
  hotInterestMin: 60, // % quan tâm tối thiểu để tính "khách nóng"
  idleDays: 7,        // số ngày chưa liên hệ thì coi là "nguội"
  callGraceMin: 30,   // phút ân hạn sau khi hết khung giờ gọi vẫn còn nhắc
  // Các bậc "kết thúc chăm sóc" — khách đã xong thì KHÔNG nhắc nữa.
  // (Giữ khớp với CARE_DONE_STAGES trong app.js — nếu đổi 1 bên nhớ đổi bên kia.)
  doneStages: ['Kí HĐMB', 'Loại'],
};

// ─── Helper thời gian (nội bộ, không đụng helper của app.js) ────────────────
function _pad2(n) { return n < 10 ? '0' + n : '' + n; }
function _fmtClock(ts) { const d = new Date(ts); return _pad2(d.getHours()) + ':' + _pad2(d.getMinutes()); }
// "Hôm nay" / "Hôm qua" / "Ngày mai" / "d/m"
function _dayLabel(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === -1) return 'Hôm qua';
  if (diff === 1) return 'Ngày mai';
  return d.getDate() + '/' + (d.getMonth() + 1);
}
function _callWindowLabel(start, end) {
  const tt = _fmtClock(start) + (end !== start ? '–' + _fmtClock(end) : '');
  return _dayLabel(start) + ' ' + tt;
}

/**
 * lastInteractionAt — MỐC LIÊN HỆ CUỐI CÙNG với 1 khách (mili-giây, hoặc null).
 *
 * MỘT hàm duy nhất cho mọi rule kiểu "lâu chưa liên hệ", để định nghĩa "tương tác"
 * thống nhất. Hiện gồm: đổi/ghi thêm care_stage (care_stage_updated_at +
 * care_stage_history) VÀ thêm ghi chú hồ sơ (notes_manual). Sau này thêm kiểu
 * tương tác mới (vd "nhiều note cho 1 care stage") → chỉ mở rộng HÀM NÀY.
 */
function lastInteractionAt(c) {
  const times = [];
  if (c.care_stage_updated_at) times.push(Date.parse(c.care_stage_updated_at));
  if (Array.isArray(c.care_stage_history)) {
    c.care_stage_history.forEach((h) => { if (h && h.at) times.push(Date.parse(h.at)); });
  }
  if (Array.isArray(c.notes_manual)) {
    c.notes_manual.forEach((n) => { if (n && n.at) times.push(Date.parse(n.at)); });
  }
  const valid = times.filter((t) => !isNaN(t));
  if (valid.length) return Math.max.apply(null, valid);
  return c.created_at ? Date.parse(c.created_at) : null; // chưa có tương tác nào → mốc tạo
}

// ─── Bộ đăng ký rule ───────────────────────────────────────────────────────
const NOTIF_RULES = [];
function registerRule(rule) { NOTIF_RULES.push(rule); }

// ============================================================================
//  CÁC RULE — thêm rule mới bằng cách copy 1 khối registerRule bên dưới.
//  Mỗi evaluate(c, now) trả về { level, title, body, sortAt } hoặc null.
//   - level: 'urgent' (đỏ) | 'warn' (cam) | 'info'  → quyết định màu + thứ tự
//   - sortAt: mốc (ms) để sắp xếp trong cùng mức; nhỏ hơn = lên trước (gấp hơn)
// ============================================================================

// RULE 1 — ĐẾN GIỜ GỌI. Khi đã tới khung giờ hẹn (next_call_at → next_call_end,
// cộng ân hạn). Quá giờ mà chưa xác nhận đã gọi → đổi thành "Quên gọi" (vẫn đỏ,
// vẫn nằm trong chuông cho tới khi sale bấm "đã gọi" = xoá lịch). Chưa tới giờ
// (kể cả còn <24h) → KHÔNG vào chuông (chỉ hiện tag đếm ngược trên card).
registerRule({
  key: 'call_due',
  evaluate(c, now) {
    if (!c.next_call_at) return null;
    const start = Date.parse(c.next_call_at);
    if (isNaN(start)) return null;
    const end = c.next_call_end ? Date.parse(c.next_call_end) : start;
    const graceEnd = end + NOTIF_CONFIG.callGraceMin * 60000;
    if (now < start) return null; // chưa đến giờ
    const missed = now > graceEnd;
    return {
      level: 'urgent',
      title: missed ? 'Quên gọi' : 'Đến giờ gọi',
      body: _callWindowLabel(start, end),
      sortAt: start,
    };
  },
});

// RULE 2 — KHÁCH NÓNG NHƯNG NGUỘI. Quan tâm cao (>= hotInterestMin) nhưng đã lâu
// (>= idleDays) chưa có tương tác nào. Bỏ qua khách đã kết thúc chăm sóc.
registerRule({
  key: 'hot_idle',
  evaluate(c, now) {
    if (NOTIF_CONFIG.doneStages.indexOf(c.care_stage) !== -1) return null;
    const interest = c.interest_level || 0;
    if (interest < NOTIF_CONFIG.hotInterestMin) return null;
    const last = lastInteractionAt(c);
    if (last == null) return null;
    const days = Math.floor((now - last) / 86400000);
    if (days < NOTIF_CONFIG.idleDays) return null;
    return {
      level: 'warn',
      title: 'Khách nóng cần liên hệ lại',
      body: 'Quan tâm ' + interest + '% · ' + days + ' ngày chưa liên hệ',
      sortAt: last, // mốc tương tác càng cũ (số nhỏ) → càng gấp → lên trước
    };
  },
});

// ─── Máy chạy rule ─────────────────────────────────────────────────────────
const _LEVEL_RANK = { urgent: 0, warn: 1, info: 2 };

const NOTIF = {
  /** Trả về mảng thông báo (đã sort: gấp trước) từ danh sách khách. */
  compute(customers, now) {
    now = now || Date.now();
    const out = [];
    for (const c of (customers || [])) {
      for (const rule of NOTIF_RULES) {
        let a = null;
        try { a = rule.evaluate(c, now); } catch (e) { console.warn('Rule lỗi:', rule.key, e); continue; }
        if (!a) continue;
        out.push({
          id: rule.key + ':' + c.id,          // định danh duy nhất (rule + khách)
          ruleKey: rule.key,
          level: a.level || 'warn',
          customerId: c.id,
          customerName: c.full_name || '(chưa có tên)',
          title: a.title,
          body: a.body || '',
          sortAt: a.sortAt || 0,
        });
      }
    }
    out.sort((x, y) => (_LEVEL_RANK[x.level] - _LEVEL_RANK[y.level]) || (x.sortAt - y.sortAt));
    return out;
  },

  lastInteractionAt,
  registerRule,
  config: NOTIF_CONFIG,
};

window.NOTIF = NOTIF;
