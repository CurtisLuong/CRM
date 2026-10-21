import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  {
    id: 'settings.open',
    label: 'Cài đặt',
    icon: 'settings',
    tools: true,
    group: 'Tiện ích',
    menu: { group: 'settings', label: 'Cài đặt', icon: 'settings', order: 30 },
    keywords: 'mẫu zalo ai giao diện apk tài khoản',
    run: ({ navigate }) => navigate('/cai-dat'),
  },
];
