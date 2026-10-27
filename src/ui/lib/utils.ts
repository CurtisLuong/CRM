import { createCn } from 'cn/config';

/**
 * Cỡ chữ, bo góc, bóng riêng của Design System (@theme trong src/app/index.css).
 * Phải khai báo: thiếu thì `cn` coi `text-small` là màu chữ và xoá nó khi gặp `text-text-2`.
 * Thêm/đổi token trong index.css thì sửa danh sách này (utils.test.ts so khớp hai nơi).
 */
export const THEME_TEXT_SIZES = [
  'display',
  'title',
  'section',
  'body-strong',
  'body',
  'small',
  'label',
  'badge',
  'mono-data',
] as const;
export const THEME_RADII = ['control', 'card', 'card-sm', 'sheet'] as const;
export const THEME_SHADOWS = ['e1', 'e2', 'e3'] as const;

/** Nối class + gộp class Tailwind trùng nhóm (class sau thắng). Component shadcn trong src/ui/shadcn import từ đây, không import thẳng gói `cn`. */
export const cn = createCn({
  extend: {
    theme: { text: [...THEME_TEXT_SIZES], radius: [...THEME_RADII], shadow: [...THEME_SHADOWS] },
  },
});
