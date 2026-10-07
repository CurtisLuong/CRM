/**
 * followup.js — NHỊP FOLLOW-UP: gợi ý lần gọi tiếp theo + mẫu tin Zalo theo tình huống.
 *
 * File này chỉ chứa CẤU HÌNH + HÀM THUẦN (không vẽ giao diện, không ghi dữ liệu).
 * app.js / calls.js gọi:
 *   FOLLOWUP.afterCall(c, attempts) → gợi ý sau 1 cuộc gọi (attempts = nhật ký gọi ĐÃ gồm cuộc vừa ghi)
 *   FOLLOWUP.forStage(c, stage)     → gợi ý khi đổi bậc tiến độ / vừa bấm "Đạt"
 *   FOLLOWUP.suggestTemplate(c)     → mã mẫu tin Zalo hợp với tình huống của khách
 *
 * ✏️ MUỐN ĐỔI NHỊP GỌI, KHUNG GIỜ, MẪU TIN MẶC ĐỊNH: chỉ sửa 2 khối FOLLOWUP_CONFIG và
 *    ZALO_TEMPLATES_DEFAULT ngay bên dưới. Hướng dẫn chi tiết + ví dụ: docs/huong-dan-follow-up.md
 *    (Nội dung mẫu tin thì sửa ngay trong app: menu avatar → Mẫu tin Zalo — không cần sửa file.)
 */

// ═══════════════════════ CẤU HÌNH — SỬA Ở ĐÂY ═══════════════════════
const FOLLOWUP_CONFIG = {
  // 1) GỌI KHÔNG ĐƯỢC (không nghe máy / thuê bao / máy bận / cúp máy).
  //    Lần hỏng thứ 1 → gọi lại sau 1 ngày, lần 2 → 2 ngày, lần 3 → 4 ngày, lần 4 → 7 ngày.
  missDelaysDays: [1, 2, 4, 7],
  // Khách MỚI gọi hỏng đủ số lần này (liên tiếp) → gợi ý LOẠI "Không liên lạc được".
  leadMaxAttempts: 5,
  // Khách TIỀM NĂNG gọi hỏng nhiều hơn số mốc ở missDelaysDays → cứ N ngày gọi 1 lần (không gợi ý loại).
  qualifiedMissRepeatDays: 7,

  // 2) KHÁCH MỚI ĐÃ NÓI CHUYỆN ĐƯỢC nhưng chưa bấm Đạt/Loại → nhắc chốt phân loại sau N ngày.
  leadTalkedDays: 1,
  leadTalkedReason: 'Chốt phân loại: Đạt hay Loại',

  // 3) NHỊP THEO BẬC (khách Tiềm năng nói chuyện được, đổi bậc, hoặc vừa Đạt).
  //    days = gọi lại sau mấy ngày; reason = lý do hiện ở lịch hẹn. Bỏ 1 dòng = bậc đó không gợi ý.
  stages: {
    'Đang chăm sóc': { days: 3,  reason: 'Gửi thêm thông tin dự án' },
    'Xem dự án':     { days: 2,  reason: 'Hỏi cảm nhận sau khi xem dự án' },
    'Hỗ trợ hồ sơ':  { days: 2,  reason: 'Nhắc giấy tờ hồ sơ còn thiếu' },
    'Booking':       { days: 3,  reason: 'Nhắc tiến độ đóng tiền / ký HĐMB' },
    'Kí HĐMB':       { days: 30, reason: 'Chăm sóc sau bán, xin giới thiệu' },
  },

  // 4) KHUNG GIỜ GỌI theo NGHỀ NGHIỆP (ô "Nghề nghiệp" trong hồ sơ khách).
  //    main = khung chính; alt = khung dự phòng. Gọi hỏng sẽ ĐỔI LUÂN PHIÊN main ↔ alt
  //    (lần hỏng 1 → alt, lần 2 → main…) để thử giờ khác; khách CÚP MÁY → đổi luôn sang khung kia.
  //    Định dạng "GG:PP-GG:PP" (giờ 24h). Dòng '' = khách chưa rõ nghề.
  slots: {
    'Tự do':           { main: '09:00-11:00', alt: '15:00-17:00' },
    'Công ty, DN':     { main: '12:00-13:00', alt: '18:30-20:00' },
    'Công, viên chức': { main: '11:30-13:00', alt: '17:30-19:00' },
    'Công an, Bộ đội': { main: '11:30-13:00', alt: '19:30-21:00' },
    '':                { main: '09:00-11:00', alt: '19:00-20:30' },
  },
  skipSunday: true, // true = lịch rơi vào Chủ nhật thì dời sang Thứ Hai

  // 5) MẪU ZALO GỢI Ý (mã mẫu ở ZALO_TEMPLATES_DEFAULT). Quy tắc:
  //    • KHÁCH MỚI (tab Khách mới) — theo lịch sử gọi:
  //        đã nói chuyện được → 'thong_tin'; gọi hỏng liên tiếp ≥ leadMissedTemplateAfter → 'goi_nho';
  //        còn lại (chưa gọi / mới hỏng ít lần) → 'chao'.
  //    • KHÁCH TIỀM NĂNG — theo BẬC đang ở (bảng stageTemplate).
  //    Hộp Zalo chỉ hiện 1 mẫu gợi ý; tối đa 2 khi có thêm 1 lý do rõ ràng:
  //        sinh nhật sát ngày → 'sinh_nhat' (lên trước mẫu theo bậc);
  //        khách Tiềm năng gọi hỏng liên tiếp ≥ qualifiedMissedTemplateAfter → thêm 'goi_nho'.
  leadMissedTemplateAfter: 3,       // khách mới gọi hỏng liên tiếp ≥ N lần → mẫu "Gọi chưa được"
  qualifiedMissedTemplateAfter: 3,  // khách Tiềm năng gọi hỏng ≥ N lần → thêm "Gọi chưa được" làm gợi ý thứ 2 (0 = tắt)
  birthdayTemplateDays: 1,          // 0 = chỉ đúng ngày sinh nhật; 1 = hôm nay hoặc ngày mai
  stageTemplate: {
    'Đăng kí mới':   'chao',
    'Đang tiếp cận': 'chao',
    'Đang chăm sóc': 'thong_tin',
    'Xem dự án':     'sau_xem',
    'Hỗ trợ hồ sơ':  'nhac_ho_so',
    'Booking':       'nhac_ho_so',
    'Kí HĐMB':       'chuc_mung',
    'Loại':          'thong_tin',
  },
};

