/**
 * icons.js — BỘ ICON DÙNG CHUNG TOÀN APP (D-006). NGUỒN DUY NHẤT cho icon của
 * bậc (stage), hành động / loại việc và các khái niệm chính.
 *
 * ✏️ Đổi icon 1 khái niệm = sửa 1 dòng trong ICON_PATHS → mọi chỗ đổi theo
 *    (thanh điều hướng, Tổng quan, hồ sơ, hộp Khách mới, checklist, lịch hẹn...).
 *    KHÔNG vẽ SVG riêng cho khái niệm đã có ở đây. Khái niệm mới → thêm 1 dòng ở đây trước.
 *    Bảng khái niệm → icon: docs/design.md (mục "Icon thống nhất").
 *
 * Dùng:
 *   JS:   icon('call')                     → chuỗi <svg> nét (stroke = currentColor)
 *         icon('call', 'btn-ic')          → kèm class
 *         stageIcon('Booking')            → icon của 1 bậc chăm sóc
 *   HTML: <span class="..." data-icon="call"></span>  → tự điền khi tải trang (hydrateIcons)
 *
 * Icon nét 24×24, stroke 1.8, bo đầu tròn — hợp vibe thẻ nhóm (docs/design.md).
 */
const ICON_PATHS = {
  // ── Điều hướng / khái niệm chính ──
  home:        '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z"/>',                                   // Tổng quan
  customers:   '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M16 14.2a4.6 4.6 0 0 1 4.8 4.8"/>', // Khách hàng · Tiềm năng · Đang chăm sóc
  new_lead:    '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5a6.5 6.5 0 0 1 11.5-4.2"/><path d="M18 14v6M15 17h6"/>', // Khách mới · Thêm khách
  person:      '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',                   // Thông tin cá nhân
  apartment:   '<path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 5v15.5M15 9.5h3.5A1.5 1.5 0 0 1 20 11v9.5M3 20.5h18"/><path d="M8 7.5h1.5M11 7.5h1M8 11h1.5M11 11h1M8 14.5h1.5M11 14.5h1"/>', // Căn hộ · Giỏ hàng
  loan:        '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01"/>', // Tính vay
  note:        '<path d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/>', // Ghi chú · ghi chú cuộc gọi
  history:     '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v3.5h3.5"/><path d="M12 8v4.5l3 1.8"/>', // Lịch sử chăm sóc
  calendar:    '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3.5v3M16 3.5v3M4 10h16"/>', // Lịch hẹn
  bell:        '<path d="M6 9.5a6 6 0 0 1 12 0c0 4.6 1.6 6.2 2.2 6.8H3.8c.6-.6 2.2-2.2 2.2-6.8Z"/><path d="M10 19.5a2.1 2.1 0 0 0 4 0"/>', // Thông báo · Việc cần làm hôm nay
  assign:      { vb: '0 0 30 24', d: '<circle cx="6" cy="8" r="2.8"/><path d="M2 19.5v-1a4 4 0 0 1 8 0v1"/><circle cx="24" cy="10.5" r="2.5"/><path d="M20.3 19.5v-.75a3.7 3.7 0 0 1 7.4 0v.75"/><path d="M11.8 7.5h6.4M16.4 5.7l1.8 1.8-1.8 1.8"/><path d="M18.2 13.5h-6.4M13.6 11.7l-1.8 1.8 1.8 1.8"/>' }, // Giao khách
  // ── Hành động / loại việc ──
  call:        '<path d="M5.2 3.5h2.9l1.4 3.8-1.9 1.3a11 11 0 0 0 5.2 5.2l1.3-1.9 3.8 1.4v2.9a1.6 1.6 0 0 1-1.7 1.6A15.6 15.6 0 0 1 3.6 5.2a1.6 1.6 0 0 1 1.6-1.7z"/>', // Gọi · Cuộc gọi · Ghi cuộc gọi
  call_sched:  '<path d="M5.2 3.5h2.9l1.4 3.8-1.9 1.3a11 11 0 0 0 5.2 5.2l1.3-1.9 3.8 1.4v2.9a1.6 1.6 0 0 1-1.7 1.6A15.6 15.6 0 0 1 3.6 5.2a1.6 1.6 0 0 1 1.6-1.7z"/><circle cx="17.6" cy="6.4" r="3.9"/><path d="M17.6 4.6v1.9l1.3.9"/>', // Hẹn gọi
  call_again:  '<path d="M5.2 3.5h2.9l1.4 3.8-1.9 1.3a11 11 0 0 0 5.2 5.2l1.3-1.9 3.8 1.4v2.9a1.6 1.6 0 0 1-1.7 1.6A15.6 15.6 0 0 1 3.6 5.2a1.6 1.6 0 0 1 1.6-1.7z"/><path d="M15 3.5h5v5M20 3.5l-5.5 5.5"/>', // Gọi lại (chưa liên lạc được)
  talked:      '<path d="M5.2 3.5h2.9l1.4 3.8-1.9 1.3a11 11 0 0 0 5.2 5.2l1.3-1.9 3.8 1.4v2.9a1.6 1.6 0 0 1-1.7 1.6A15.6 15.6 0 0 1 3.6 5.2a1.6 1.6 0 0 1 1.6-1.7z"/><path d="M14.5 6.5a3.5 3.5 0 0 1 3 3M14.5 3a7 7 0 0 1 6.5 6.5"/>', // Nói chuyện được
  message:     '<path d="M4 5.5h16v10.5H9.5L5.5 19.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/>',            // Nhắn tin / Zalo
  cafe:        '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5"/>', // Hẹn cafe
  docs:        '<path d="M14 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-12z"/><path d="M14 3.5v4h4M9 13h6M9 16.5h4"/>', // Hồ sơ · Hỗ trợ hồ sơ · Tài liệu
  visit:       '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>', // Xem dự án · Tham quan nhà mẫu / sa bàn
  booking:     '<path d="M2.5 12.5l3-3 3.5 1.5 3-2 3.5.5 6 3M5.5 9.5l-3 3 4.5 4.5c.7.7 1.8.7 2.5 0l.5-.5"/><path d="M21.5 12.5l-4 4-3.5-3M11 16.5l1.5 1.5c.7.7 1.8.7 2.5 0l3-3"/>', // Booking
  contract:    '<path d="M14 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-12z"/><path d="M14 3.5v4h4"/><path d="M9 16.5c1-1.5 1.8-1.5 2.4 0s1.4 1.5 2.6-.5"/>', // Kí HĐMB · Kí HĐ · Chốt
  task:        '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8.5 9l1.6 1.6L13 7.7M8.5 15h7"/>', // Việc · Việc tiếp theo · Việc cần làm
  drop:        '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',                    // Loại / không chốt
  // ── Tình trạng / nhắc việc ──
  alarm:       '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.3 1.6M4.5 5.5l2.5-2M19.5 5.5l-2.5-2"/>', // Đến giờ / quá giờ hẹn
  decide:      '<path d="M12 4v16M5 20h14M6 8h12M6 8l-2.5 6a3 3 0 0 0 5 0zM18 8l-2.5 6a3 3 0 0 0 5 0z"/>', // Chờ phân loại (Đạt / Loại)
  hot:         '<path d="M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-3.6 3-5.5 3.6-9.3 2.4 1.4 3.6 3.6 3.4 6 1-.6 1.7-1.6 2-2.9 1.9 1.6 3 3.8 3 6.2 0 3.6-2.9 6.2-5.5 6.2z"/>', // Khách nóng
  idle:        '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',                        // Lâu chưa liên hệ · tốc độ gọi
  alert:       '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17.2v.1"/>',                      // Thiếu việc tiếp theo · cảnh báo
  birthday:    '<path d="M4.5 20.5h15V13a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2z"/><path d="M4.5 15.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0M12 11V7.5M12 4.5v.1"/>', // Sinh nhật
};

// Bậc chăm sóc → icon (pipeline, thẻ chỉ số, mọi chỗ hiện bậc kèm icon).
const STAGE_ICON = {
  'Đăng kí mới': 'new_lead', 'Đang tiếp cận': 'call', 'Đang chăm sóc': 'customers', 'Xem dự án': 'visit',
  'Hỗ trợ hồ sơ': 'docs', 'Booking': 'booking', 'Kí HĐMB': 'contract', 'Loại': 'drop',
};

function icon(name, cls) {
  const e = ICON_PATHS[name] || ICON_PATHS.task;
  const vb = typeof e === 'string' ? '0 0 24 24' : e.vb;
  const d = typeof e === 'string' ? e : e.d;
  return `<svg${cls ? ` class="${cls}"` : ''} viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
function stageIcon(stage, cls) { return icon(STAGE_ICON[stage] || 'customers', cls); }
// Điền icon vào mọi phần tử HTML có data-icon (giữ class / kích thước của phần tử bọc ngoài).
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
}
hydrateIcons();
