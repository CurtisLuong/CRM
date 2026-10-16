import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  { id: 'loan.open', label: 'Tính khoản vay', icon: 'loan', tools: true, run: ({ navigate }) => navigate('/tinh-vay') },
];