// Mẫu tin MẶC ĐỊNH (lần đầu dùng / bấm "Khôi phục mặc định"). Sửa nội dung trong app là đủ.
// Ô tự điền: {ten} tên gọi · {hoten} họ tên · {du_an} dự án khách quan tâm · anh/chị tự đổi theo giới tính.
const ZALO_TEMPLATES_DEFAULT = [
  { id: 'chao', name: 'Chào kết bạn',
    text: 'Em chào anh/chị {ten} ạ! Em là tư vấn viên dự án nhà ở xã hội. Em xin phép kết bạn để gửi thông tin căn hộ phù hợp tới mình ạ. Em cảm ơn!' },
  { id: 'goi_nho', name: 'Gọi chưa được',
    text: 'Em chào anh/chị {ten} ạ! Em là tư vấn viên nhà ở xã hội dự án {du_an} mà mình đã đăng ký nhận thông tin. Em gọi mấy lần chưa gặp được anh/chị. Anh/chị tiện giờ nào để em gọi lại tư vấn ạ? Hoặc anh/chị cứ nhắn em qua đây cũng được ạ.' },
  { id: 'thong_tin', name: 'Gửi thông tin / bảng giá',
    text: 'Dạ em gửi anh/chị {ten} thông tin dự án {du_an} ạ: mặt bằng, bảng giá và các loại căn đang còn. Anh/chị xem qua, căn nào hợp nhu cầu và tài chính của mình thì nhắn em, em tính chi tiết phương án vay và số tiền cần chuẩn bị cho anh/chị nhé ạ.' },
  { id: 'sau_xem', name: 'Hỏi thăm sau khi xem dự án',
    text: 'Em chào anh/chị {ten} ạ! Hôm trước anh/chị đi xem dự án {du_an}, không biết anh/chị thấy vị trí và căn hộ thế nào ạ? Nếu còn băn khoăn về giá, vay vốn hay hồ sơ, anh/chị cứ nhắn em, em hỗ trợ ngay ạ.' },
  { id: 'nhac_ho_so', name: 'Nhắc giấy tờ hồ sơ',
    text: 'Dạ em chào anh/chị {ten} ạ! Em nhắc mình hồ sơ mua nhà ở xã hội dự án {du_an} còn thiếu: … Anh/chị chuẩn bị giúp em trước ngày … để kịp nộp đợt này nhé ạ. Chỗ nào chưa rõ anh/chị cứ nhắn, em hướng dẫn ạ.' },
  { id: 'sinh_nhat', name: 'Chúc mừng sinh nhật',
    text: 'Em chúc anh/chị {ten} sinh nhật thật vui, nhiều sức khoẻ và mọi việc như ý ạ! Chúc anh/chị và gia đình sớm an cư trong ngôi nhà mới 🏡🎂' },
  { id: 'chuc_mung', name: 'Chúc mừng ký HĐMB / nhận nhà',
    text: 'Em chúc mừng anh/chị {ten} đã chính thức sở hữu căn hộ tại {du_an} ạ! 🎉 Cảm ơn anh/chị đã tin tưởng em suốt thời gian qua. Sau này có việc gì về nhà cửa, giấy tờ anh/chị cứ nhắn em nhé. Người thân, bạn bè có nhu cầu nhà ở xã hội, anh/chị giới thiệu giúp em, em xin hỗ trợ tận tình ạ!' },
];
// ═══════════════════════ HẾT PHẦN CẤU HÌNH ═══════════════════════

