import type { FeatureRoute } from '@/app/routes';

// Bộ component mới (D-028) với dữ liệu mẫu — worker xem ở đây trước khi dựng màn (docs/DESIGN.md).
// Tải lười: trang kéo theo Recharts, không được vào bundle chính (giới hạn precache PWA 2 MB).
export const route: FeatureRoute = {
  path: '/dev/ui-kit',
  handle: { bare: true },
  lazy: async () => ({ Component: (await import('./UiKit')).UiKit }),
};
