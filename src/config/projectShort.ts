// Tên dự án viết tắt trên thẻ khách (Curtis 31/10). Chỉ để hiển thị: DB và hồ sơ giữ tên đầy đủ.
// Dự án mới: Curtis đặt quy tắc viết tắt, thêm vào đây (sửa 1 nơi đổi toàn app).

/** Tên đầy đủ (so không phân biệt hoa thường, bỏ khoảng trắng thừa) → tên ngắn. */
export const PROJECT_SHORT_NAMES: Readonly<Record<string, string>> = {
  'Vin Tràng Cát': 'Vin TC',
  'Marquee Homes': 'Marquee',
};

/** Cụm từ thay trong tên chưa có ở bảng trên (dữ liệu đã quen viết "NOXH …"). */
export const PROJECT_SHORT_PHRASES: readonly (readonly [string, string])[] = [['Nhà ở xã hội', 'NOXH']];
