import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  {
    id: 'notifications.open',
    label: 'Thông báo',
    icon: 'bell',
    tools: true,
    group: 'Tiện ích',
    keywords: 'chuông tín hiệu việc đến hạn',
    run: ({ navigate }) => navigate('/thong-bao'),
  },
];
