import type { IconName } from '@/config/icons';

/**
 * 4 khu vực chính (D-013, UX_GUIDELINES §2). Path là đường dẫn route của tính năng tương ứng
 * (Sóng 3 tạo route.tsx đúng path này). Đổi nhãn/icon/thứ tự: sửa ở đây.
 */
export const NAV_TABS = [
  { value: 'today', path: '/', label: 'Hôm nay', icon: 'home', question: 'Tôi làm gì ngay?' },
  {
    value: 'customers',
    path: '/khach-hang',
    label: 'Khách hàng',
    icon: 'customers',
    question: 'Tôi biết gì về khách?',
  },
  { value: 'tasks', path: '/cong-viec', label: 'Công việc', icon: 'task', question: 'Toàn bộ cam kết' },
  { value: 'insights', path: '/hieu-qua', label: 'Hiệu quả', icon: 'chart', question: 'Tôi chăm/bán tốt chứ?' },
] as const satisfies ReadonlyArray<{ value: string; path: string; label: string; icon: IconName; question: string }>;

export type NavTabValue = (typeof NAV_TABS)[number]['value'];

/** Tab chứa đường dẫn (deep link /khach-hang/123 → "customers"); null khi ngoài 4 khu vực. */
export function tabForPath(pathname: string): NavTabValue | null {
  if (pathname === '/') return 'today';
  const hit = NAV_TABS.find((t) => t.path !== '/' && (pathname === t.path || pathname.startsWith(`${t.path}/`)));
  return hit?.value ?? null;
}
