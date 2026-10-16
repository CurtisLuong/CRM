/**
 * NGUỒN DUY NHẤT — D-001, D-012. Lý do loại khách mới (mã → nhãn). Port nguyên giá trị từ legacy/js/app.js.
 * Mã đã lưu không bao giờ đổi nghĩa; thêm lý do = thêm 1 dòng. 'khac' bắt buộc kèm ghi chú.
 */

export const LEAD_DROP_REASONS: Readonly<Record<string, string>> = {
  gia_cao: 'Chê giá cao',
  pha_campaign: 'Phá campaign',
  khong_du_dieu_kien: 'Không đủ điều kiện',
  khong_lien_lac_duoc: 'Không liên lạc được',
  so_sai: 'Số sai',
  no_xau: 'Nợ xấu',
  do_gia: 'Dò giá',
  to_mo: 'Tò mò',
  khac: 'Khác',
};

// 4 lý do hay gặp nhất (hiện nổi bật).
export const LEAD_DROP_TOP = ['gia_cao', 'pha_campaign', 'khong_du_dieu_kien', 'khong_lien_lac_duoc'] as const;

// Lý do đóng khách lớp 2 (thắng/thua) — khung rỗng, T6.1 điền.
export const CLOSE_REASONS: Readonly<Record<string, string>> = {};
