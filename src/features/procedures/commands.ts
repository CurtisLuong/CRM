import type { AppCommand } from '@/app/commands/registry';

export const commands: AppCommand[] = [
  {
    id: 'procedures.open',
    label: 'Mở Thủ tục',
    sub: 'Điều kiện mua NOXH và hồ sơ theo đối tượng',
    icon: 'file',
    group: 'Tiện ích',
    tools: true,
    menu: { group: 'tools', label: 'Thủ tục', icon: 'file', order: 16 },
    keywords: 'thủ tục noxh nhà ở xã hội điều kiện hồ sơ',
    run: ({ navigate }) => navigate('/thu-tuc'),
  },
];
