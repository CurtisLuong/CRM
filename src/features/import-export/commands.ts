import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  {
    id: 'import-export.open',
    label: 'Nhập / Xuất dữ liệu',
    icon: 'customers',
    tools: true,
    group: 'Tiện ích',
    keywords: 'excel csv nhập xuất sao lưu',
    run: ({ navigate }) => navigate('/nhap-xuat'),
  },
];
