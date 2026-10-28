import { createCn } from 'cn/config';

/**
 * Cỡ chữ, bo góc, bóng riêng của Design System (@theme + @utility trong src/app/index.css).
 * Phải khai báo: thiếu thì `cn` coi `text-label` là màu chữ và xoá nó khi gặp `text-ink-muted`.
 * Thêm/đổi token trong index.css thì sửa danh sách này (src/ui/lib/utils.test.ts so khớp hai nơi).
 */
export const THEME_TEXT_SIZES = [
  'display',
  'title',
  'body',
  'label',
  'caption',
  'numeric',
  'countdown',
  'overline',
  // Tên cũ (D-023), xoá khi hết màn dùng.
  'section',
  'body-strong',
  'small',
  'badge',
  'mono-data',
] as const;
export const THEME_RADII = ['sm', 'md', 'lg', 'control', 'card', 'card-sm', 'sheet'] as const;
export const THEME_SHADOWS = ['glow-alert', 'glow-ion', 'overlay', 'e1', 'e2', 'e3'] as const;

/** Nối class + gộp class Tailwind trùng nhóm (class sau thắng). Mọi component import từ đây, không import thẳng gói `cn`. */
export const cn = createCn({
  extend: {
    theme: { text: [...THEME_TEXT_SIZES], radius: [...THEME_RADII], shadow: [...THEME_SHADOWS] },
  },
});
