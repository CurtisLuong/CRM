import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  {
    id: 'notifications.open',
    label: 'Thông báo',
    icon: 'bell',
    tools: true,
    group: 'Tiện ích',
    menu: { group: 'settings', label: 'Thông báo', icon: 'bell', order: 10 },
    keywords: 'chuông tín hiệu việc đến hạn',
    run: ({ navigate }) => navigate('/thong-bao'),
  },
];
