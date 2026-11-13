import { Navigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';

// Curtis 12/11: bỏ màn Thông báo + chuông (trùng Hôm nay). Giữ đường cũ để link/lối tắt đã lưu về Hôm nay.
export const route: FeatureRoute = {
  path: '/thong-bao',
  element: <Navigate to="/" replace />,
};
