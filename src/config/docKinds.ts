/**
 * NGUỒN DUY NHẤT — D-012 (mã đã lưu không đổi nghĩa). Loại tài liệu khách (kind → nhãn).
 * Port nguyên giá trị từ legacy/js/app.js. Loại giấy tờ mới = thêm 1 dòng.
 */

export const DOC_KIND_LABELS: Readonly<Record<string, string>> = {
  reg_image: 'Ảnh đăng ký',
  cccd: 'CCCD/CMND',
  so_ho_khau: 'Sổ hộ khẩu',
  hop_dong: 'Hợp đồng',
  khac: 'Khác',
};
