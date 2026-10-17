import type { AppCommand } from '@/app/commands';
export const commands: AppCommand[] = [
  {
    id: 'quick-actions.open',
    label: 'Mở thao tác nhanh',
    icon: 'call',
    tools: true,
    order: 10,
    run: ({ navigate }) => navigate('/thao-tac-nhanh'),
  },
  {
    id: 'quick-actions.note',
    label: 'Ghi chú',
    icon: 'note',
    quickAdd: true,
    order: 20,
    run: ({ navigate }) => navigate('/thao-tac-nhanh?action=note'),
  },
  {
    id: 'quick-actions.schedule',
    label: 'Hẹn gọi',
    icon: 'call_sched',
    quickAdd: true,
    order: 30,
    run: ({ navigate }) => navigate('/thao-tac-nhanh?action=schedule'),
  },
];
