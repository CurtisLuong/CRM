import type { AppCommand } from '@/app/commands';

export const commands: AppCommand[] = [
  {
    id: 'team.open',
    label: 'Đồng nghiệp',
    icon: 'team',
    group: 'Cài đặt',
    tools: true,
    menu: { group: 'settings', label: 'Đồng nghiệp', icon: 'team', order: 20 },
    keywords: 'đồng nghiệp nhóm sale thành viên giao khách',
    run: ({ navigate }) => navigate('/dong-nghiep'),
  },
];