(function () {
  'use strict';
  const C = FOLLOWUP_CONFIG;
  // Kết quả gọi coi là "KHÔNG LIÊN LẠC ĐƯỢC" (đếm vào nhịp gọi lại). 'busy' = khách bắt máy, hẹn giờ.
  const MISS = ['no_answer', 'unreachable', 'line_busy', 'hung_up'];
  const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  function parseRange(s) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    return m ? [+m[1], +m[2], +m[3], +m[4]] : [9, 0, 11, 0]; // gõ sai định dạng → 9–11h
  }
  function slotOf(c, which) {
    const s = C.slots[(c && c.occupation) || ''] || C.slots[''] || {};
    return parseRange(s[which] || s.main);
  }
  /** Khung giờ sau `days` ngày (tính từ hôm nay), theo nghề nghiệp. which: 'main' | 'alt'. */
  function windowAfter(c, days, which) {
    const [sh, sm, eh, em] = slotOf(c, which);
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + Math.max(0, days));
    if (C.skipSunday && d.getDay() === 0) d.setDate(d.getDate() + 1);
    const start = new Date(d); start.setHours(sh, sm, 0, 0);
    const end = new Date(d); end.setHours(eh, em, 0, 0);
    // Hẹn trong hôm nay mà khung đã qua → dời sang hôm sau.
    if (end.getTime() <= Date.now()) { start.setDate(start.getDate() + 1); end.setDate(end.getDate() + 1); }
    return { start, end };
  }
  /** "Thứ Sáu 10/10, 09:00–11:00" */
  function label(start, end) {
    const p = (n) => String(n).padStart(2, '0');
    const t = (d) => `${p(d.getHours())}:${p(d.getMinutes())}`;
    return `${WD[start.getDay()]} ${start.getDate()}/${start.getMonth() + 1}, ${t(start)}${end && +end !== +start ? '–' + t(end) : ''}`;
  }
  function schedule(c, days, which, reason) {
    const w = windowAfter(c, days, which);
    return { kind: 'schedule', start: w.start, end: w.end, reason, label: label(w.start, w.end) };
  }
  // Số cuộc gọi hỏng LIÊN TIẾP tính từ cuộc mới nhất (dừng khi gặp cuộc có liên lạc).
  // Cuộc "chưa ghi chú" (tự nạp từ nhật ký máy Android): 0 giây = hỏng; > 0 giây = có bắt máy.
  function trailingMisses(attempts) {
    let n = 0;
    for (let i = attempts.length - 1; i >= 0; i--) {
      const a = attempts[i]; if (!a) continue;
      if (!a.result) {
        if (a.duration === 0) { n++; continue; }
        if (a.duration > 0) break;
        continue;                  // chưa ghi chú, không rõ thời lượng → bỏ qua
      }
      if (!MISS.includes(a.result)) break;
      n++;
    }
    return n;
  }
  function isQ(c) { return !!(c && c.qualified_at); }

  /** Gợi ý khi đổi sang bậc `stage` (hoặc khách Tiềm năng vừa nói chuyện được). null = không gợi ý. */
  function forStage(c, stage) {
    const s = C.stages[stage];
    return s ? schedule(c, s.days, 'main', s.reason) : null;
  }

  /**
   * Gợi ý sau 1 cuộc gọi. attempts = nhật ký gọi (cũ → mới) ĐÃ gồm cuộc vừa ghi.
   * Trả về 1 trong:
   *   { kind:'schedule', start, end, reason, label } — đề xuất lịch gọi lại
   *   { kind:'ask', reason }                         — khách tự hẹn giờ → mở hộp chọn giờ
   *   { kind:'drop', code, text, fallback }          — gợi ý loại (fallback = lịch nếu vẫn muốn gọi)
   *   null                                           — không gợi ý
   */
  function afterCall(c, attempts) {
    const last = attempts[attempts.length - 1];
    const r = last && last.result;
    if (!r) return null;
    if (r === 'busy') return { kind: 'ask', reason: 'Khách hẹn gọi lại' };
    if (r === 'wrong_number') {
      return isQ(c) ? null : { kind: 'drop', code: 'so_sai', text: 'Sai số → gợi ý loại khách (Số sai).', fallback: null };
    }
    if (r === 'talked') {
      if (!isQ(c)) return schedule(c, C.leadTalkedDays, 'main', C.leadTalkedReason);
      return forStage(c, c.care_stage);
    }
    if (!MISS.includes(r)) return null;
    const n = trailingMisses(attempts);
    const arr = C.missDelaysDays;
    const days = n <= arr.length ? arr[n - 1] : (isQ(c) ? C.qualifiedMissRepeatDays : arr[arr.length - 1]);
    let which = n % 2 === 1 ? 'alt' : 'main';                 // luân phiên khung giờ
    if (r === 'hung_up') which = which === 'main' ? 'alt' : 'main'; // cúp máy → đổi khung kia
    const sug = schedule(c, days, which, `Gọi lại (lần ${n + 1})`);
    if (!isQ(c) && n >= C.leadMaxAttempts) {
      return { kind: 'drop', code: 'khong_lien_lac_duoc', text: `Đã gọi ${n} lần liên tiếp không liên lạc được → gợi ý loại khách.`, fallback: sug };
    }
    if (isQ(c) && n > arr.length) sug.reason += ' · khách khó liên lạc, thử nhắn Zalo';
    return sug;
  }

  /**
   * Mẫu Zalo gợi ý → mảng 1–2 phần tử { id, why } (why = lý do, hiện cho sale xem).
   * Mặc định 1 mẫu; chỉ thêm mẫu thứ 2 khi có thêm 1 tình huống rõ ràng (xem cấu hình mục 5).
   */
  function suggestTemplates(c) {
    if (!c) return [{ id: 'chao', why: '' }];
    const calls = Array.isArray(c.call_attempts) ? c.call_attempts.filter((a) => a && a.at).sort((a, b) => a.at.localeCompare(b.at)) : [];
    const misses = trailingMisses(calls);
    if (!isQ(c)) { // KHÁCH MỚI — theo lịch sử gọi, luôn 1 mẫu
      if (calls.some((a) => a.result === 'talked')) return [{ id: 'thong_tin', why: 'Khách mới đã nói chuyện được' }];
      if (misses >= C.leadMissedTemplateAfter) return [{ id: 'goi_nho', why: `Đã gọi ${misses} lần chưa liên lạc được` }];
      return [{ id: 'chao', why: calls.length ? `Khách mới, gọi ${calls.length} lần chưa nói chuyện được` : 'Khách mới chưa liên hệ' }];
    }
    // KHÁCH TIỀM NĂNG — theo bậc; có thể thêm sinh nhật / gọi chưa được (tối đa 2)
    const stage = c.care_stage || 'Đang chăm sóc';
    const out = [{ id: C.stageTemplate[stage] || 'thong_tin', why: `Đang ở bậc "${stage === 'Loại' ? 'Không chốt' : stage}"` }];
    const p = c.dob && window.LunarUtil ? window.LunarUtil.parseDob(c.dob) : null;
    if (p && p.month && p.day && stage !== 'Loại') {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      let b = new Date(t0.getFullYear(), p.month - 1, p.day);
      if (b < t0) b = new Date(t0.getFullYear() + 1, p.month - 1, p.day);
      const d = Math.round((b - t0) / 86400000);
      if (d <= C.birthdayTemplateDays) out.unshift({ id: 'sinh_nhat', why: d === 0 ? 'Hôm nay sinh nhật khách' : `Sinh nhật khách sau ${d} ngày` });
    }
    if (out.length < 2 && C.qualifiedMissedTemplateAfter && misses >= C.qualifiedMissedTemplateAfter) {
      out.push({ id: 'goi_nho', why: `Đã gọi ${misses} lần chưa liên lạc được` });
    }
    return out.filter((x, k) => out.findIndex((y) => y.id === x.id) === k).slice(0, 2);
  }
  function suggestTemplate(c) { return suggestTemplates(c)[0].id; }

  window.FOLLOWUP = { config: C, templatesDefault: ZALO_TEMPLATES_DEFAULT, afterCall, forStage, suggestTemplate, suggestTemplates, windowAfter, label };
})();
