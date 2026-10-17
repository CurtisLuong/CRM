/**
 * NGUỒN DUY NHẤT — D-005. Khung giờ gọi, nhịp follow-up, mẫu tin Zalo mặc định.
 * Port nguyên giá trị từ legacy/js/followup.js (FOLLOWUP_CONFIG, ZALO_*). Sửa 1 chỗ ở đây = đổi toàn app.
 * Hướng dẫn cho người dùng: docs/huong-dan-follow-up.md. Logic (afterCall, forStage…): src/domain/followup.
 * Test tests/config/followup.test.ts so deep equal với v1 — đổi giá trị thì đổi cả v1 hoặc ghi quyết định.
 */

export type CallSlotKey = 'A' | 'B' | 'C' | 'D';

export const FOLLOWUP_CONFIG = {
  // ★ KHUNG GIỜ GỌI DÙNG CHUNG TOÀN APP (D-005). Định dạng "GG:PP-GG:PP" (24h); name = chữ trên nút.
  callSlots: {
    A: { range: '09:00-10:00', name: 'Sáng' },
    B: { range: '11:30-12:15', name: 'Trưa' },
    C: { range: '14:30-15:30', name: 'Chiều' },
    D: { range: '20:00-20:45', name: 'Tối' },
  },

  // 0) NHỊP GỌI KHÁCH MỚI (lead) — 5 lần, xoay 4 khung callSlots (chốt 2026-10-08).
  leadPriority: ['D', 'C', 'B', 'A'],
  leadFirstCallMinutes: 15, // lần 1 sớm nhất N phút sau khi lead về
  leadSecondWithinHours: 24, // lần 2 trong N giờ kể từ đăng ký…
  leadSecondTargetHours: 12, // …ưu tiên quanh mốc N giờ sau đăng ký
  leadGapHours: [24, 48, 96], // lần 3, 4, 5 cách lần trước ít nhất N giờ
  leadBestSlotMinCalls: 5, // khung cần ≥ N cuộc đã ghi kết quả mới tính "phản hồi tốt nhất"
  leadMaxAttempts: 5, // gọi hỏng liên tiếp đủ N lần → Loại "Không liên lạc được" + nhắn Zalo

  // 1) KHÁCH TIỀM NĂNG GỌI KHÔNG ĐƯỢC: lần hỏng 1 → 1 ngày, 2 → 2, 3 → 4, 4 → 7.
  missDelaysDays: [1, 2, 4, 7],
  qualifiedMissRepeatDays: 7, // hỏng nhiều hơn số mốc trên → cứ N ngày gọi 1 lần

  // 2) KHÁCH MỚI ĐÃ NÓI CHUYỆN ĐƯỢC nhưng chưa Đạt/Loại → nhắc chốt phân loại sau N ngày.
  leadTalkedDays: 1,
  leadTalkedReason: 'Chốt phân loại: Đạt hay Loại',

  // 3) NHỊP THEO BẬC: days = gọi lại sau mấy ngày; reason = lý do hiện ở lịch hẹn.
  stages: {
    'Đang chăm sóc': { days: 3, reason: 'Gửi thêm thông tin dự án' },
    'Xem dự án': { days: 2, reason: 'Hỏi cảm nhận sau khi xem dự án' },
    'Booking & Làm hồ sơ': { days: 3, reason: 'Nhắc giấy tờ / tiến độ hồ sơ' },
    'Nuôi dài hạn': { days: 90, reason: 'Liên hệ lại khách nuôi dài hạn' }, // 3 tháng (velocity nurtureRecallMonths)
    'Kí HĐMB': { days: 30, reason: 'Chăm sóc sau bán, xin giới thiệu' },
  },

  // 4) KHÁCH TIỀM NĂNG: khung theo nghề nghiệp. main/alt = mã khung; '' = chưa rõ nghề.
  occupationSlots: {
    'Tự do': { main: 'A', alt: 'C' },
    'Công ty, DN': { main: 'B', alt: 'D' },
    'Công, viên chức': { main: 'B', alt: 'D' },
    'Công an, Bộ đội': { main: 'B', alt: 'D' },
    '': { main: 'A', alt: 'D' },
  },
  skipSunday: true, // lịch rơi vào Chủ nhật → dời sang Thứ Hai (cả nhịp khách mới)

  // 5) MẪU ZALO GỢI Ý (mã ở ZALO_TEMPLATES_DEFAULT).
  leadMissedTemplateAfter: 3, // khách mới gọi hỏng liên tiếp ≥ N lần → mẫu "Gọi chưa được"
  qualifiedMissedTemplateAfter: 3, // khách Đang chăm gọi hỏng ≥ N lần → thêm "Gọi chưa được" (0 = tắt)
  birthdayTemplateDays: 1, // 0 = chỉ đúng ngày sinh nhật; 1 = hôm nay hoặc ngày mai
  stageTemplate: {
    'Đăng kí mới': 'chao',
    'Đang tiếp cận': 'chao',
    'Đang chăm sóc': 'thong_tin',
    'Xem dự án': 'sau_xem',
    'Booking & Làm hồ sơ': 'nhac_ho_so',
    'Nuôi dài hạn': 'thong_tin',
    'Kí HĐMB': 'chuc_mung',
    Loại: 'thong_tin',
  },
} as const satisfies {
  callSlots: Record<CallSlotKey, { range: string; name: string }>;
  leadPriority: readonly CallSlotKey[];
  occupationSlots: Record<string, { main: CallSlotKey; alt: CallSlotKey }>;
  stages: Record<string, { days: number; reason: string }>;
  stageTemplate: Record<string, string>;
  [k: string]: unknown;
};

