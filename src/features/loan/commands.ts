import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  {
    id: 'loan.open',
    label: 'Tính khoản vay',
    icon: 'loan',
    tools: true,
    menu: { group: 'tools', label: 'Tính khoản vay', icon: 'loan', order: 20 },
    run: ({ navigate }) => navigate('/tinh-vay'),
  },
];
