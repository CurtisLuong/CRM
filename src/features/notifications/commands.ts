import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  {
    id: 'notifications.open',
    label: 'Thông báo',
    icon: 'bell',
    // Curtis 2026-10-21: chuông Thông báo nằm ở header → bỏ khỏi Menu, vẫn có trong Bảng lệnh.
    group: 'Tiện ích',
    keywords: 'chuông tín hiệu việc đến hạn',
    run: ({ navigate }) => navigate('/thong-bao'),
  },
];