// Ô tự điền: {ten} tên gọi · {hoten} họ tên · {sale} tên người gửi (chưa có → ZALO_SENDER_NAME) ·
// {du_an} dự án khách quan tâm · anh/chị tự đổi theo giới tính.
export const ZALO_SENDER_NAME = 'Duy';

export type ZaloTemplate = { id: string; name: string; text: string };

// Mẫu tin MẶC ĐỊNH (lần đầu dùng / bấm "Khôi phục mặc định").
export const ZALO_TEMPLATES_DEFAULT: readonly ZaloTemplate[] = [
  {
    id: 'chao',
    name: 'Chào kết bạn',
    text: 'Em chào anh/chị {ten} ạ! Em là {sale}, phòng kinh doanh dự án {du_an}. Em xin phép kết bạn để gửi thông tin căn hộ phù hợp tới anh/chị ạ. Em cảm ơn anh/chị!',
  },
  {
    id: 'goi_nho',
    name: 'Gọi chưa được',
    text: 'Em chào anh/chị {ten} ạ! Em là {sale}, phòng kinh doanh dự án {du_an} mà anh/chị đã đăng ký nhận thông tin. Em gọi mấy lần chưa gặp được anh/chị. Anh/chị tiện giờ nào để em gọi lại tư vấn ạ? Hoặc anh/chị cứ nhắn em qua đây cũng được ạ.',
  },
  {
    id: 'thong_tin',
    name: 'Gửi thông tin / bảng giá',
    text: 'Dạ em chào anh/chị {ten} ạ! Em là {sale}, phòng kinh doanh dự án {du_an}. Em gửi anh/chị thông tin dự án: mặt bằng, bảng giá và các loại căn đang còn. Anh/chị xem qua, căn nào hợp nhu cầu và tài chính thì nhắn em, em tính chi tiết phương án vay và số tiền cần chuẩn bị cho anh/chị nhé ạ.',
  },
  {
    id: 'sau_xem',
    name: 'Hỏi thăm sau khi xem dự án',
    text: 'Em chào anh/chị {ten} ạ! Em là {sale}, phòng kinh doanh dự án {du_an}. Hôm trước anh/chị đi xem dự án, không biết anh/chị thấy vị trí và căn hộ thế nào ạ? Nếu còn băn khoăn về giá, vay vốn hay hồ sơ, anh/chị cứ nhắn em, em hỗ trợ ngay ạ.',
  },
  {
    id: 'nhac_ho_so',
    name: 'Nhắc giấy tờ hồ sơ',
    text: 'Dạ em chào anh/chị {ten} ạ! Em là {sale}, phòng kinh doanh dự án {du_an}. Em nhắc anh/chị hồ sơ mua nhà ở xã hội còn thiếu: … Anh/chị chuẩn bị giúp em trước ngày … để kịp nộp đợt này nhé ạ. Chỗ nào chưa rõ anh/chị cứ nhắn, em hướng dẫn ạ.',
  },
  {
    id: 'sinh_nhat',
    name: 'Chúc mừng sinh nhật',
    text: 'Em chào anh/chị {ten} ạ! Em là {sale}, phòng kinh doanh dự án {du_an}. Em chúc anh/chị sinh nhật thật vui, nhiều sức khoẻ và mọi việc như ý ạ! Chúc anh/chị và gia đình sớm an cư trong ngôi nhà mới 🏡🎂',
  },
  {
    id: 'chuc_mung',
    name: 'Chúc mừng ký HĐMB / nhận nhà',
    text: 'Em chào anh/chị {ten} ạ! Em là {sale}, phòng kinh doanh dự án {du_an}. Em chúc mừng anh/chị đã chính thức sở hữu căn hộ ạ! 🎉 Cảm ơn anh/chị đã tin tưởng em suốt thời gian qua. Sau này có việc gì về nhà cửa, giấy tờ anh/chị cứ nhắn em nhé. Người thân, bạn bè có nhu cầu nhà ở xã hội, anh/chị giới thiệu giúp em, em xin hỗ trợ tận tình ạ!',
  },
];

