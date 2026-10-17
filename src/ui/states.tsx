import type { ReactNode } from 'react';
import type { IconName } from '@/config/icons';
import { Button } from './Button';
import { cn } from './cn';
import { Icon } from './Icon';

/** Không có dữ liệu: nói việc tiếp theo hữu ích + (tuỳ chọn) 1 CTA. */
export function EmptyState({
  icon = 'task',
  title,
  hint,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void; icon?: IconName };
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-8 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-2">
        <Icon name={icon} size={24} />
      </span>
      <p className="text-body-strong">{title}</p>
      {hint && <p className="max-w-sm text-small text-text-2">{hint}</p>}
      {action && (
        <Button variant="primary" icon={action.icon} onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** Lỗi tải/ghi: mô tả ngắn + "Thử lại". */
export function ErrorState({
  title = 'Không tải được dữ liệu',
  detail,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-2 px-4 py-8 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger">
        <Icon name="alert" size={24} />
      </span>
      <p className="text-body-strong">{title}</p>
      {detail && <p className="max-w-sm text-small text-text-2">{detail}</p>}
      {onRetry && (
        <Button icon="sync" onClick={onRetry} className="mt-2">
          Thử lại
        </Button>
      )}
    </div>
  );
}

/** Khối giữ chỗ đúng kích thước khi đang tải. Shimmer 1,2s, tắt khi reduced-motion. */
export function Skeleton({ className, tone = 'neutral' }: { className?: string; tone?: 'neutral' | 'ai' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block animate-pulse rounded-control [animation-duration:1.2s] motion-reduce:animate-none',
        tone === 'ai' ? 'bg-ai-bg' : 'bg-surface-2',
        className,
      )}
    />
  );
}

/** Vùng đang tải có nhãn cho screen reader; con là các Skeleton. */
export function Loading({ label = 'Đang tải', children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
