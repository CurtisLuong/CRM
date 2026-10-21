import type { AppCommand } from '@/app/commands/registry';

export const commands: AppCommand[] = [
  {
    id: 'retarget.open',
    label: 'Mở Tệp & Retarget',
    sub: 'Lọc khách, chuẩn bị chiến dịch và đo phản hồi',
    icon: 'retarget',
    group: 'Khách hàng',
    tools: true,
    menu: { group: 'customers', label: 'Tệp & Retarget', icon: 'retarget', order: 20 },
    keywords: 'tệp khách retarget chiến dịch phản hồi zalo',
    run: ({ navigate }) => navigate('/khach-hang/retarget'),
  },
];
