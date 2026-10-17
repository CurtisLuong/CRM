import type { AppCommand } from '@/app/commands';

export const commands: AppCommand[] = [
  {
    id: 'archived.open',
    label: 'Xem khách đã lưu trữ',
    sub: 'Khách đã ẩn khỏi danh sách · khôi phục được',
    icon: 'history',
    group: 'Khách hàng',
    tools: true,
    keywords: 'lưu trữ đã xoá xoá khách khôi phục thùng rác ẩn',
    run: ({ navigate }) => navigate('/khach-hang/luu-tru'),
  },
];
