import { useState } from 'react';
import { HeaderSearch, ScrollTitle, type SyncState, SyncStatusButton, useScrolledPast } from '@/components/crm';
import { toast } from '@/components/ui';

export function HeaderControlsDemo() {
  const [target, setTarget] = useState<HTMLParagraphElement | null>(null);
  const [boundary, setBoundary] = useState<HTMLDivElement | null>(null);
  const past = useScrolledPast(target, { boundary });
  const states: SyncState[] = [
    { kind: 'synced', at: '09:30' },
    { kind: 'pending', count: 3 },
    { kind: 'error' },
    { kind: 'offline' },
  ];
  return (
    <div className="space-y-4 rounded-md border border-line bg-surface-100 p-4">
      <HeaderSearch onOpen={() => toast.info('Mở bảng tìm khách')} />
      <div className="flex flex-wrap gap-2">
        {states.map((state) => (
          <SyncStatusButton key={state.kind} state={state} onOpen={() => toast.info('Mở bảng đồng bộ')} />
        ))}
      </div>
      <div
        ref={setBoundary}
        className="sticky top-14 z-10 rounded-md border border-line bg-surface-100 p-3 font-semibold"
      >
        <ScrollTitle title="Hồ sơ khách" replacement="Nguyễn Văn An" detail="35 tuổi" active={past} />
      </div>
      <p ref={setTarget} className="text-body">
        Nguyễn Văn An · Cuộn qua dòng này để đổi tiêu đề mẫu.
      </p>
      <p className="min-h-64 text-caption text-ink-muted">
        Cuộn lên để trở lại tiêu đề ban đầu. Hiệu ứng tuân theo cài đặt giảm chuyển động.
      </p>
    </div>
  );
}
