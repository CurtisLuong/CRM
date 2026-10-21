import type { AppCommand } from '@/app/commands/registry';

export const commands: AppCommand[] = [
  {
    id: 'catalog.open',
    label: 'Mở Giỏ hàng',
    sub: 'Dự án, toà, căn và khách phù hợp',
    icon: 'apartment',
    group: 'Tiện ích',
    tools: true,
    menu: { group: 'tools', label: 'Giỏ hàng', icon: 'apartment', order: 10 },
    keywords: 'catalog căn hộ dự án toà căn inventory',
    run: ({ navigate }) => navigate('/gio-hang'),
  },
];