// Nội dung mặc định CŨ (trước 2026-10-08): mẫu nào sale chưa sửa (còn y bản cũ) → tự nâng lên bản mới.
export const ZALO_TEMPLATES_PREVIOUS: Readonly<Record<string, string>> = {
  chao: 'Em chào anh/chị {ten} ạ! Em là tư vấn viên dự án nhà ở xã hội. Em xin phép kết bạn để gửi thông tin căn hộ phù hợp tới mình ạ. Em cảm ơn!',
  goi_nho:
    'Em chào anh/chị {ten} ạ! Em là tư vấn viên nhà ở xã hội dự án {du_an} mà mình đã đăng ký nhận thông tin. Em gọi mấy lần chưa gặp được anh/chị. Anh/chị tiện giờ nào để em gọi lại tư vấn ạ? Hoặc anh/chị cứ nhắn em qua đây cũng được ạ.',
  thong_tin:
    'Dạ em gửi anh/chị {ten} thông tin dự án {du_an} ạ: mặt bằng, bảng giá và các loại căn đang còn. Anh/chị xem qua, căn nào hợp nhu cầu và tài chính của mình thì nhắn em, em tính chi tiết phương án vay và số tiền cần chuẩn bị cho anh/chị nhé ạ.',
  sau_xem:
    'Em chào anh/chị {ten} ạ! Hôm trước anh/chị đi xem dự án {du_an}, không biết anh/chị thấy vị trí và căn hộ thế nào ạ? Nếu còn băn khoăn về giá, vay vốn hay hồ sơ, anh/chị cứ nhắn em, em hỗ trợ ngay ạ.',
  nhac_ho_so:
    'Dạ em chào anh/chị {ten} ạ! Em nhắc mình hồ sơ mua nhà ở xã hội dự án {du_an} còn thiếu: … Anh/chị chuẩn bị giúp em trước ngày … để kịp nộp đợt này nhé ạ. Chỗ nào chưa rõ anh/chị cứ nhắn, em hướng dẫn ạ.',
  sinh_nhat:
    'Em chúc anh/chị {ten} sinh nhật thật vui, nhiều sức khoẻ và mọi việc như ý ạ! Chúc anh/chị và gia đình sớm an cư trong ngôi nhà mới 🏡🎂',
  chuc_mung:
    'Em chúc mừng anh/chị {ten} đã chính thức sở hữu căn hộ tại {du_an} ạ! 🎉 Cảm ơn anh/chị đã tin tưởng em suốt thời gian qua. Sau này có việc gì về nhà cửa, giấy tờ anh/chị cứ nhắn em nhé. Người thân, bạn bè có nhu cầu nhà ở xã hội, anh/chị giới thiệu giúp em, em xin hỗ trợ tận tình ạ!',
};
