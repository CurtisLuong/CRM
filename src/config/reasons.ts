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

// Mã đóng khách lớp 2 — đã lưu thì không đổi nghĩa (D-012).
export const CLOSE_REASONS: Readonly<Record<string, string>> = {
  tai_chinh: 'Chưa phù hợp tài chính',
  thoi_diem: 'Chưa đúng thời điểm',
  khong_co_hang: 'Chưa có sản phẩm phù hợp',
  dieu_kien_phap_ly: 'Điều kiện pháp lý / NOXH',
  vi_tri: 'Vị trí chưa phù hợp',
  chon_du_an_khac: 'Chọn dự án khác',
  mat_lien_lac: 'Không liên lạc được',
  khac: 'Khác',
};
