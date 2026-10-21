/**
 * NGUỒN DUY NHẤT — menu ⋮ (PF-04). Thêm tính năng chỉ cần khai báo `menu` trong
 * `src/features/<tên>/commands.ts` (nhóm + nhãn ngắn + icon); menu tự gom nhóm, giữ thứ tự dưới đây.
 * Nhóm rỗng không hiện. Lệnh `tools: true` chưa khai báo nhóm rơi vào `MENU_DEFAULT_GROUP` để không biến mất.
 */

export type MenuGroupKey = 'customers' | 'tools' | 'settings';

/** `grid` = ô lưới 2 cột (lối tắt); `rows` = hàng icon trái + mũi tên phải. */
export type MenuGroupKind = 'grid' | 'rows';

export type MenuGroupConfig = {
  key: MenuGroupKey;
  /** Tiêu đề nhóm hiển thị trong menu. */
  title: string;
  kind: MenuGroupKind;
  /** Nhóm nhỏ trước. */
  order: number;
};

export const MENU_GROUPS: readonly MenuGroupConfig[] = [
  { key: 'customers', title: 'Khách hàng', kind: 'grid', order: 10 },
  { key: 'tools', title: 'Công cụ', kind: 'grid', order: 20 },
  { key: 'settings', title: 'Cài đặt', kind: 'rows', order: 30 },
];

/** Lệnh `tools: true` không khai báo nhóm → Công cụ (tính năng cũ/mới không biến mất khỏi menu). */
export const MENU_DEFAULT_GROUP: MenuGroupKey = 'tools';

/** Nhóm cuối luôn có hàng Giao diện (chọn Sáng | Tối | Tự động). */
export const MENU_THEME_GROUP: MenuGroupKey = 'settings';
