import type { AppCommand } from '@/app/commands/registry';

export const commands: AppCommand[] = [
  {
    id: 'send-kit.open',
    label: 'Mở Tài liệu gửi khách',
    sub: 'Quản lý nội dung và tệp gửi qua Zalo',
    icon: 'docs',
    group: 'Tiện ích',
    tools: true,
    menu: { group: 'tools', label: 'Tài liệu', icon: 'docs', order: 15 },
    keywords: 'tài liệu gửi khách zalo ảnh video pdf',
    run: ({ navigate }) => navigate('/tai-lieu'),
  },
];
