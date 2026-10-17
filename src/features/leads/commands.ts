import type { AppCommand } from '@/app/commands';

export const commands: AppCommand[] = [
  {
    id: 'leads.open',
    label: 'Mở Khách mới',
    icon: 'customers',
    tools: true,
    keywords: 'lead khách mới trong phễu',
    order: 22,
    run: ({ navigate }) => navigate('/khach-moi'),
  },
  {
    id: 'leads.quick-add',
    label: 'Khách mới',
    icon: 'customers',
    quickAdd: true,
    keywords: 'thêm khách lead',
    order: 10,
    run: ({ navigate }) => navigate('/intake'),
  },
];
