import type { AppCommand } from '@/app/commands/registry';

export const commands: AppCommand[] = [
  {
    id: 'zalo-templates.open',
    label: 'Mở Mẫu tin Zalo',
    sub: 'Soạn và sửa mẫu tin nhắn chăm sóc khách',
    icon: 'message',
    group: 'Tiện ích',
    tools: true,
    menu: { group: 'tools', label: 'Mẫu tin Zalo', icon: 'message', order: 17 },
    keywords: 'zalo mẫu tin tin nhắn chăm sóc khách',
    run: ({ navigate }) => navigate('/mau-zalo'),
  },
];
